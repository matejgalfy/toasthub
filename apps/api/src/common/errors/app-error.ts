import type { ErrorCode } from '@toasthub/shared';
import type { z } from 'zod';

export const errorStatus = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, number>;

/** A domain error: services throw it, the global filter turns it into the SPEC §8 error body. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  get status(): number {
    return errorStatus[this.code];
  }

  static validation(error: z.core.$ZodError): AppError {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.map(String).join('.') || '_';
      fields[key] ??= issue.message;
    }
    return new AppError('VALIDATION_ERROR', 'Request validation failed', fields);
  }
}
