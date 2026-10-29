import { describe, expect, it } from 'vitest';

import { computeStreak } from './streak';

const TODAY = '2026-10-29';

describe('computeStreak', () => {
  it('is zero without any toast', () => {
    expect(computeStreak([], TODAY)).toEqual({ current: 0, longest: 0 });
  });

  it('counts a single day today', () => {
    expect(computeStreak([TODAY], TODAY)).toEqual({ current: 1, longest: 1 });
  });

  it('keeps the streak alive through today when only yesterday has a toast', () => {
    expect(computeStreak(['2026-10-27', '2026-10-28'], TODAY)).toEqual({ current: 2, longest: 2 });
  });

  it('counts today on top of the run up to yesterday', () => {
    expect(computeStreak(['2026-10-27', '2026-10-28', TODAY], TODAY)).toEqual({
      current: 3,
      longest: 3,
    });
  });

  it('breaks when neither today nor yesterday has a toast', () => {
    expect(computeStreak(['2026-10-26', '2026-10-27'], TODAY)).toEqual({ current: 0, longest: 2 });
  });

  it('restarts after a gap and keeps the longest run', () => {
    const days = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-25', TODAY];
    expect(computeStreak(days, TODAY)).toEqual({ current: 1, longest: 4 });
  });

  it('runs across month and year ends', () => {
    expect(computeStreak(['2026-12-30', '2026-12-31', '2027-01-01'], '2027-01-01')).toEqual({
      current: 3,
      longest: 3,
    });
    expect(computeStreak(['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01').current).toBe(3);
  });

  it('does not break on the 23-hour and 25-hour days of a DST change', () => {
    // Europe/Bratislava springs forward on 2026-03-29 and falls back on 2026-10-25.
    expect(computeStreak(['2026-03-28', '2026-03-29', '2026-03-30'], '2026-03-30').current).toBe(3);
    expect(computeStreak(['2026-10-24', '2026-10-25', '2026-10-26'], '2026-10-26').current).toBe(3);
  });

  it('ignores duplicate days and days after today', () => {
    expect(computeStreak(['2026-10-28', '2026-10-28', TODAY, '2026-10-30'], TODAY)).toEqual({
      current: 2,
      longest: 2,
    });
  });
});
