import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface ReleaseEntry {
  sha: string;
  author: string;
  date: string;
  subject: string;
  body: string;
}

interface BuildInfo {
  version: string;
  gitSha: string;
  generatedAt: string;
  entries: ReleaseEntry[];
}

let cachedBuildInfo: BuildInfo | undefined;

/**
 * Loads version + release notes from the pre-baked dist/build-info.json
 * (created by `npm run build:release-notes`). Falls back to live `git log`
 * for dev convenience when the file isn't present yet.
 */
async function loadBuildInfo(): Promise<BuildInfo> {
  if (cachedBuildInfo) return cachedBuildInfo;

  let version = "0.0.0";
  try {
    const pkg = JSON.parse(
      await readFile(path.resolve(process.cwd(), "package.json"), "utf-8"),
    ) as { version?: string };
    version = pkg.version ?? "0.0.0";
  } catch {
    // Fall through to default.
  }

  // Prefer the build-time snapshot.
  try {
    const raw = await readFile(
      path.resolve(process.cwd(), "dist", "build-info.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as BuildInfo;
    cachedBuildInfo = { ...parsed, version: parsed.version ?? version };
    return cachedBuildInfo;
  } catch {
    // No snapshot — fall back to live git log (dev mode).
  }

  const FS = "\x1f";
  const RS = "\x1e";
  let entries: ReleaseEntry[] = [];
  let gitSha = "";
  try {
    const { stdout } = await execFileAsync(
      "git",
      [
        "-C", process.cwd(),
        "log", "-50",
        `--pretty=format:%H${FS}%an${FS}%aI${FS}%s${FS}%b${RS}`,
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    );
    entries = stdout
      .split(RS)
      .map((chunk) => chunk.replace(/^\n+/, "").trim())
      .filter((chunk) => chunk.length > 0)
      .map((chunk) => {
        const [sha, author, date, subject, ...rest] = chunk.split(FS);
        return {
          sha: (sha ?? "").slice(0, 7),
          author: author ?? "",
          date: date ?? "",
          subject: subject ?? "",
          body: rest.join(FS).trim(),
        };
      });
    try {
      const r = await execFileAsync("git", ["-C", process.cwd(), "rev-parse", "--short", "HEAD"]);
      gitSha = r.stdout.trim();
    } catch {
      // ignore
    }
  } catch (err) {
    logger.warn({ err }, "loadBuildInfo: git log fallback failed; release notes will be empty");
  }

  cachedBuildInfo = {
    version,
    gitSha,
    generatedAt: new Date().toISOString(),
    entries,
  };
  return cachedBuildInfo;
}
import { Operator, Tenant, ApiToken, Member } from "../db/models/index.js";
import type { OperatorDoc, TenantDoc } from "../db/models/index.js";
import { asyncHandler } from "../api/async-handler.js";
import { attachOperator, requireOperator, requireRoot } from "./session.js";
import { hashPassword, verifyPassword, timingSafeEqual } from "./passwords.js";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";
import { generateToken } from "../auth/tokens.js";
import { parseExportAll, writeExportAll } from "../ingest/xlsx-parser.js";
import { generateSyntheticMembers } from "../ingest/synthetic.js";
import type {
  ConsentDistribution,
  RoleProportions,
  SyntheticOptions,
} from "../ingest/synthetic.js";
import { upsertMembers } from "../ingest/upsert.js";
import { toSalesforceMember } from "../api/member-mapper.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname);
    cb(null, ok);
  },
});

const loginSchema = z.object({
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  bootstrapToken: z.string().min(16).optional(),
}).refine(
  (v) => (v.username && v.password) || v.bootstrapToken,
  { message: "Provide either username+password or bootstrapToken" },
);

const createTenantSchema = z.object({
  code: z.string().trim().min(2).max(6)
    .regex(/^[A-Z0-9]+$/i, "code must be alphanumeric"),
  kind: z.enum(["group", "area"]),
  name: z.string().trim().min(1).max(120).optional(),
});

const createTokenSchema = z.object({
  label: z.string().trim().min(1).max(80),
});

const probability = z.coerce.number().min(0).max(1);

const consentIndependentSchema = z.object({
  mode: z.literal("independent"),
  emailMarketingConsent: probability,
  groupMarketingConsent: probability,
  areaMarketingConsent: probability,
  otherMarketingConsent: probability,
  postDirectMarketing: probability,
  telephoneDirectMarketing: probability,
});

const consentJointSchema = z.object({
  mode: z.literal("joint"),
  combinations: z.array(z.object({
    emailMarketingConsent: z.boolean(),
    groupMarketingConsent: z.boolean(),
    areaMarketingConsent: z.boolean(),
    otherMarketingConsent: z.boolean(),
    postDirectMarketing: z.boolean(),
    telephoneDirectMarketing: z.boolean(),
    weight: z.coerce.number().min(0).max(100),
  })).min(1),
});

const consentDistributionSchema = z.discriminatedUnion("mode", [
  consentIndependentSchema,
  consentJointSchema,
]);

const roleProportionsSchema = z.object({
  walkLeader: probability,
  emailSender: probability,
  viewMembershipData: probability,
});

const generateSchema = z.object({
  count: z.coerce.number().int().min(1).max(10_000),
  seed: z.coerce.number().int().optional(),
  downloadOnly: z.coerce.boolean().optional(),
  emailTemplate: z.string().trim().min(3).max(200).optional(),
  emailDomain: z.string().trim().min(3).max(120).optional(),
  emailBase: z.string().trim().min(1).max(64).optional(),
  consentDistribution: consentDistributionSchema.optional(),
  roleProportions: roleProportionsSchema.optional(),
  region: z.enum(["mixed", "kent", "staffordshire", "newcastle", "hampshire"]).optional(),
});

const createOperatorSchema = z.object({
  username: z.string().trim().min(3).max(40).toLowerCase(),
  password: z.string().min(12).max(100),
  label: z.string().trim().min(1).max(120).optional(),
});

const resetOperatorPasswordSchema = z.object({
  password: z.string().min(12).max(100).optional(),
});

const RESET_PASSWORD_LENGTH = 20;
const RESET_PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generateRandomPassword(length: number = RESET_PASSWORD_LENGTH): string {
  const bytes = new Uint32Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += RESET_PASSWORD_ALPHABET[bytes[i]! % RESET_PASSWORD_ALPHABET.length];
  }
  return out;
}

function viewOperator(op: OperatorDoc): Record<string, unknown> {
  return {
    username: op.username,
    isRoot: op.isRoot,
    label: op.label,
    createdAt: op.createdAt,
    lastLoginAt: op.lastLoginAt,
  };
}

function viewTenant(t: TenantDoc): Record<string, unknown> {
  return {
    code: t.code,
    kind: t.kind,
    name: t.name,
    ownerOperator: t.ownerOperator,
    createdAt: t.createdAt,
    lastIngestAt: t.lastIngestAt,
    lastIngestCount: t.lastIngestCount,
  };
}

async function assertOwnsTenant(code: string, operator: OperatorDoc): Promise<TenantDoc> {
  const tenant = await Tenant.findOne({ code: code.toUpperCase() }).exec();
  if (!tenant) {
    throw Object.assign(new Error("Tenant not found"), { status: 404 });
  }
  if (!operator.isRoot && tenant.ownerOperator !== operator.username) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  return tenant;
}

export function createAdminRouter(): Router {
  const router = Router();
  router.use(attachOperator);

  function sendAdminShell(res: Response): void {
    res.set("Cache-Control", "no-store, must-revalidate");
    res.sendFile(path.resolve(process.cwd(), "public", "admin.html"));
  }

  router.get("/admin/login", (_req, res) => {
    sendAdminShell(res);
  });

  router.get("/admin", (req, res) => {
    if (req.operator) {
      res.redirect("/admin/dashboard");
    } else {
      res.redirect("/admin/login");
    }
  });

  router.get("/admin/dashboard", requireOperator("redirect"), (_req, res) => {
    sendAdminShell(res);
  });

  router.get("/admin/release-notes", (_req, res) => {
    sendAdminShell(res);
  });

  router.post(
    "/admin/api/login",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: parsed.error.message } });
        return;
      }
      const { username, password, bootstrapToken } = parsed.data;
      const config = loadConfig();

      let op: OperatorDoc | null = null;

      if (bootstrapToken) {
        if (!config.BOOTSTRAP_TOKEN || !timingSafeEqual(bootstrapToken, config.BOOTSTRAP_TOKEN)) {
          res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid bootstrap token" } });
          return;
        }
        op = await Operator.findOne({ username: config.ADMIN_USERNAME }).exec();
      } else if (username && password) {
        op = await Operator.findOne({ username }).exec();
        if (!op || !(await verifyPassword(password, op.passwordHash))) {
          res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid credentials" } });
          return;
        }
      }

      if (!op) {
        res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid credentials" } });
        return;
      }

      op.lastLoginAt = new Date();
      await op.save();
      req.session.operatorId = String(op._id);
      res.json({ operator: viewOperator(op) });
    }),
  );

  router.post(
    "/admin/api/logout",
    asyncHandler(async (req: Request, res: Response) => {
      await new Promise<void>((resolve, reject) => {
        req.session.destroy((err) => (err ? reject(err) : resolve()));
      });
      res.json({ ok: true });
    }),
  );

  router.get(
    "/admin/api/me",
    requireOperator(),
    (req: Request, res: Response) => {
      res.json({ operator: viewOperator(req.operator!) });
    },
  );

  router.get(
    "/admin/api/tenants",
    requireOperator(),
    asyncHandler(async (req: Request, res: Response) => {
      const op = req.operator!;
      const filter = op.isRoot ? {} : { ownerOperator: op.username };
      const tenants = await Tenant.find(filter).sort({ code: 1 }).exec();
      res.json({ tenants: tenants.map(viewTenant) });
    }),
  );

  router.post(
    "/admin/api/tenants",
    requireOperator(),
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = createTenantSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: parsed.error.message } });
        return;
      }
      const { code, kind, name } = parsed.data;
      const normalised = code.toUpperCase();
      const existing = await Tenant.findOne({ code: normalised }).exec();
      if (existing) {
        res.status(409).json({ error: { code: "CONFLICT", message: `Tenant ${normalised} already exists` } });
        return;
      }
      const tenant = await Tenant.create({
        code: normalised,
        kind,
        name,
        ownerOperator: req.operator!.username,
        createdAt: new Date(),
      });
      res.status(201).json({ tenant: viewTenant(tenant) });
    }),
  );

  router.get(
    "/admin/api/tenants/:code/tokens",
    requireOperator(),
    asyncHandler(async (req: Request, res: Response) => {
      const tenant = await assertOwnsTenant(req.params["code"]!, req.operator!);
      const tokens = await ApiToken.find({ tenantCode: tenant.code }).sort({ createdAt: -1 }).exec();
      res.json({
        tokens: tokens.map((t) => ({
          id: String(t._id),
          prefix: t.tokenPrefix,
          tenantCode: t.tenantCode,
          label: t.label,
          createdAt: t.createdAt,
          lastUsedAt: t.lastUsedAt,
          revokedAt: t.revokedAt,
        })),
      });
    }),
  );

  router.post(
    "/admin/api/tenants/:code/tokens",
    requireOperator(),
    asyncHandler(async (req: Request, res: Response) => {
      const tenant = await assertOwnsTenant(req.params["code"]!, req.operator!);
      const parsed = createTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: parsed.error.message } });
        return;
      }
      const generated = generateToken(tenant.code);
      await ApiToken.create({
        tokenHash: generated.hash,
        tokenPrefix: generated.prefix,
        tenantCode: tenant.code,
        ownerOperator: req.operator!.username,
        label: parsed.data.label,
        createdAt: new Date(),
      });
      res.status(201).json({
        token: generated.plaintext,
        prefix: generated.prefix,
        tenantCode: tenant.code,
        warning: "This is the only time the token will be shown. Copy it now.",
      });
    }),
  );

  router.post(
    "/admin/api/tenants/:code/tokens/:id/revoke",
    requireOperator(),
    asyncHandler(async (req: Request, res: Response) => {
      const tenant = await assertOwnsTenant(req.params["code"]!, req.operator!);
      const result = await ApiToken.updateOne(
        { _id: req.params["id"], tenantCode: tenant.code, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } },
      );
      res.json({ revoked: result.modifiedCount === 1 });
    }),
  );

  router.post(
    "/admin/api/tenants/:code/upload",
    requireOperator(),
    upload.single("file"),
    asyncHandler(async (req: Request, res: Response) => {
      const tenant = await assertOwnsTenant(req.params["code"]!, req.operator!);
      if (!req.file) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: "No file uploaded (field name: 'file', must end .xlsx)" } });
        return;
      }
      const parseResult = await parseExportAll(req.file.buffer);
      const upsertResult = await upsertMembers(tenant.code, parseResult.members);
      res.json({
        tenantCode: tenant.code,
        parse: {
          rowCount: parseResult.rowCount,
          matchedMembers: parseResult.members.length,
          unmatchedHeaders: parseResult.unmatchedHeaders,
          missingHeaders: parseResult.missingHeaders,
          warnings: parseResult.warnings,
        },
        ingest: upsertResult,
      });
    }),
  );

  router.post(
    "/admin/api/tenants/:code/generate",
    requireOperator(),
    asyncHandler(async (req: Request, res: Response) => {
      const tenant = await assertOwnsTenant(req.params["code"]!, req.operator!);
      const parsed = generateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: parsed.error.message } });
        return;
      }
      const opts: SyntheticOptions = {
        count: parsed.data.count,
        tenantCode: tenant.code,
        tenantKind: tenant.kind,
        ...(tenant.name !== undefined ? { groupName: tenant.name } : {}),
        ...(parsed.data.seed !== undefined ? { seed: parsed.data.seed } : {}),
        ...(parsed.data.emailTemplate !== undefined ? { emailTemplate: parsed.data.emailTemplate } : {}),
        ...(parsed.data.emailDomain !== undefined ? { emailDomain: parsed.data.emailDomain } : {}),
        ...(parsed.data.emailBase !== undefined ? { emailBase: parsed.data.emailBase } : {}),
        ...(parsed.data.consentDistribution !== undefined
          ? { consentDistribution: parsed.data.consentDistribution as ConsentDistribution }
          : {}),
        ...(parsed.data.roleProportions !== undefined
          ? { roleProportions: parsed.data.roleProportions as RoleProportions }
          : {}),
        ...(parsed.data.region !== undefined ? { region: parsed.data.region } : {}),
      };

      let rows;
      try {
        rows = generateSyntheticMembers(opts);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: { code: "BAD_REQUEST", message } });
        return;
      }

      if (parsed.data.downloadOnly) {
        // Round-trip through the xlsx writer so the download is exactly the
        // 36-column Insight Hub format. Granular consent + roles do not
        // appear here by design — those columns aren't part of the
        // contract NGX's member-bulk-load.ts consumes.
        const xlsx = await writeExportAll(rows as unknown as ReadonlyArray<Record<string, unknown>>);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="ExportAll-${tenant.code}-${rows.length}.xlsx"`,
        );
        res.send(xlsx);
        return;
      }

      // Direct ingest — bypasses xlsx so granular consent + role flags
      // survive into the DB, where they're served by the public API.
      const upsertResult = await upsertMembers(tenant.code, rows);
      res.json({
        tenantCode: tenant.code,
        generated: rows.length,
        ingest: upsertResult,
      });
    }),
  );

  router.get(
    "/admin/api/tenants/:code/export-insight-hub",
    requireOperator(),
    asyncHandler(async (req: Request, res: Response) => {
      const tenant = await assertOwnsTenant(req.params["code"]!, req.operator!);
      const docs = await Member.find({
        tenantCode: tenant.code,
        removed: { $ne: true },
      }).sort({ membershipNumber: 1 }).exec();

      // The xlsx writer is the source of truth for the 36-column Insight
      // Hub format; passing raw doc objects keeps it 1:1 with the upload
      // path. Granular consent + role fields are present on the docs but
      // ignored by the writer (it only reads INSIGHT_HUB_COLUMNS keys),
      // so the output is exactly the Insight Hub schema NGX's
      // member-bulk-load.ts consumes — no extras, no omissions.
      const rows = docs.map((d) => d.toObject() as unknown as Record<string, unknown>);
      const xlsx = await writeExportAll(rows);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="InsightHub-${tenant.code}-${rows.length}.xlsx"`,
      );
      res.send(xlsx);
    }),
  );

  router.get(
    "/admin/api/tenants/:code/members",
    requireOperator(),
    asyncHandler(async (req: Request, res: Response) => {
      const tenant = await assertOwnsTenant(req.params["code"]!, req.operator!);
      const limit = Math.min(100, Math.max(1, Number(req.query["limit"] ?? 20)));
      const docs = await Member.find({ tenantCode: tenant.code, removed: { $ne: true } })
        .sort({ lastName: 1 })
        .limit(limit)
        .exec();
      res.json({
        tenantCode: tenant.code,
        totalSample: docs.length,
        members: docs.map((d) => toSalesforceMember(d)),
      });
    }),
  );

  router.post(
    "/admin/api/tenants/:code/clear",
    requireOperator(),
    asyncHandler(async (req: Request, res: Response) => {
      const tenant = await assertOwnsTenant(req.params["code"]!, req.operator!);
      const now = new Date();
      const result = await Member.updateMany(
        { tenantCode: tenant.code, removed: { $ne: true } },
        { $set: { removed: true, removalReason: "other", updatedAt: now } },
      );
      await Tenant.updateOne(
        { _id: tenant._id },
        { $set: { lastIngestAt: now, lastIngestCount: 0 } },
      );
      res.json({ tenantCode: tenant.code, cleared: result.modifiedCount });
    }),
  );

  router.post(
    "/admin/api/operators",
    requireOperator(),
    requireRoot,
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = createOperatorSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: parsed.error.message } });
        return;
      }
      const existing = await Operator.findOne({ username: parsed.data.username }).exec();
      if (existing) {
        res.status(409).json({ error: { code: "CONFLICT", message: "Username already exists" } });
        return;
      }
      const op = await Operator.create({
        username: parsed.data.username,
        passwordHash: await hashPassword(parsed.data.password),
        isRoot: false,
        ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
        createdAt: new Date(),
      });
      res.status(201).json({ operator: viewOperator(op) });
    }),
  );

  router.get(
    "/admin/api/operators",
    requireOperator(),
    requireRoot,
    asyncHandler(async (_req: Request, res: Response) => {
      const ops = await Operator.find({}).sort({ createdAt: -1 }).exec();
      res.json({ operators: ops.map(viewOperator) });
    }),
  );

  router.post(
    "/admin/api/operators/:username/password",
    requireOperator(),
    requireRoot,
    asyncHandler(async (req: Request, res: Response) => {
      const username = (req.params["username"] ?? "").trim().toLowerCase();
      if (!username) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: "Username required" } });
        return;
      }
      const parsed = resetOperatorPasswordSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: { code: "BAD_REQUEST", message: parsed.error.message } });
        return;
      }
      const target = await Operator.findOne({ username }).exec();
      if (!target) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Operator not found" } });
        return;
      }
      const password = parsed.data.password ?? generateRandomPassword();
      target.passwordHash = await hashPassword(password);
      await target.save();
      res.json({
        username: target.username,
        password,
        warning: "This is the only time the new password will be shown. Copy it now and share it privately.",
      });
    }),
  );

  router.get(
    "/admin/api/version",
    asyncHandler(async (_req: Request, res: Response) => {
      const info = await loadBuildInfo();
      res.json({ version: info.version, gitSha: info.gitSha, generatedAt: info.generatedAt });
    }),
  );

  router.get(
    "/admin/api/release-notes",
    asyncHandler(async (_req: Request, res: Response) => {
      const info = await loadBuildInfo();
      res.json({ entries: info.entries });
    }),
  );

  // Centralised error handler. Covers:
  //  - assertOwnsTenant-style throws with {status, message}
  //  - unexpected errors (Mongo conflicts, etc.): respond with JSON 500 so the
  //    client always has a machine-readable body instead of Express's default
  //    HTML 500 page.
  router.use((err: unknown, _req: Request, res: Response, _next: (e?: unknown) => void) => {
    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status: number }).status;
      const message = (err as { message?: string }).message ?? "Error";
      if (status === 404) {
        res.status(404).json({ error: { code: "NOT_FOUND", message } });
        return;
      }
      if (status === 403) {
        res.status(403).json({ error: { code: "FORBIDDEN", message } });
        return;
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "admin route error");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: message || "Internal server error",
      },
    });
  });

  return router;
}
