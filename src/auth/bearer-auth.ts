import type { Request } from "express";
import { ApiToken } from "../db/models/index.js";
import type { TokenDoc } from "../db/models/index.js";
import { hashToken } from "./tokens.js";

declare global {
  namespace Express {
    interface Request {
      apiToken?: TokenDoc;
    }
  }
}

export type TeamAuthenticationResult =
  | { kind: "ok"; token: TokenDoc; teamCode: string }
  | { kind: "missing" }
  | { kind: "unauthorised" };

export async function authenticateTeam(req: Request): Promise<TeamAuthenticationResult> {
  const apiKey = typeof req.query["api_key"] === "string" ? req.query["api_key"] : undefined;
  const teamCode = typeof req.query["team_code"] === "string" ? req.query["team_code"] : undefined;
  if (!apiKey || !teamCode) {
    return { kind: "missing" };
  }

  const token = await ApiToken.findOne({ tokenHash: hashToken(apiKey) }).exec();
  const authorised = token && !token.revokedAt && token.tenantCode.toUpperCase() === teamCode.toUpperCase();
  if (!authorised) {
    return { kind: "unauthorised" };
  }

  await ApiToken.updateOne({ _id: token._id }, { $set: { lastUsedAt: new Date() } }).exec();
  req.apiToken = token;
  return { kind: "ok", token, teamCode: teamCode.toUpperCase() };
}
