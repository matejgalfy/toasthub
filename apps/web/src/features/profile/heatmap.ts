import { addDays, isoWeekday, type Heatmap, type LocalDate, monthRange } from '@toasthub/shared';

/** 0 = no toasts; 1–4 pick the `bg-heat-<n>` colour. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** Fixed steps rather than relative to the busiest day, so a colour means the same in every year. */
export function heatLevel(count: number): HeatLevel {
  if (count <= 0) return 0;
  if (count >= 4) return 4;
  return count as 1 | 2 | 3;
}

export interface HeatmapDayCell {
  date: LocalDate;
  count: number;
  level: HeatLevel;
  /** After today: nothing can be logged there yet. */
  future: boolean;
}

export interface HeatmapMonth {
  /** The first day of the month. */
  start: LocalDate;
  /** Empty cells before the 1st in a Monday-first week row (0–6). */
  offset: number;
  days: HeatmapDayCell[];
}

/** The twelve months of `heatmap.year` with every day filled in; the API lists only days with toasts. */
export function heatmapMonths(heatmap: Heatmap, today: LocalDate): HeatmapMonth[] {
  const counts = new Map(heatmap.days.map((day) => [day.date, day.count]));
  const year = String(heatmap.year).padStart(4, '0');
  return Array.from({ length: 12 }, (_, index) => {
    const start = `${year}-${String(index + 1).padStart(2, '0')}-01`;
    const { end } = monthRange(start);
    const days: HeatmapDayCell[] = [];
    for (let date = start; date < end; date = addDays(date, 1)) {
      const count = counts.get(date) ?? 0;
      days.push({ date, count, level: heatLevel(count), future: date > today });
    }
    return { start, offset: isoWeekday(start) - 1, days };
  });
}
