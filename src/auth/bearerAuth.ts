import type { NextFunction, Request, Response } from "express";
import { ApiToken } from "../db/models/index.js";
import type { TokenDoc } from "../db/models/index.js";
import { apiError } from "../api/errors.js";
import { extractBearerToken, hashToken } from "./tokens.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiToken?: TokenDoc;
    }
  }
}

/**
 * Bearer-auth middleware for the public API.
 *
 * Populates `req.apiToken` on success. Denies unauthenticated, unknown, or
 * revoked tokens with the #209-spec `UNAUTHORIZED` error envelope.
 */
export async function bearerAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const plaintext = extractBearerToken(req.header("authorization"));
  if (!plaintext) {
    apiError(res, "UNAUTHORIZED", "Missing or malformed Authorization header");
    return;
  }

  const record = await ApiToken.findOne({ tokenHash: hashToken(plaintext) }).exec();
  if (!record) {
    apiError(res, "UNAUTHORIZED", "Unknown API token");
    return;
  }
  if (record.revokedAt) {
    apiError(res, "UNAUTHORIZED", "API token has been revoked");
    return;
  }

  // Update lastUsedAt asynchronously; don't block the request.
  ApiToken.updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date() } })
    .exec()
    .catch(() => {
      /* best-effort */
    });

  req.apiToken = record;
  next();
}

/**
 * Enforces that the path's tenant code matches the token's tenant scope.
 * Called from routers after bearerAuth has populated `req.apiToken`.
 */
export function requireTenantMatch(
  pathTenant: string,
  req: Request,
  res: Response,
): boolean {
  const token = req.apiToken;
  if (!token) {
    apiError(res, "INTERNAL_ERROR", "bearerAuth must run before requireTenantMatch");
    return false;
  }
  if (token.tenantCode.toUpperCase() !== pathTenant.toUpperCase()) {
    apiError(
      res,
      "UNAUTHORIZED",
      `Token is not authorised for tenant ${pathTenant}`,
      { tokenTenant: token.tenantCode, requestedTenant: pathTenant },
    );
    return false;
  }
  return true;
}
