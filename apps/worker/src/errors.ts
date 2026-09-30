import type { ApiErrorBody } from '@family-game-night/shared';

export type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 500;

export class ApiError extends Error {
  public readonly code: string;
  public readonly details: Readonly<Record<string, unknown>>;
  public readonly status: ApiErrorStatus;

  public constructor(
    status: ApiErrorStatus,
    code: string,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function apiErrorBody(error: ApiError, requestId?: string): ApiErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      ...(requestId === undefined ? {} : { requestId }),
    },
  };
}
