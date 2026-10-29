import { describe, expect, it } from 'vitest';

import { rankByCount } from './ranking';

const ranks = (counts: number[]) =>
  rankByCount(counts.map((count) => ({ count }))).map((r) => r.rank);

describe('rankByCount', () => {
  it('ranks distinct counts 1, 2, 3', () => {
    expect(ranks([9, 5, 1])).toEqual([1, 2, 3]);
  });

  it('gives ties the same rank and skips the next one (1, 1, 3)', () => {
    expect(ranks([7, 7, 3])).toEqual([1, 1, 3]);
    expect(ranks([7, 4, 4, 4, 2])).toEqual([1, 2, 2, 2, 5]);
  });

  it('ranks everyone first when all counts are equal, also at zero', () => {
    expect(ranks([0, 0, 0])).toEqual([1, 1, 1]);
  });

  it('returns an empty board for no rows', () => {
    expect(rankByCount([])).toEqual([]);
  });

  it('keeps the rows and their order within a tie', () => {
    const rows = [
      { id: 'b', count: 2 },
      { id: 'a', count: 2 },
    ];
    expect(rankByCount(rows)).toEqual([
      { id: 'b', count: 2, rank: 1 },
      { id: 'a', count: 2, rank: 1 },
    ]);
  });

  it('refuses rows that are not sorted by count', () => {
    expect(() => ranks([1, 2])).toThrow(RangeError);
  });
});
