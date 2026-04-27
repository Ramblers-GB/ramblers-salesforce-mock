import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { bearerAuth, requireTenantMatch } from "../auth/bearer-auth.js";
import { apiError } from "./errors.js";
import { asyncHandler } from "./async-handler.js";
import type { ConsentUpdateRequest } from "../domain/types.js";
import type { MemberProvider } from "../ports/member-provider.js";

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

export function createApiRouter(provider: MemberProvider): Router {
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

      const result = await provider.listMembers({
        groupCode: pathTenant,
        ...(since ? { since: new Date(since) } : {}),
        ...(includeExpired !== undefined ? { includeExpired } : {}),
      });

      if (result.kind === "groupNotFound") {
        apiError(res, "GROUP_NOT_FOUND", `No data loaded for ${pathTenant}`);
        return;
      }

      res.json(result.response);
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
      const consentRequest: ConsentUpdateRequest = {
        source: body.source,
        timestamp: body.timestamp,
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
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
      };

      const result = await provider.applyConsent({
        tenantCode: token.tenantCode,
        membershipNumber,
        request: consentRequest,
        appliedAt: new Date(),
      });

      if (result.kind === "memberNotFound") {
        apiError(
          res,
          "MEMBER_NOT_FOUND",
          `No member with membershipNumber ${membershipNumber} in tenant ${token.tenantCode}`,
        );
        return;
      }

      res.status(200).json(result.response);
    }),
  );

  return router;
}
