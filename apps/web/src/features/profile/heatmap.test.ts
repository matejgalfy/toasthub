import { describe, expect, it } from 'vitest';

import { heatLevel, heatmapMonths } from './heatmap';

describe('heatLevel', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [10, 4],
  ])('%i toasts are level %i', (count, level) => {
    expect(heatLevel(count)).toBe(level);
  });
});

describe('heatmapMonths', () => {
  const months = heatmapMonths(
    {
      year: 2024,
      days: [
        { date: '2024-02-29', count: 2 },
        { date: '2024-12-31', count: 5 },
      ],
    },
    '2024-06-15',
  );

  it('fills every day of a leap year, month by month', () => {
    expect(months).toHaveLength(12);
    expect(months.map((month) => month.days.length)).toEqual([
      31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ]);
    expect(months[1]?.start).toBe('2024-02-01');
    expect(months[1]?.days.at(-1)?.date).toBe('2024-02-29');
  });

  it('puts the 1st under its weekday, Monday first', () => {
    // 2024-01-01 was a Monday, 2024-09-01 a Sunday.
    expect(months[0]?.offset).toBe(0);
    expect(months[8]?.offset).toBe(6);
  });

  it('carries the counts of the days with toasts and zero elsewhere', () => {
    expect(months[1]?.days.at(-1)).toMatchObject({ count: 2, level: 2 });
    expect(months[1]?.days[0]).toMatchObject({ count: 0, level: 0 });
    expect(months[11]?.days.at(-1)).toMatchObject({ count: 5, level: 4 });
  });

  it('marks the days after today', () => {
    expect(months[5]?.days[14]).toMatchObject({ date: '2024-06-15', future: false });
    expect(months[5]?.days[15]).toMatchObject({ date: '2024-06-16', future: true });
  });
});
