import { z } from 'zod';

/** Every day boundary in the app is in this zone (SPEC §12 D2). The DB uses it for `toast.local_date`. */
export const TIME_ZONE = 'Europe/Bratislava';

/** A calendar day as `YYYY-MM-DD`, the same text Postgres uses for `date`. */
export type LocalDate = string;
export const localDateSchema = z.iso.date();

/** Half-open range of calendar days: `start <= day < end`. Maps to `local_date >= start AND local_date < end`. */
export interface DateRange {
  start: LocalDate;
  end: LocalDate;
}

export const Period = { week: 'week', month: 'month', year: 'year' } as const;
export const periodSchema = z.enum(Period);
export type Period = z.infer<typeof periodSchema>;

const MS_PER_DAY = 86_400_000;

// `h23` so midnight is 00, not 24.
const localParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

function partsOf(ts: Date): Record<'year' | 'month' | 'day' | 'hour', string> {
  const out = { year: '', month: '', day: '', hour: '' };
  for (const part of localParts.formatToParts(ts)) {
    if (part.type in out) out[part.type as keyof typeof out] = part.value;
  }
  return out;
}

/** The local calendar day an instant falls on. */
export function localDate(ts: Date): LocalDate {
  const { year, month, day } = partsOf(ts);
  return `${year}-${month}-${day}`;
}

/** The local wall-clock hour (0–23) of an instant. */
export function localHour(ts: Date): number {
  return Number(partsOf(ts).hour);
}

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseLocalDate(date: LocalDate): { year: number; month: number; ms: number } {
  const match = LOCAL_DATE_RE.exec(date);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const ms = Date.UTC(year, month - 1, Number(match?.[3]));
  // The round trip rejects dates like 2026-02-30 that Date.UTC would roll over.
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Invalid local date: ${date}`);
  }
  return { year, month, ms };
}

/**
 * Days since 1970-01-01. Pure calendar arithmetic (no zone, no DST), so consecutive days always differ by 1.
 * Also the index for the fact of the day (SPEC §4.11).
 */
export function dayNumber(date: LocalDate): number {
  return parseLocalDate(date).ms / MS_PER_DAY;
}

export function fromDayNumber(n: number): LocalDate {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayNumber(dayNumber(date) + days);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: LocalDate): number {
  // 1970-01-01 was a Thursday (4).
  return ((((dayNumber(date) + 3) % 7) + 7) % 7) + 1;
}

/** The Monday of the week (Mon–Sun) that contains `date`. */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, 1 - isoWeekday(date));
}

export function weekRange(date: LocalDate): DateRange {
  const start = weekStart(date);
  return { start, end: addDays(start, 7) };
}

export function monthRange(date: LocalDate): DateRange {
  const { year, month } = parseLocalDate(date);
  return { start: firstOfMonth(year, month), end: firstOfMonth(year, month + 1) };
}

export function yearRange(date: LocalDate): DateRange {
  const { year } = parseLocalDate(date);
  return { start: firstOfMonth(year, 1), end: firstOfMonth(year + 1, 1) };
}

export function periodRange(period: Period, date: LocalDate): DateRange {
  switch (period) {
    case Period.week:
      return weekRange(date);
    case Period.month:
      return monthRange(date);
    case Period.year:
      return yearRange(date);
  }
}

// Month 13 rolls over to January of the next year.
function firstOfMonth(year: number, month: number): LocalDate {
  return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
}
