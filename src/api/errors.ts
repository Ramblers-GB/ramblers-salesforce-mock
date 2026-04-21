import type { Response } from "express";
import type { ApiErrorCode, ApiErrorResponse } from "../domain/types.js";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  GROUP_NOT_FOUND: 404,
  MEMBER_NOT_FOUND: 404,
  BAD_REQUEST: 400,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export function apiError(
  res: Response,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
): void {
  const body: ApiErrorResponse = {
    error: details ? { code, message, details } : { code, message },
    timestamp: new Date().toISOString(),
  };
  res.status(STATUS_BY_CODE[code]).json(body);
}
