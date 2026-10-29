import { describe, expect, it } from 'vitest';

import { computeStats } from './stats';

describe('computeStats', () => {
  it('is all zero before the first toast', () => {
    expect(computeStats([], '2026-10-29')).toEqual({
      totals: { allTime: 0, firstToastDate: null },
      averages: { perDay: 0, perWeek: 0, perMonth: 0 },
      bestDay: null,
      streak: { current: 0, longest: 0 },
    });
  });

  it('counts a first toast today as one day, week and month', () => {
    expect(computeStats([{ date: '2026-10-29', count: 3 }], '2026-10-29')).toEqual({
      totals: { allTime: 3, firstToastDate: '2026-10-29' },
      averages: { perDay: 3, perWeek: 3, perMonth: 3 },
      bestDay: { date: '2026-10-29', count: 3 },
      streak: { current: 1, longest: 1 },
    });
  });

  it('divides by calendar days, weeks and months, partial ones included', () => {
    // Sunday 2026-09-27 to Thursday 2026-10-29: 33 days, 6 weeks (Mondays 21 Sep … 26 Oct), 2 months.
    const stats = computeStats(
      [
        { date: '2026-09-27', count: 4 },
        { date: '2026-10-28', count: 2 },
        { date: '2026-10-29', count: 5 },
      ],
      '2026-10-29',
    );
    expect(stats.totals).toEqual({ allTime: 11, firstToastDate: '2026-09-27' });
    expect(stats.averages.perDay).toBeCloseTo(11 / 33);
    expect(stats.averages.perWeek).toBeCloseTo(11 / 6);
    expect(stats.averages.perMonth).toBeCloseTo(11 / 2);
    expect(stats.streak).toEqual({ current: 2, longest: 2 });
  });

  it('counts months across a year boundary', () => {
    const stats = computeStats([{ date: '2025-12-31', count: 3 }], '2026-01-01');
    expect(stats.averages).toEqual({ perDay: 1.5, perWeek: 3, perMonth: 1.5 });
  });

  it('picks the earliest of equally good days as the best day', () => {
    const stats = computeStats(
      [
        { date: '2026-10-01', count: 2 },
        { date: '2026-10-05', count: 6 },
        { date: '2026-10-09', count: 6 },
      ],
      '2026-10-29',
    );
    expect(stats.bestDay).toEqual({ date: '2026-10-05', count: 6 });
  });

  it('ignores days after today', () => {
    const stats = computeStats(
      [
        { date: '2026-10-29', count: 1 },
        { date: '2026-10-30', count: 9 },
      ],
      '2026-10-29',
    );
    expect(stats.totals.allTime).toBe(1);
    expect(stats.bestDay).toEqual({ date: '2026-10-29', count: 1 });
  });
});
