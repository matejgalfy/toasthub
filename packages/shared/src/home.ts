import { z } from 'zod';

import { clanAvatarIdSchema } from './clan.js';
import { streakSchema } from './streak.js';
import { toastOfTheWeekSchema } from './toast-of-the-week.js';

/** The toast fact of the day in the user's locale (SPEC §4.11). */
export const factSchema = z.object({
  id: z.int(),
  text: z.string(),
});
export type Fact = z.infer<typeof factSchema>;

/** The caller's clan, as the clan streak card shows it. */
export const homeClanSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  avatarId: clanAvatarIdSchema.nullable(),
});
export type HomeClan = z.infer<typeof homeClanSchema>;

export const homeResponseSchema = z.object({
  // The caller's countable toasts today (Europe/Bratislava).
  todayCount: z.int().nonnegative(),
  streak: streakSchema,
  // The caller's clan and its streak; both null when not in a clan.
  clan: homeClanSchema.nullable(),
  clanStreak: streakSchema.nullable(),
  // Null only while there are no facts at all.
  fact: factSchema.nullable(),
  // Last week's draw; null until it has run.
  toastOfTheWeek: toastOfTheWeekSchema.nullable(),
});
export type HomeResponse = z.infer<typeof homeResponseSchema>;
