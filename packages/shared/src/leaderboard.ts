import { z } from 'zod';

import { userSummarySchema } from './profile.js';
import { Period, periodSchema } from './time.js';

/** How many rows a board lists; the caller's own row comes separately when it ranks lower (SPEC §12 D50). */
export const LEADERBOARD_SIZE = 50;

/** `?period=` for the users board, which defaults to this week. */
export const userLeaderboardQuerySchema = z.object({ period: periodSchema.default(Period.week) });
export type UserLeaderboardQuery = z.infer<typeof userLeaderboardQuerySchema>;

/** `?period=` for the clan boards: clan vs clan and members within a clan default to this month (§4.7). */
export const clanLeaderboardQuerySchema = z.object({ period: periodSchema.default(Period.month) });
export type ClanLeaderboardQuery = z.infer<typeof clanLeaderboardQuerySchema>;

// Competition ranking: ties share a rank and the next rank skips (1, 1, 3).
const rankSchema = z.int().positive();

export const userRankSchema = z.object({
  rank: rankSchema,
  user: userSummarySchema,
  count: z.int().nonnegative(),
});
export type UserRank = z.infer<typeof userRankSchema>;

export const userLeaderboardSchema = z.object({
  items: z.array(userRankSchema),
  // Null when the caller has no countable toast in the period.
  me: userRankSchema.nullable(),
});
export type UserLeaderboard = z.infer<typeof userLeaderboardSchema>;

export const clanSummarySchema = z.object({ id: z.uuid(), name: z.string() });
export type ClanSummary = z.infer<typeof clanSummarySchema>;

export const clanRankSchema = z.object({
  rank: rankSchema,
  clan: clanSummarySchema,
  count: z.int().nonnegative(),
  currentStreak: z.int().nonnegative(),
});
export type ClanRank = z.infer<typeof clanRankSchema>;

export const clanLeaderboardSchema = z.object({
  items: z.array(clanRankSchema),
  // Null outside a clan, or when the caller's clan has no countable toast in the period.
  myClan: clanRankSchema.nullable(),
});
export type ClanLeaderboard = z.infer<typeof clanLeaderboardSchema>;

/** Every current member of one clan, also those with no toast in the period (count 0). */
export const clanMemberLeaderboardSchema = z.object({ items: z.array(userRankSchema) });
export type ClanMemberLeaderboard = z.infer<typeof clanMemberLeaderboardSchema>;
