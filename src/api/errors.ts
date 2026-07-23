import type { Response } from "express";
import type {
  SupporterUpdateError,
  SupporterUpdateErrorType,
  SupportersError,
  SupportersErrorType,
} from "@ramblers/sf-contract";
import {
  STATUS_BY_SUPPORTER_UPDATE_ERROR_TYPE,
  STATUS_BY_SUPPORTERS_ERROR_TYPE,
} from "@ramblers/sf-contract";

export function supportersError(
  res: Response,
  errorType: SupportersErrorType,
  errorDescription: string,
): void {
  const body: SupportersError = { errorType, errorDescription };
  res.status(STATUS_BY_SUPPORTERS_ERROR_TYPE[errorType]).json(body);
}

export function supporterUpdateError(
  res: Response,
  errorType: SupporterUpdateErrorType,
  errorDescription: string,
  statusOverride?: number,
): void {
  const body: SupporterUpdateError = { errorType, errorDescription };
  res.status(statusOverride ?? STATUS_BY_SUPPORTER_UPDATE_ERROR_TYPE[errorType]).json(body);
}
