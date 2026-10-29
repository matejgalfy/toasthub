import { dayNumber, type LocalDate, type Streak } from '@toasthub/shared';

/**
 * Current and longest streak over the days with at least one countable toast (SPEC §4.5). `days` must be
 * ascending. The current streak counts back from today if today has a toast, otherwise from yesterday
 * (BR-STREAK-2). Days after `today` are ignored.
 */
export function computeStreak(days: readonly LocalDate[], today: LocalDate): Streak {
  const last = dayNumber(today);
  let previous: number | undefined;
  let run = 0;
  let longest = 0;
  for (const day of days) {
    const n = dayNumber(day);
    if (n > last) break;
    if (n === previous) continue;
    run = previous !== undefined && n === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = n;
  }
  const alive = previous !== undefined && previous >= last - 1;
  return { current: alive ? run : 0, longest };
}
