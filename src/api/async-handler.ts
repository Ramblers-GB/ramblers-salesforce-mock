import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wrap an async (req, res) handler so errors propagate to Express's error
 * pipeline and the handler satisfies Express's `void`-returning signature
 * (which is also what `@typescript-eslint/no-misused-promises` enforces).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
