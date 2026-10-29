import { Inject, Injectable } from '@nestjs/common';
import { type HomeResponse, type LocalDate, localDate } from '@toasthub/shared';
import { and, count, eq } from 'drizzle-orm';

import { AppError } from '../../common/errors/app-error';
import { type Database, DB } from '../../db/db.module';
import { clanMembership, toast, user } from '../../db/schema';
import { StreaksService } from '../streaks/streaks.service';
import { countableToasts } from '../toasts/countable-toasts';
import { FactsService } from './facts.service';

@Injectable()
export class HomeService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly facts: FactsService,
    private readonly streaks: StreaksService,
  ) {}

  async get(userId: string): Promise<HomeResponse> {
    const today = localDate(new Date());
    const [me] = await this.db
      .select({ locale: user.locale, clanId: clanMembership.clanId })
      .from(user)
      .leftJoin(clanMembership, eq(clanMembership.userId, user.id))
      .where(eq(user.id, userId));
    if (!me) throw new AppError('NOT_FOUND', 'User not found');

    const [todayCount, streak, clanStreak, fact] = await Promise.all([
      this.countOn(userId, today),
      this.streaks.forUser(userId, today),
      me.clanId ? this.streaks.forClan(me.clanId, today) : null,
      this.facts.forDay(today, me.locale),
    ]);
    return { todayCount, streak, clanStreak, fact, toastOfTheWeek: null };
  }

  private async countOn(userId: string, date: LocalDate): Promise<number> {
    const [day] = await this.db
      .select({ count: count() })
      .from(toast)
      .where(and(eq(toast.userId, userId), eq(toast.localDate, date), countableToasts()));
    return day?.count ?? 0;
  }
}
