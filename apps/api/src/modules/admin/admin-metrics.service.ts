import { Inject, Injectable } from '@nestjs/common';
import { addDays, type AdminMetrics, FlagStatus, localDate, METRICS_DAYS } from '@toasthub/shared';
import { and, count, countDistinct, eq, gte } from 'drizzle-orm';

import { type Database, DB } from '../../db/db.module';
import { flag, toast, user } from '../../db/schema';
import { countableToasts } from '../toasts/countable-toasts';

/** The admin dashboard numbers (SPEC §4.13). */
@Injectable()
export class AdminMetricsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(now = new Date()): Promise<AdminMetrics> {
    const today = localDate(now);
    const first = addDays(today, 1 - METRICS_DAYS);
    const [users, [active], days, openFlags] = await Promise.all([
      this.db.$count(user),
      this.db
        .select({ dau: countDistinct(toast.userId) })
        .from(toast)
        .where(and(eq(toast.localDate, today), countableToasts())),
      this.db
        .select({ date: toast.localDate, count: count() })
        .from(toast)
        .where(and(gte(toast.localDate, first), countableToasts()))
        .groupBy(toast.localDate),
      this.db.$count(flag, eq(flag.status, FlagStatus.open)),
    ]);
    const byDate = new Map(days.map((day) => [day.date, day.count]));
    return {
      users,
      dau: active?.dau ?? 0,
      toastsPerDay: Array.from({ length: METRICS_DAYS }, (_, i) => {
        const date = addDays(first, i);
        return { date, count: byDate.get(date) ?? 0 };
      }),
      openFlags,
    };
  }
}
