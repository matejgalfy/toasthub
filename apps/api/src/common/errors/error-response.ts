import { HttpException } from '@nestjs/common';
import type { ErrorCode, ErrorResponse } from '@toasthub/shared';

import { AppError, errorStatus } from './app-error';

const codeByStatus = new Map<number, ErrorCode>(
  Object.entries(errorStatus).map(([code, status]) => [status, code as ErrorCode]),
);

const defaultMessage: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Invalid request',
  UNAUTHENTICATED: 'Authentication required',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Conflict',
  PAYLOAD_TOO_LARGE: 'Payload too large',
  RATE_LIMITED: 'Too many requests',
  INTERNAL: 'Internal server error',
};

export interface MappedError {
  status: number;
  body: ErrorResponse;
}

/**
 * Statuses outside the SPEC §8 list keep their status code. Other 4xx (405, 415, …) are reported as
 * VALIDATION_ERROR because the client has to change the request; other 5xx (503, …) as INTERNAL.
 */
function codeForStatus(status: number): ErrorCode {
  return codeByStatus.get(status) ?? (status >= 500 ? 'INTERNAL' : 'VALIDATION_ERROR');
}

function body(code: ErrorCode, message: string, fields?: Record<string, string>): ErrorResponse {
  return { error: fields ? { code, message, fields } : { code, message } };
}

/**
 * Maps anything thrown while handling a request to an HTTP status and the SPEC §8 error body. Nest turns
 * Fastify's own errors (bad JSON, body too large, unknown route) into HttpExceptions before they get here.
 */
export function toErrorResponse(exception: unknown): MappedError {
  if (exception instanceof AppError) {
    const message = exception.code === 'INTERNAL' ? defaultMessage.INTERNAL : exception.message;
    return { status: exception.status, body: body(exception.code, message, exception.fields) };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = codeForStatus(status);
    // Messages of deliberate 4xx exceptions are safe to show; 5xx messages may be internal.
    const message = status >= 500 ? defaultMessage[code] : exception.message;
    return { status, body: body(code, message) };
  }

  return { status: 500, body: body('INTERNAL', defaultMessage.INTERNAL) };
}
