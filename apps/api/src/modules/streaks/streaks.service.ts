import { Inject, Injectable } from '@nestjs/common';
import { type LocalDate, localDate, type Streak } from '@toasthub/shared';
import { and, eq, type SQL } from 'drizzle-orm';

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

  private async toastDays(owner: SQL): Promise<LocalDate[]> {
    const rows = await this.db
      .selectDistinct({ day: toast.localDate })
      .from(toast)
      .where(and(owner, countableToasts()))
      .orderBy(toast.localDate);
    return rows.map((row) => row.day);
  }
}
