import {
  dayNumber,
  type HeatmapDay,
  type LocalDate,
  type UserStats,
  weekStart,
} from '@toasthub/shared';

import { computeStreak } from '../streaks/streak';

/**
 * The statistics of SPEC §4.6 from the countable toasts per day (`days` ascending, one entry per date).
 * Averages divide by the calendar days, weeks (Mon–Sun) and months from the first toast's to today's, both
 * included, so a partial current period counts as one. Days after `today` are ignored.
 */
export function computeStats(days: readonly HeatmapDay[], today: LocalDate): UserStats {
  const counted = days.filter((day) => day.date <= today);
  const streak = computeStreak(
    counted.map((day) => day.date),
    today,
  );
  const [first] = counted;
  if (!first) {
    return {
      totals: { allTime: 0, firstToastDate: null },
      averages: { perDay: 0, perWeek: 0, perMonth: 0 },
      bestDay: null,
      streak,
    };
  }

  let allTime = 0;
  let best = first;
  for (const day of counted) {
    allTime += day.count;
    if (day.count > best.count) best = day;
  }
  const dayCount = dayNumber(today) - dayNumber(first.date) + 1;
  const weekCount = (dayNumber(weekStart(today)) - dayNumber(weekStart(first.date))) / 7 + 1;
  const monthCount = monthIndex(today) - monthIndex(first.date) + 1;
  return {
    totals: { allTime, firstToastDate: first.date },
    averages: {
      perDay: allTime / dayCount,
      perWeek: allTime / weekCount,
      perMonth: allTime / monthCount,
    },
    bestDay: { date: best.date, count: best.count },
    streak,
  };
}

function monthIndex(date: LocalDate): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
}
