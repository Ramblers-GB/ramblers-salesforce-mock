import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import path from "node:path";
import { Operator, Tenant, ApiToken, Member } from "../db/models/index.js";
import type { OperatorDoc, TenantDoc } from "../db/models/index.js";
import { asyncHandler } from "../api/asyncHandler.js";
import { attachOperator, requireOperator, requireRoot } from "./session.js";
import { hashPassword, verifyPassword, timingSafeEqual } from "./passwords.js";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";
import { generateToken } from "../auth/tokens.js";
import { parseExportAll, writeExportAll } from "../ingest/xlsxParser.js";
import { generateSyntheticMembers } from "../ingest/synthetic.js";
import { upsertMembers } from "../ingest/upsert.js";
import { toSalesforceMember } from "../api/memberMapper.js";

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

const generateSchema = z.object({
  count: z.coerce.number().int().min(1).max(50_000),
  seed: z.coerce.number().int().optional(),
  downloadOnly: z.coerce.boolean().optional(),
});

const createOperatorSchema = z.object({
  username: z.string().trim().min(3).max(40).toLowerCase(),
  password: z.string().min(12).max(100),
  label: z.string().trim().min(1).max(120).optional(),
});

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

  router.get("/admin/login", (_req, res) => {
    res.sendFile(path.resolve(process.cwd(), "public", "admin.html"));
  });

  router.get("/admin", (req, res) => {
    if (req.operator) {
      res.redirect("/admin/dashboard");
    } else {
      res.redirect("/admin/login");
    }
  });

  router.get("/admin/dashboard", requireOperator("redirect"), (_req, res) => {
    res.sendFile(path.resolve(process.cwd(), "public", "admin.html"));
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
      const opts = {
        count: parsed.data.count,
        tenantCode: tenant.code,
        tenantKind: tenant.kind,
        ...(tenant.name !== undefined ? { groupName: tenant.name } : {}),
        ...(parsed.data.seed !== undefined ? { seed: parsed.data.seed } : {}),
      };
      const rows = generateSyntheticMembers(opts);
      const xlsx = await writeExportAll(rows);

      if (parsed.data.downloadOnly) {
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

      const parseResult = await parseExportAll(xlsx);
      const upsertResult = await upsertMembers(tenant.code, parseResult.members);
      res.json({
        tenantCode: tenant.code,
        generated: rows.length,
        ingest: upsertResult,
        downloadUrl: `/admin/api/tenants/${tenant.code}/generate?count=${rows.length}&downloadOnly=true`,
      });
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
