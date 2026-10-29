import { z } from 'zod';

export const FLAG_REASON_MAX = 280;

// Extensible: AI moderation will add more types (SPEC §13).
export const FlagType = {
  count_threshold: 'count_threshold',
  photo_report: 'photo_report',
} as const;
export const flagTypeSchema = z.enum(FlagType);
export type FlagType = z.infer<typeof flagTypeSchema>;

export const FlagStatus = { open: 'open', dismissed: 'dismissed', actioned: 'actioned' } as const;
export const flagStatusSchema = z.enum(FlagStatus);
export type FlagStatus = z.infer<typeof flagStatusSchema>;

/**
 * `POST /toasts/:id/report` (BR-MOD-3). The body may be left out, and an empty reason is stored as none.
 * Strict, so a misspelt `reason` is a 400 instead of a silently dropped reason.
 */
export const reportToastSchema = z.preprocess(
  (value: unknown) => value ?? {},
  z.strictObject({ reason: z.string().trim().max(FLAG_REASON_MAX).nullable().optional() }),
);
export type ReportToast = z.infer<typeof reportToastSchema>;
