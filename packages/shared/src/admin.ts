import { z } from 'zod';

import { clanDescriptionSchema, clanNameSchema, clanSchema } from './clan.js';
import { flagStatusSchema, flagTypeSchema } from './flag.js';
import { clanSummarySchema } from './leaderboard.js';
import { pageQuerySchema, pageSchema } from './pagination.js';
import { userSummarySchema } from './profile.js';
import { appSettingsSchema } from './settings.js';
import { localDateSchema } from './time.js';
import { toastStatusSchema } from './toast.js';
import { avatarIdSchema, userRoleSchema, userStatusSchema } from './user.js';

// Admin routes (SPEC §4.13, §8 `/admin/*`). Only admins get these shapes, so they may carry emails.

// Blank means "no filter", like leaving the parameter out.
const blankAsUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

// ---- Flags ----

export const adminFlagListQuerySchema = pageQuerySchema.extend({
  type: z.preprocess(blankAsUndefined, flagTypeSchema.optional()),
  status: z.preprocess(blankAsUndefined, flagStatusSchema.optional()),
});
export type AdminFlagListQuery = z.infer<typeof adminFlagListQuerySchema>;

export const flagParamsSchema = z.object({ id: z.uuid() });
export type FlagParams = z.infer<typeof flagParamsSchema>;

/** The toast a photo report is about, as an admin sees it: also when hidden, rejected or deleted. */
export const adminFlagToastSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  eatenAt: z.iso.datetime(),
  localDate: localDateSchema,
  status: toastStatusSchema,
  deleted: z.boolean(),
  // The current photo, also a hidden one; null without one or once the cleanup job removed it.
  photoUrl: z.url().nullable(),
  photoHidden: z.boolean(),
  // Photos the owner replaced or removed since, kept for review until the cleanup job (SPEC §12 D44).
  earlierPhotoUrls: z.array(z.url()),
});
export type AdminFlagToast = z.infer<typeof adminFlagToastSchema>;

/** The subject's toasts that are not deleted on a count flag's day, by status. */
export const adminFlagDaySchema = z.object({
  active: z.int().nonnegative(),
  rejected: z.int().nonnegative(),
});
export type AdminFlagDay = z.infer<typeof adminFlagDaySchema>;

export const adminFlagSchema = z.object({
  id: z.uuid(),
  type: flagTypeSchema,
  status: flagStatusSchema,
  createdAt: z.iso.datetime(),
  subject: userSummarySchema.extend({ status: userStatusSchema }),
  // Photo reports: who reported it (null once that user is deleted) and the optional reason.
  reporter: userSummarySchema.nullable(),
  reason: z.string().nullable(),
  // Count flags: the day and its toasts. Null on photo reports.
  localDate: localDateSchema.nullable(),
  day: adminFlagDaySchema.nullable(),
  // Photo reports: the reported toast. Null on count flags.
  toast: adminFlagToastSchema.nullable(),
  resolvedBy: userSummarySchema.nullable(),
  resolvedAt: z.iso.datetime().nullable(),
});
export type AdminFlag = z.infer<typeof adminFlagSchema>;

/** Newest first. */
export const adminFlagPageSchema = pageSchema(adminFlagSchema);
export type AdminFlagPage = z.infer<typeof adminFlagPageSchema>;

/** BR-MOD-4 actions. `reject_toasts` = the day's toasts of a count flag, the reported toast of a photo report. */
export const FlagAction = {
  dismiss: 'dismiss',
  reject_toasts: 'reject_toasts',
  hide_photo: 'hide_photo',
} as const;
export const flagActionSchema = z.enum(FlagAction);
export type FlagAction = z.infer<typeof flagActionSchema>;

export const resolveFlagSchema = z.strictObject({
  action: flagActionSchema,
  // Also bans the flag's subject.
  ban: z.boolean().default(false),
});
export type ResolveFlag = z.infer<typeof resolveFlagSchema>;

export const adminFlagResponseSchema = z.object({ flag: adminFlagSchema });
export type AdminFlagResponse = z.infer<typeof adminFlagResponseSchema>;

// ---- Users ----

export const ADMIN_USER_SEARCH_MAX = 254;

export const adminUserListQuerySchema = pageQuerySchema.extend({
  // Part of the email or display name, case-insensitive; blank lists every user.
  search: z.preprocess(blankAsUndefined, z.string().trim().max(ADMIN_USER_SEARCH_MAX).optional()),
});
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export const adminUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  // Null until onboarding sets it.
  displayName: z.string().nullable(),
  avatarId: avatarIdSchema.nullable(),
  role: userRoleSchema,
  status: userStatusSchema,
  // The clan the user is in right now.
  clan: clanSummarySchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/** Newest first. */
export const adminUserPageSchema = pageSchema(adminUserSchema);
export type AdminUserPage = z.infer<typeof adminUserPageSchema>;

export const adminUserParamsSchema = z.object({ id: z.uuid() });
export type AdminUserParams = z.infer<typeof adminUserParamsSchema>;

export const setUserStatusSchema = z.strictObject({ status: userStatusSchema });
export type SetUserStatus = z.infer<typeof setUserStatusSchema>;

export const adminUserResponseSchema = z.object({ user: adminUserSchema });
export type AdminUserResponse = z.infer<typeof adminUserResponseSchema>;

// ---- Clans ----

// Strict, so a misspelt field is a 400 instead of being silently dropped.
export const adminUpdateClanSchema = z.strictObject({
  name: clanNameSchema.optional(),
  description: clanDescriptionSchema.nullable().optional(),
  // A current member who becomes the Owner; the former Owner stays as an Officer.
  ownerId: z.uuid().optional(),
});
export type AdminUpdateClan = z.infer<typeof adminUpdateClanSchema>;

export const adminClanResponseSchema = z.object({ clan: clanSchema });
export type AdminClanResponse = z.infer<typeof adminClanResponseSchema>;

// ---- Settings ----

export const updateAppSettingsSchema = appSettingsSchema.partial().strict();
export type UpdateAppSettings = z.infer<typeof updateAppSettingsSchema>;

export const appSettingsResponseSchema = z.object({ settings: appSettingsSchema });
export type AppSettingsResponse = z.infer<typeof appSettingsResponseSchema>;

// ---- Metrics ----

export const METRICS_DAYS = 30;

export const toastsPerDaySchema = z.object({
  date: localDateSchema,
  count: z.int().nonnegative(),
});
export type ToastsPerDay = z.infer<typeof toastsPerDaySchema>;

export const adminMetricsSchema = z.object({
  // Every registered user, banned and not yet onboarded ones included.
  users: z.int().nonnegative(),
  // Distinct users with a countable toast today (Europe/Bratislava).
  dau: z.int().nonnegative(),
  // Countable toasts on each of the last 30 days, today included, oldest first; days without any are 0.
  toastsPerDay: z.array(toastsPerDaySchema),
  openFlags: z.int().nonnegative(),
});
export type AdminMetrics = z.infer<typeof adminMetricsSchema>;

// ---- Toast of the week ----

export const redrawParamsSchema = z.object({ weekStart: localDateSchema });
export type RedrawParams = z.infer<typeof redrawParamsSchema>;
