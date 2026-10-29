import { Inject, Injectable } from '@nestjs/common';
import { type AchievementCode, achievementsFor } from '@toasthub/shared';
import { and, count, eq } from 'drizzle-orm';

import { type Database, DB } from '../../db/db.module';
import { toast, userAchievement } from '../../db/schema';
import { StreaksService } from '../streaks/streaks.service';
import { countableToasts } from '../toasts/countable-toasts';
import {
  type AchievementEvent,
  type AchievementStats,
  isMet,
  needsStats,
} from './achievement-rules';

// Stands in when no candidate's condition needs stats, so its values are never read.
const NO_STATS: AchievementStats = { toastCount: 0, photoToastCount: 0, longestStreak: 0 };

@Injectable()
export class AchievementsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly streaks: StreaksService,
  ) {}

  /**
   * Awards the achievements of the event's trigger whose condition the user now meets (SPEC §4.12) and
   * returns the newly earned codes in display order. Earned rows are kept forever, so an achievement is
   * returned at most once per user, also under concurrent calls.
   */
  async evaluate(userId: string, event: AchievementEvent): Promise<AchievementCode[]> {
    const earned = await this.db
      .select({ code: userAchievement.achievementCode })
      .from(userAchievement)
      .where(eq(userAchievement.userId, userId));
    const earnedCodes = new Set<string>(earned.map((row) => row.code));
    const candidates = achievementsFor(event.trigger).filter((a) => !earnedCodes.has(a.code));
    if (candidates.length === 0) return [];

    const stats = candidates.some((a) => needsStats(a.condition))
      ? await this.loadStats(userId)
      : NO_STATS;
    const met = candidates.filter((a) => isMet(a.condition, event, stats)).map((a) => a.code);
    if (met.length === 0) return [];

    const inserted = await this.db
      .insert(userAchievement)
      .values(met.map((code) => ({ userId, achievementCode: code })))
      .onConflictDoNothing()
      .returning({ code: userAchievement.achievementCode });
    const insertedCodes = new Set<string>(inserted.map((row) => row.code));
    return met.filter((code) => insertedCodes.has(code));
  }

  private async loadStats(userId: string): Promise<AchievementStats> {
    const [[totals], streak] = await Promise.all([
      this.db
        .select({ toastCount: count(), photoToastCount: count(toast.photoKey) })
        .from(toast)
        .where(and(eq(toast.userId, userId), countableToasts())),
      this.streaks.forUser(userId),
    ]);
    return {
      toastCount: totals?.toastCount ?? 0,
      photoToastCount: totals?.photoToastCount ?? 0,
      longestStreak: streak.longest,
    };
  }
}
