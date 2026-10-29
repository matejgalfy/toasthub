import { z } from 'zod';

import { achievementCodeSchema } from './achievements.js';
import { pageSchema } from './pagination.js';
import { localDateSchema } from './time.js';

/** The most toasts one session holds (SPEC §4.3 BR-TOAST-5). */
export const TOAST_SESSION_MAX_COUNT = 10;

const countSchema = z.int().min(1).max(TOAST_SESSION_MAX_COUNT);

/**
 * The text fields of the `POST /toast-sessions` multipart body (the `photo` file part comes separately).
 * Multipart fields are strings, so `count` is coerced.
 */
export const createToastSessionSchema = z.object({
  count: z.coerce.number().pipe(countSchema).default(1),
});
export type CreateToastSession = z.infer<typeof createToastSessionSchema>;

export const updateToastSessionSchema = z.object({ count: countSchema });
export type UpdateToastSession = z.infer<typeof updateToastSessionSchema>;

export const toastSessionParamsSchema = z.object({ id: z.uuid() });
export type ToastSessionParams = z.infer<typeof toastSessionParamsSchema>;

/** One of the caller's own sessions (BR-TOAST-6). */
export const toastSessionSchema = z.object({
  id: z.uuid(),
  loggedAt: z.iso.datetime(),
  // The session's day in Europe/Bratislava, the only day it can be changed (BR-TOAST-7).
  localDate: localDateSchema,
  // Toasts in the session that are not deleted.
  count: z.int().nonnegative(),
  // A photo is stored on the session, visible or hidden by an admin.
  hasPhoto: z.boolean(),
  // Presigned and valid for 1 hour; null without a photo or when an admin hid it.
  photoUrl: z.url().nullable(),
  // An admin hid the session's photo: it can still be removed, but no photo can be added any more.
  photoHidden: z.boolean(),
  // Today's session without a rejected toast: count, photo and delete can be changed.
  editable: z.boolean(),
});
export type ToastSession = z.infer<typeof toastSessionSchema>;

export const toastSessionPageSchema = pageSchema(toastSessionSchema);
export type ToastSessionPage = z.infer<typeof toastSessionPageSchema>;

export const toastSessionResponseSchema = z.object({ session: toastSessionSchema });
export type ToastSessionResponse = z.infer<typeof toastSessionResponseSchema>;

/** After logging, adding toasts or adding a photo, which can earn achievements (SPEC §4.12). */
export const toastSessionChangeResponseSchema = z.object({
  session: toastSessionSchema,
  // Achievements this change earned, in display order.
  newAchievements: z.array(achievementCodeSchema),
});
export type ToastSessionChangeResponse = z.infer<typeof toastSessionChangeResponseSchema>;
