import { Inject, Injectable } from '@nestjs/common';
import { type HomeResponse, type LocalDate, localDate } from '@toasthub/shared';
import { and, count, eq, isNull } from 'drizzle-orm';

import { AppError } from '../../common/errors/app-error';
import { type Database, DB } from '../../db/db.module';
import { clan, clanMembership, toast, user } from '../../db/schema';
import { StreaksService } from '../streaks/streaks.service';
import { countableToasts } from '../toasts/countable-toasts';
import { TotwService } from '../totw/totw.service';
import { FactsService } from './facts.service';

@Injectable()
export class HomeService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly facts: FactsService,
    private readonly streaks: StreaksService,
    private readonly totw: TotwService,
  ) {}

  async get(userId: string): Promise<HomeResponse> {
    const today = localDate(new Date());
    const [me] = await this.db
      .select({
        locale: user.locale,
        clan: { id: clan.id, name: clan.name, avatarId: clan.avatarId },
      })
      .from(user)
      .leftJoin(clanMembership, eq(clanMembership.userId, user.id))
      .leftJoin(clan, and(eq(clan.id, clanMembership.clanId), isNull(clan.deletedAt)))
      .where(eq(user.id, userId));
    if (!me) throw new AppError('NOT_FOUND', 'User not found');

    const [todayCount, streak, clanStreak, fact, toastOfTheWeek] = await Promise.all([
      this.countOn(userId, today),
      this.streaks.forUser(userId, today),
      me.clan ? this.streaks.forClan(me.clan.id, today) : null,
      this.facts.forDay(today, me.locale),
      this.totw.lastWeek(userId, today),
    ]);
    return { todayCount, streak, clan: me.clan, clanStreak, fact, toastOfTheWeek };
  }

  private async countOn(userId: string, date: LocalDate): Promise<number> {
    const [day] = await this.db
      .select({ count: count() })
      .from(toast)
      .where(and(eq(toast.userId, userId), eq(toast.localDate, date), countableToasts()));
    return day?.count ?? 0;
  }
}
