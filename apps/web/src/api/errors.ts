import { errorResponseSchema, type ErrorCode } from '@toasthub/shared';

/** The SPEC §8 codes plus `NETWORK` for a request that never got a response. */
export type ApiErrorCode = ErrorCode | 'NETWORK';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /** HTTP status; 0 when there was no response. */
  readonly status: number;
  /** Per-field problems on `VALIDATION_ERROR`, keyed by dotted path. */
  readonly fields?: Record<string, string>;

  constructor(
    code: ApiErrorCode,
    status: number,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    if (fields) this.fields = fields;
  }
}

/** Builds an `ApiError` from a failed response. A body not in the §8 shape (a proxy page) is `INTERNAL`. */
export function toApiError(status: number, body: unknown): ApiError {
  const parsed = errorResponseSchema.safeParse(body);
  if (!parsed.success) return new ApiError('INTERNAL', status, `HTTP ${String(status)}`);
  const { code, message, fields } = parsed.data.error;
  return new ApiError(code, status, message, fields);
}

/** The i18n key of the message to show the user for any thrown value. */
export function errorMessageKey(error: unknown): `errors.${ApiErrorCode}` {
  return error instanceof ApiError ? `errors.${error.code}` : 'errors.INTERNAL';
}
