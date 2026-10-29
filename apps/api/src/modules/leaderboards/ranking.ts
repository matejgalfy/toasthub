/**
 * Competition ranking by count, highest first: ties share a rank and the next rank skips (1, 1, 3), as SPEC
 * §4.7 asks. `rows` must already be sorted by count, descending; their order within a tie is kept.
 */
export function rankByCount<T extends { count: number }>(
  rows: readonly T[],
): (T & { rank: number })[] {
  let rank = 0;
  let previous: number | undefined;
  return rows.map((row, i) => {
    if (row.count > (previous ?? Infinity)) {
      throw new RangeError('rankByCount needs rows sorted by count, descending');
    }
    if (row.count !== previous) rank = i + 1;
    previous = row.count;
    return { ...row, rank };
  });
}
