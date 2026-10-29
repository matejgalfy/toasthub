import { z } from 'zod';

/**
 * Consecutive days with at least one countable toast (SPEC §4.5). `current` is still alive while the last
 * such day is today or yesterday.
 */
export const streakSchema = z.object({
  current: z.int().nonnegative(),
  longest: z.int().nonnegative(),
});
export type Streak = z.infer<typeof streakSchema>;
