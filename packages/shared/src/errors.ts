import { z } from 'zod';

// Error codes from SPEC §8. The web client maps `code` to a localized message.
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export const errorCodeSchema = z.enum(ErrorCode);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    // Only on VALIDATION_ERROR: dotted field path → first problem with that field.
    fields: z.record(z.string(), z.string()).optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
