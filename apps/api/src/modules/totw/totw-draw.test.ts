import { describe, expect, it } from 'vitest';

import { hasWeekEnded, isMonday, pickWinner, previousWeekStart } from './totw-draw';

describe('pickWinner', () => {
  it('has no winner without candidates', () => {
    expect(pickWinner([], () => 0)).toBeNull();
  });

  it('asks for an index below the number of candidates and takes that one', () => {
    const asked: number[] = [];
    const winner = pickWinner(['a', 'b', 'c'], (n) => {
      asked.push(n);
      return 2;
    });
    expect(asked).toEqual([3]);
    expect(winner).toBe('c');
  });

  it('gives every candidate the same chance', () => {
    const candidates = ['a', 'b', 'c', 'd'];
    const wins = new Map<string, number>();
    // Every index once: a uniform source must make every candidate win exactly once.
    for (let i = 0; i < candidates.length; i++) {
      const winner = pickWinner(candidates, () => i);
      if (winner !== null) wins.set(winner, (wins.get(winner) ?? 0) + 1);
    }
    expect(Object.fromEntries(wins)).toEqual({ a: 1, b: 1, c: 1, d: 1 });
  });

  it('rejects an index the source should never give', () => {
    expect(() => pickWinner(['a', 'b'], () => 2)).toThrow(RangeError);
    expect(() => pickWinner(['a', 'b'], () => -1)).toThrow(RangeError);
    expect(() => pickWinner(['a', 'b'], () => 0.5)).toThrow(RangeError);
  });
});

describe('previousWeekStart', () => {
  it('is the Monday a week before the current week', () => {
    // Monday 2026-11-02 00:00 draws 2026-10-26 … 2026-11-01.
    expect(previousWeekStart('2026-11-02')).toBe('2026-10-26');
    expect(previousWeekStart('2026-11-08')).toBe('2026-10-26');
  });

  it('crosses a year', () => {
    expect(previousWeekStart('2027-01-04')).toBe('2026-12-28');
  });
});

describe('isMonday', () => {
  it('accepts only Mondays', () => {
    expect(isMonday('2026-10-26')).toBe(true);
    expect(isMonday('2026-10-27')).toBe(false);
    expect(isMonday('2026-11-01')).toBe(false);
  });
});

describe('hasWeekEnded', () => {
  it('is true from the next Monday on', () => {
    expect(hasWeekEnded('2026-10-26', '2026-11-01')).toBe(false);
    expect(hasWeekEnded('2026-10-26', '2026-11-02')).toBe(true);
    expect(hasWeekEnded('2026-10-26', '2026-12-01')).toBe(true);
  });
});
