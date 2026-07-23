import { Router } from "express";
import type { Request, Response } from "express";
import {
  bouncedEmailRequestSchema,
  supportersQuerySchema,
  unsubscribeRequestSchema,
  type SupporterProvider,
  type SupporterUpdateSuccess,
} from "@ramblers/sf-contract";
import { authenticateTeam } from "../auth/bearer-auth.js";
import { asyncHandler } from "./async-handler.js";
import { supporterUpdateError, supportersError } from "./errors.js";

async function authenticatedTeam(req: Request, res: Response, updateOperation: boolean): Promise<string | null> {
  const credentials = supportersQuerySchema.safeParse(req.query);
  if (!credentials.success) {
    if (updateOperation) {
      supporterUpdateError(res, "Required field missing", "api_key and team_code are required");
    } else {
      supportersError(res, "Bad request", "api_key and team_code are required");
    }
    return null;
  }

  const authentication = await authenticateTeam(req);
  if (authentication.kind !== "ok") {
    if (updateOperation) {
      supporterUpdateError(res, "Required field missing", "Unauthorised api_key and team_code combination", 401);
    } else {
      supportersError(res, "Unauthorised", "Unauthorised api_key and team_code combination");
    }
    return null;
  }
  return authentication.teamCode;
}

export function createApiRouter(provider: SupporterProvider): Router {
  const router = Router();

  router.get(
    "/get_supporters",
    asyncHandler(async (req: Request, res: Response) => {
      const teamCode = await authenticatedTeam(req, res, false);
      if (!teamCode) {
        return;
      }
      const result = await provider.supporters({ teamCode });
      if (result.kind === "teamNotFound") {
        supportersError(res, "Bad request", `No record of team ${teamCode}`);
        return;
      }
      res.json(result.supporters);
    }),
  );

  router.post(
    "/unsubscribe",
    asyncHandler(async (req: Request, res: Response) => {
      const teamCode = await authenticatedTeam(req, res, true);
      if (!teamCode) {
        return;
      }
      const request = unsubscribeRequestSchema.safeParse(req.body);
      if (!request.success) {
        supporterUpdateError(res, "Invalid email", "Invalid unsubscribe request");
        return;
      }
      const result = await provider.unsubscribe({ teamCode, request: request.data, appliedAt: new Date() });
      if (result.kind === "supporterNotFound") {
        supporterUpdateError(res, "Email not recognised for this group", "No record of the supporter");
        return;
      }
      const response: SupporterUpdateSuccess = { responseText: "Update processed" };
      res.json(response);
    }),
  );

  router.post(
    "/bounced_email",
    asyncHandler(async (req: Request, res: Response) => {
      const teamCode = await authenticatedTeam(req, res, true);
      if (!teamCode) {
        return;
      }
      const request = bouncedEmailRequestSchema.safeParse(req.body);
      if (!request.success) {
        supporterUpdateError(res, "Invalid email", "Invalid bounced email request");
        return;
      }
      const result = await provider.bounce({ teamCode, request: request.data, appliedAt: new Date() });
      if (result.kind === "supporterNotFound") {
        supporterUpdateError(res, "Email not recognised for this group", "No record of the supporter");
        return;
      }
      const response: SupporterUpdateSuccess = { responseText: "Bounce logged" };
      res.json(response);
    }),
  );

  return router;
}
