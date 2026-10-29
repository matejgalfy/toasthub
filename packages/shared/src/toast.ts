import { z } from 'zod';

import { achievementCodeSchema } from './achievements.js';
import { localDateSchema } from './time.js';

// `rejected` is set by an admin; rejected toasts stop counting everywhere (SPEC §4.4).
export const ToastStatus = { active: 'active', rejected: 'rejected' } as const;
export const toastStatusSchema = z.enum(ToastStatus);
export type ToastStatus = z.infer<typeof toastStatusSchema>;

/** Upload limit for a toast photo, before the server re-encodes it (SPEC §4.3 BR-TOAST-2). */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** `POST /toasts` takes one optional multipart file part with this name. */
export const PHOTO_FIELD = 'photo';

export const toastParamsSchema = z.object({ id: z.uuid() });
export type ToastParams = z.infer<typeof toastParamsSchema>;

export const toastSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  // The clan the user was in when logging it (SPEC §12 D9).
  clanId: z.uuid().nullable(),
  eatenAt: z.iso.datetime(),
  localDate: localDateSchema,
  // Presigned and valid for 1 hour; null without a photo or when an admin hid it.
  photoUrl: z.url().nullable(),
});
export type Toast = z.infer<typeof toastSchema>;

export const createToastResponseSchema = z.object({
  toast: toastSchema,
  // Achievements this toast earned, in display order.
  newAchievements: z.array(achievementCodeSchema),
});
export type CreateToastResponse = z.infer<typeof createToastResponseSchema>;
