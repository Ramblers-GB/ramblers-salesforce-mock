import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { Member, ConsentEvent, Tenant } from "../db/models/index.js";
import type { MemberDoc } from "../db/models/index.js";
import { bearerAuth, requireTenantMatch } from "../auth/bearerAuth.js";
import { toSalesforceMember } from "./memberMapper.js";
import { apiError } from "./errors.js";
import { asyncHandler } from "./asyncHandler.js";
import type {
  ConsentUpdateResponse,
  MemberChange,
  MemberListResponse,
} from "../domain/types.js";

const listQuerySchema = z.object({
  since: z
    .string()
    .datetime({ offset: true })
    .optional(),
  includeExpired: z
    .string()
    .optional()
    .transform((v) => v === undefined ? undefined : v === "true" || v === "1"),
});

const consentRequestSchema = z
  .object({
    emailMarketingConsent: z.boolean().optional(),
    groupMarketingConsent: z.boolean().optional(),
    areaMarketingConsent: z.boolean().optional(),
    otherMarketingConsent: z.boolean().optional(),
    source: z.enum(["ngx-ramblers", "mailman"]),
    timestamp: z.string().datetime({ offset: true }),
    reason: z.string().optional(),
  })
  .refine(
    (body) =>
      body.emailMarketingConsent !== undefined ||
      body.groupMarketingConsent !== undefined ||
      body.areaMarketingConsent !== undefined ||
      body.otherMarketingConsent !== undefined,
    { message: "At least one consent flag must be present" },
  );

export function createApiRouter(): Router {
  const router = Router();

  router.get(
    "/api/groups/:groupCode/members",
    asyncHandler(bearerAuth),
    asyncHandler(async (req: Request, res: Response) => {
      const pathTenant = req.params["groupCode"];
      if (!pathTenant) {
        apiError(res, "BAD_REQUEST", "groupCode path parameter is required");
        return;
      }
      if (!requireTenantMatch(pathTenant, req, res)) return;

      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        apiError(res, "BAD_REQUEST", "Invalid query parameters", {
          issues: parsed.error.issues,
        });
        return;
      }
      const { since, includeExpired } = parsed.data;

      const tenant = await Tenant.findOne({ code: pathTenant.toUpperCase() }).exec();
      if (!tenant) {
        apiError(res, "GROUP_NOT_FOUND", `No data loaded for ${pathTenant}`);
        return;
      }

      const memberFilter: Record<string, unknown> = {
        tenantCode: pathTenant.toUpperCase(),
      };
      if (!includeExpired) {
        memberFilter["$or"] = [
          { membershipExpiryDate: { $exists: false } },
          { membershipExpiryDate: { $gte: new Date() } },
        ];
      }
      if (!since) {
        memberFilter["removed"] = { $ne: true };
      }

      const docs = await Member.find(memberFilter).exec();
      const members = docs
        .filter((d: MemberDoc) => !d.removed)
        .map((d) => toSalesforceMember(d));

      const response: MemberListResponse = {
        groupCode: pathTenant.toUpperCase(),
        groupName: tenant.name ?? tenant.code,
        totalCount: members.length,
        members,
      };

      if (since) {
        const sinceDate = new Date(since);
        const changed = docs.filter((d) => d.updatedAt >= sinceDate);
        const changes: MemberChange[] = changed.map((d) => {
          if (d.removed) {
            const change: MemberChange = {
              member: toSalesforceMember(d),
              changeType: "removed",
              changedAt: d.updatedAt.toISOString(),
            };
            if (d.removalReason) change.removalReason = d.removalReason;
            return change;
          }
          const isNew = d.ingestedAt >= sinceDate;
          return {
            member: toSalesforceMember(d),
            changeType: isNew ? "added" : "updated",
            changedAt: d.updatedAt.toISOString(),
          };
        });
        response.since = sinceDate.toISOString();
        response.changes = changes;
      }

      res.json(response);
    }),
  );

  router.post(
    "/api/members/:membershipNumber/consent",
    asyncHandler(bearerAuth),
    asyncHandler(async (req: Request, res: Response) => {
      const membershipNumber = req.params["membershipNumber"];
      if (!membershipNumber) {
        apiError(res, "BAD_REQUEST", "membershipNumber path parameter is required");
        return;
      }
      const token = req.apiToken;
      if (!token) {
        apiError(res, "INTERNAL_ERROR", "bearerAuth did not populate req.apiToken");
        return;
      }

      const parsed = consentRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        apiError(res, "BAD_REQUEST", "Invalid consent request body", {
          issues: parsed.error.issues,
        });
        return;
      }
      const body = parsed.data;

      const member = await Member.findOne({
        tenantCode: token.tenantCode,
        membershipNumber,
      }).exec();
      if (!member) {
        apiError(
          res,
          "MEMBER_NOT_FOUND",
          `No member with membershipNumber ${membershipNumber} in tenant ${token.tenantCode}`,
        );
        return;
      }

      const now = new Date();
      const updates: Partial<
        Pick<
          typeof member,
          | "emailMarketingConsent"
          | "groupMarketingConsent"
          | "areaMarketingConsent"
          | "otherMarketingConsent"
          | "emailPermissionLastUpdated"
          | "updatedAt"
        >
      > = { updatedAt: now };

      if (body.emailMarketingConsent !== undefined) {
        updates.emailMarketingConsent = body.emailMarketingConsent;
        updates.emailPermissionLastUpdated = now;
      }
      if (body.groupMarketingConsent !== undefined) {
        updates.groupMarketingConsent = body.groupMarketingConsent;
      }
      if (body.areaMarketingConsent !== undefined) {
        updates.areaMarketingConsent = body.areaMarketingConsent;
      }
      if (body.otherMarketingConsent !== undefined) {
        updates.otherMarketingConsent = body.otherMarketingConsent;
      }

      Object.assign(member, updates);
      await member.save();

      const eventDoc = {
        tenantCode: token.tenantCode,
        membershipNumber,
        source: body.source,
        submittedAt: new Date(body.timestamp),
        appliedAt: now,
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
        ...(body.emailMarketingConsent !== undefined
          ? { emailMarketingConsent: body.emailMarketingConsent }
          : {}),
        ...(body.groupMarketingConsent !== undefined
          ? { groupMarketingConsent: body.groupMarketingConsent }
          : {}),
        ...(body.areaMarketingConsent !== undefined
          ? { areaMarketingConsent: body.areaMarketingConsent }
          : {}),
        ...(body.otherMarketingConsent !== undefined
          ? { otherMarketingConsent: body.otherMarketingConsent }
          : {}),
      };
      await ConsentEvent.create(eventDoc);

      const response: ConsentUpdateResponse = {
        membershipNumber,
        updatedAt: now.toISOString(),
        success: true,
      };
      if (member.emailMarketingConsent !== undefined) {
        response.emailMarketingConsent = member.emailMarketingConsent;
      }
      if (member.groupMarketingConsent !== undefined) {
        response.groupMarketingConsent = member.groupMarketingConsent;
      }
      if (member.areaMarketingConsent !== undefined) {
        response.areaMarketingConsent = member.areaMarketingConsent;
      }
      if (member.otherMarketingConsent !== undefined) {
        response.otherMarketingConsent = member.otherMarketingConsent;
      }

      res.status(200).json(response);
    }),
  );

  return router;
}
