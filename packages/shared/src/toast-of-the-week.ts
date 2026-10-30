import { z } from 'zod';

import { pageSchema } from './pagination.js';
import { userSummarySchema } from './profile.js';
import { localDateSchema } from './time.js';

/**
 * How a drawn week turned out (SPEC §4.10): `won` has a winner to show; `none` had no eligible toast;
 * `removed` had a winner that can't be shown any more (deleted, rejected, photo hidden or owner banned).
 */
export const ToastOfTheWeekStatus = { won: 'won', none: 'none', removed: 'removed' } as const;
export const toastOfTheWeekStatusSchema = z.enum(ToastOfTheWeekStatus);
export type ToastOfTheWeekStatus = z.infer<typeof toastOfTheWeekStatusSchema>;

/** The winning toast: the lead toast of a session with a photo. */
export const toastOfTheWeekToastSchema = z.object({
  id: z.uuid(),
  user: userSummarySchema,
  eatenAt: z.iso.datetime(),
  // Presigned and valid for 1 hour. Every signed-in user may see it (BR-TOTW-2).
  photoUrl: z.url(),
});
export type ToastOfTheWeekToast = z.infer<typeof toastOfTheWeekToastSchema>;

export const toastOfTheWeekSchema = z.object({
  // The Monday of the week the toast was drawn from.
  weekStart: localDateSchema,
  status: toastOfTheWeekStatusSchema,
  // Only when `status` is `won`.
  toast: toastOfTheWeekToastSchema.nullable(),
});
export type ToastOfTheWeek = z.infer<typeof toastOfTheWeekSchema>;

/** Drawn weeks, newest first. */
export const toastOfTheWeekPageSchema = pageSchema(toastOfTheWeekSchema);
export type ToastOfTheWeekPage = z.infer<typeof toastOfTheWeekPageSchema>;
