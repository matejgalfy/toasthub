import { Inject, Injectable } from '@nestjs/common';
import { addDays, type LocalDate, localDate, type Streak } from '@toasthub/shared';
import { and, desc, eq, gte, inArray, lt, type SQL } from 'drizzle-orm';

import { type Database, DB } from '../../db/db.module';
import { toast } from '../../db/schema';
import { countableToasts } from '../toasts/countable-toasts';
import { computeStreak } from './streak';

/** User and clan streaks, computed on read from the `(owner, local_date)` indexes (SPEC §12 D8). */
@Injectable()
export class StreaksService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async forUser(userId: string, today: LocalDate = localDate(new Date())): Promise<Streak> {
    return computeStreak(await this.toastDays(eq(toast.userId, userId)), today);
  }

  /** Counts the toasts credited to the clan when they were logged (SPEC §12 D9). */
  async forClan(clanId: string, today: LocalDate = localDate(new Date())): Promise<Streak> {
    return computeStreak(await this.toastDays(eq(toast.clanId, clanId)), today);
  }

  /**
   * The current streak of several clans, keyed by clan id. A board needs only the run up to today, so the
   * days are read backwards in windows that double in size, until each clan's run starts inside one. Reading
   * all their days instead took 370 ms for 50 clans on 500k toasts (M14 handoff notes).
   */
  async currentForClans(
    clanIds: readonly string[],
    today: LocalDate = localDate(new Date()),
    firstWindowDays = 64,
  ): Promise<Map<string, number>> {
    const current = new Map<string, number>();
    // Newest first, collected window by window.
    const days = new Map<string, LocalDate[]>(clanIds.map((id) => [id, []]));
    let pending = [...clanIds];
    let end = addDays(today, 1);
    let size = firstWindowDays;
    while (pending.length > 0) {
      const start = addDays(end, -size);
      const rows = await this.db
        .selectDistinct({ clanId: toast.clanId, day: toast.localDate })
        .from(toast)
        .where(
          and(
            inArray(toast.clanId, pending),
            gte(toast.localDate, start),
            lt(toast.localDate, end),
            countableToasts(),
          ),
        )
        .orderBy(desc(toast.localDate));
      for (const row of rows) if (row.clanId !== null) days.get(row.clanId)?.push(row.day);
      pending = pending.filter((id) => {
        const newestFirst = days.get(id) ?? [];
        const run = computeStreak([...newestFirst].reverse(), today).current;
        // A run that starts on the window's first day may go on before it.
        const [last] = newestFirst;
        if (run > 0 && last !== undefined && addDays(last, 1 - run) === start) return true;
        current.set(id, run);
        return false;
      });
      end = start;
      size *= 2;
    }
    return current;
  }

  private async toastDays(owner: SQL): Promise<LocalDate[]> {
    const rows = await this.db
      .selectDistinct({ day: toast.localDate })
      .from(toast)
      .where(and(owner, countableToasts()))
      .orderBy(toast.localDate);
    return rows.map((row) => row.day);
  }
}
