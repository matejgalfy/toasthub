import { z } from 'zod';

import { streakSchema } from './streak.js';

/** The toast fact of the day in the user's locale (SPEC §4.11). */
export const factSchema = z.object({
  id: z.int(),
  text: z.string(),
});
export type Fact = z.infer<typeof factSchema>;

export const homeResponseSchema = z.object({
  // The caller's countable toasts today (Europe/Bratislava).
  todayCount: z.int().nonnegative(),
  streak: streakSchema,
  // The streak of the caller's clan; null when not in a clan.
  clanStreak: streakSchema.nullable(),
  // Null only while there are no facts at all.
  fact: factSchema.nullable(),
  // Always null until the weekly draw exists (M15).
  toastOfTheWeek: z.null(),
});
export type HomeResponse = z.infer<typeof homeResponseSchema>;
