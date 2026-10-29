import { z } from 'zod';

import { achievementCodeSchema } from './achievements.js';
import { pageSchema } from './pagination.js';
import { streakSchema } from './streak.js';
import { localDateSchema } from './time.js';
import { avatarIdSchema } from './user.js';

/**
 * What a viewer may see of a profile (SPEC §4.2): `full` = stats, heatmap, achievements and photos;
 * `reduced` = display name, avatar and leaderboard counts only.
 */
export const ProfileAccess = { full: 'full', reduced: 'reduced' } as const;
export const profileAccessSchema = z.enum(ProfileAccess);
export type ProfileAccess = z.infer<typeof profileAccessSchema>;

/** A user as shown in lists (clan members, join requests). Never carries the email. */
export const userSummarySchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  avatarId: avatarIdSchema.nullable(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const userParamsSchema = z.object({ id: z.uuid() });
export type UserParams = z.infer<typeof userParamsSchema>;

/** Countable toasts in the current week, month and year (Europe/Bratislava), as on the leaderboards. */
export const periodCountsSchema = z.object({
  week: z.int().nonnegative(),
  month: z.int().nonnegative(),
  year: z.int().nonnegative(),
});
export type PeriodCounts = z.infer<typeof periodCountsSchema>;

/** Another user's profile, or the own one. Never carries the email. */
export const userProfileSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  avatarId: avatarIdSchema.nullable(),
  // `reduced`: the other `/users/:id/*` routes answer 403 for this viewer.
  access: profileAccessSchema,
  counts: periodCountsSchema,
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const userProfileResponseSchema = z.object({ profile: userProfileSchema });
export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;

/** A photo on a profile: the lead toast of one of the user's toast sessions. */
export const userToastSchema = z.object({
  // The lead toast, which likes and reports refer to.
  id: z.uuid(),
  sessionId: z.uuid(),
  eatenAt: z.iso.datetime(),
  localDate: localDateSchema,
  // Countable toasts in its session.
  count: z.int().nonnegative(),
  // Presigned and valid for 1 hour.
  photoUrl: z.url(),
});
export type UserToast = z.infer<typeof userToastSchema>;

export const userToastPageSchema = pageSchema(userToastSchema);
export type UserToastPage = z.infer<typeof userToastPageSchema>;

/** Statistics over countable toasts (SPEC §4.6). */
export const userStatsSchema = z.object({
  totals: z.object({
    allTime: z.int().nonnegative(),
    // Null before the first toast.
    firstToastDate: localDateSchema.nullable(),
  }),
  // Per calendar day, week (Mon–Sun) and month from the first toast's to the current one, both included.
  averages: z.object({
    perDay: z.number().nonnegative(),
    perWeek: z.number().nonnegative(),
    perMonth: z.number().nonnegative(),
  }),
  // The day with the most toasts, the earliest on a tie; null before the first toast.
  bestDay: z.object({ date: localDateSchema, count: z.int().positive() }).nullable(),
  streak: streakSchema,
});
export type UserStats = z.infer<typeof userStatsSchema>;

export const HEATMAP_YEAR_MIN = 2000;
export const HEATMAP_YEAR_MAX = 2100;

export const heatmapQuerySchema = z.object({
  // The current year (Europe/Bratislava) when left out.
  year: z.preprocess(
    (value: unknown) => (value === '' ? undefined : value),
    z.coerce.number().int().min(HEATMAP_YEAR_MIN).max(HEATMAP_YEAR_MAX).optional(),
  ),
});
export type HeatmapQuery = z.infer<typeof heatmapQuerySchema>;

export const heatmapDaySchema = z.object({ date: localDateSchema, count: z.int().positive() });
export type HeatmapDay = z.infer<typeof heatmapDaySchema>;

export const heatmapSchema = z.object({
  year: z.int(),
  // Only days with toasts, oldest first.
  days: z.array(heatmapDaySchema),
});
export type Heatmap = z.infer<typeof heatmapSchema>;

export const userAchievementSchema = z.object({
  code: achievementCodeSchema,
  // Null while not earned.
  earnedAt: z.iso.datetime().nullable(),
});
export type UserAchievement = z.infer<typeof userAchievementSchema>;

export const userAchievementsSchema = z.object({
  // Every achievement in display order, earned or not.
  items: z.array(userAchievementSchema),
});
export type UserAchievements = z.infer<typeof userAchievementsSchema>;
