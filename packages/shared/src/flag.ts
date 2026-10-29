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
