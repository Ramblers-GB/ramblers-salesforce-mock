/**
 * Session plumbing. Augments Express's session interface with the admin
 * operator id, and exposes helpers that the admin router uses to guard
 * routes and fetch the current operator.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Operator } from "../db/models/index.js";
import type { OperatorDoc } from "../db/models/index.js";
import { asyncHandler } from "../api/asyncHandler.js";

declare module "express-session" {
  interface SessionData {
    operatorId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      operator?: OperatorDoc;
    }
  }
}

/** Populate req.operator if a valid session exists. Does NOT enforce auth. */
export const attachOperator: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const id = req.session.operatorId;
    if (!id) {
      next();
      return;
    }
    const op = await Operator.findById(id).exec();
    if (op) {
      req.operator = op;
    }
    next();
  },
);

/** Enforce auth; unauthenticated requests get a 401 JSON or a redirect. */
export function requireOperator(mode: "json" | "redirect" = "json"): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.operator) {
      next();
      return;
    }
    if (mode === "redirect") {
      res.redirect("/admin/login");
      return;
    }
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } });
  };
}

export function requireRoot(req: Request, res: Response, next: NextFunction): void {
  if (!req.operator) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not signed in" } });
    return;
  }
  if (!req.operator.isRoot) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Root operator required" } });
    return;
  }
  next();
}
