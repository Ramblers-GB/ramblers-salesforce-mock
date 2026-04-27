import type { Response } from "express";
import {
  STATUS_BY_API_ERROR_CODE,
  type ApiErrorCode,
  type ApiErrorResponse,
} from "@ramblers/sf-contract";

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
  res.status(STATUS_BY_API_ERROR_CODE[code]).json(body);
}
