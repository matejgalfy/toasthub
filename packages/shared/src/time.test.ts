import { describe, expect, it } from 'vitest';

import {
  addDays,
  dayNumber,
  fromDayNumber,
  isoWeekday,
  localDate,
  localHour,
  monthRange,
  periodRange,
  weekRange,
  weekStart,
  yearRange,
} from './time.js';

const at = (iso: string) => new Date(iso);

describe('localDate', () => {
  it.each([
    // Winter (CET, UTC+1): local midnight is 23:00 UTC the day before.
    ['2026-01-15T22:59:59Z', '2026-01-15'],
    ['2026-01-15T23:00:00Z', '2026-01-16'],
    // Summer (CEST, UTC+2): local midnight is 22:00 UTC the day before.
    ['2026-07-01T21:59:59Z', '2026-07-01'],
    ['2026-07-01T22:00:00Z', '2026-07-02'],
    // New year starts an hour before UTC's.
    ['2026-12-31T23:30:00Z', '2027-01-01'],
  ])('%s is local day %s', (instant, expected) => {
    expect(localDate(at(instant))).toBe(expected);
  });

  it('handles the spring-forward day (2026-03-29, 02:00 → 03:00)', () => {
    // The day starts in CET and ends in CEST, so it is 23 hours long.
    expect(localDate(at('2026-03-28T22:59:59Z'))).toBe('2026-03-28');
    expect(localDate(at('2026-03-28T23:00:00Z'))).toBe('2026-03-29');
    expect(localDate(at('2026-03-29T21:59:59Z'))).toBe('2026-03-29');
    expect(localDate(at('2026-03-29T22:00:00Z'))).toBe('2026-03-30');
  });

  it('handles the fall-back day (2026-10-25, 03:00 → 02:00)', () => {
    // The day starts in CEST and ends in CET, so it is 25 hours long.
    expect(localDate(at('2026-10-24T21:59:59Z'))).toBe('2026-10-24');
    expect(localDate(at('2026-10-24T22:00:00Z'))).toBe('2026-10-25');
    expect(localDate(at('2026-10-25T22:59:59Z'))).toBe('2026-10-25');
    expect(localDate(at('2026-10-25T23:00:00Z'))).toBe('2026-10-26');
  });
});

describe('localHour', () => {
  it('uses 0 for midnight, not 24', () => {
    expect(localHour(at('2026-01-15T23:00:00Z'))).toBe(0);
  });

  it('follows the zone offset', () => {
    expect(localHour(at('2026-01-15T05:59:00Z'))).toBe(6);
    expect(localHour(at('2026-07-15T05:59:00Z'))).toBe(7);
  });

  it('skips 02:xx on the spring-forward day', () => {
    expect(localHour(at('2026-03-29T00:59:59Z'))).toBe(1);
    expect(localHour(at('2026-03-29T01:00:00Z'))).toBe(3);
  });

  it('repeats 02:xx on the fall-back day', () => {
    expect(localHour(at('2026-10-25T00:30:00Z'))).toBe(2);
    expect(localHour(at('2026-10-25T01:30:00Z'))).toBe(2);
  });
});

describe('dayNumber', () => {
  it('counts days since 1970-01-01', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('1969-12-31')).toBe(-1);
  });

  it('steps by exactly one across DST changes and leap days', () => {
    for (const day of ['2026-03-28', '2026-03-29', '2026-10-25', '2028-02-28', '2028-02-29']) {
      expect(dayNumber(addDays(day, 1)) - dayNumber(day)).toBe(1);
    }
  });

  it('round-trips with fromDayNumber', () => {
    expect(fromDayNumber(dayNumber('2026-10-29'))).toBe('2026-10-29');
  });

  it.each(['2026-02-30', '2026-13-01', '2026-1-01', '26-01-01', '2026-01-01T00:00', ''])(
    'rejects %j',
    (date) => {
      expect(() => dayNumber(date)).toThrow(RangeError);
    },
  );
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('weeks', () => {
  it('numbers weekdays from Monday = 1 to Sunday = 7', () => {
    expect(isoWeekday('2026-10-26')).toBe(1);
    expect(isoWeekday('2026-10-29')).toBe(4);
    expect(isoWeekday('2026-11-01')).toBe(7);
    expect(isoWeekday('1969-12-29')).toBe(1);
  });

  it.each([
    ['2026-10-26', '2026-10-26'],
    ['2026-10-29', '2026-10-26'],
    ['2026-11-01', '2026-10-26'],
    ['2026-11-02', '2026-11-02'],
    // A week across the new year.
    ['2027-01-01', '2026-12-28'],
  ])('the week of %s starts on %s', (date, monday) => {
    expect(weekStart(date)).toBe(monday);
  });

  it('is Monday to the next Monday, end exclusive', () => {
    expect(weekRange('2026-11-01')).toEqual({ start: '2026-10-26', end: '2026-11-02' });
  });
});

describe('month and year ranges', () => {
  it.each([
    ['2026-10-29', '2026-10-01', '2026-11-01'],
    ['2026-12-31', '2026-12-01', '2027-01-01'],
    ['2028-02-29', '2028-02-01', '2028-03-01'],
  ])('the month of %s is [%s, %s)', (date, start, end) => {
    expect(monthRange(date)).toEqual({ start, end });
  });

  it('covers the calendar year', () => {
    expect(yearRange('2026-10-29')).toEqual({ start: '2026-01-01', end: '2027-01-01' });
  });

  it('periodRange picks the matching range', () => {
    expect(periodRange('week', '2026-10-29')).toEqual(weekRange('2026-10-29'));
    expect(periodRange('month', '2026-10-29')).toEqual(monthRange('2026-10-29'));
    expect(periodRange('year', '2026-10-29')).toEqual(yearRange('2026-10-29'));
  });

  it('rejects an invalid date', () => {
    expect(() => monthRange('2026-02-30')).toThrow(RangeError);
  });
});
