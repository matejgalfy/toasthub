import { addDays, isoWeekday, type LocalDate, weekStart } from '@toasthub/shared';

/** Returns a random integer in `[0, n)`. Injected, so tests decide who wins. */
export type RandomIndex = (n: number) => number;

/** A uniform pick: every candidate has the same chance (BR-TOTW-2). Null when there is none (BR-TOTW-3). */
export function pickWinner<T>(candidates: readonly T[], randomIndex: RandomIndex): T | null {
  if (candidates.length === 0) return null;
  const index = randomIndex(candidates.length);
  const winner = Number.isInteger(index) ? candidates[index] : undefined;
  if (winner === undefined) {
    throw new RangeError(
      `Random index ${String(index)} is outside 0..${String(candidates.length - 1)}`,
    );
  }
  return winner;
}

/** The Monday of the week before the one `today` is in: the week the Monday draw is for (BR-TOTW-1). */
export function previousWeekStart(today: LocalDate): LocalDate {
  return addDays(weekStart(today), -7);
}

export function isMonday(date: LocalDate): boolean {
  return isoWeekday(date) === 1;
}

/** A week can be drawn once its Sunday is over, so no toast of it can change any more (BR-TOAST-7). */
export function hasWeekEnded(start: LocalDate, today: LocalDate): boolean {
  return addDays(start, 7) <= today;
}
