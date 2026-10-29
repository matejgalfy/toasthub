import { Inject, Injectable } from '@nestjs/common';
import {
  type ClanLeaderboard,
  type ClanMemberLeaderboard,
  type DateRange,
  LEADERBOARD_SIZE,
  type LocalDate,
  localDate,
  type Period,
  periodRange,
  type UserLeaderboard,
  UserStatus,
} from '@toasthub/shared';
import { and, asc, desc, eq, gte, isNull, lt, ne, type SQL, sql } from 'drizzle-orm';

import { type Database, DB } from '../../db/db.module';
import { clan, clanMembership, toast, user } from '../../db/schema';
import { ClansService } from '../clans/clans.service';
import { StreaksService } from '../streaks/streaks.service';
import { countableToasts } from '../toasts/countable-toasts';
import { rankByCount } from './ranking';

const userSummaryColumns = { id: user.id, displayName: user.displayName, avatarId: user.avatarId };
const toastCount = sql<number>`count(*)::int`;

function inPeriod({ start, end }: DateRange): SQL | undefined {
  return and(gte(toast.localDate, start), lt(toast.localDate, end));
}

/**
 * The three boards of SPEC §4.7, read straight from `toast` (D8). Each board is ranked as a whole, so the
 * caller's own row has its true rank even when it is below the listed top.
 */
@Injectable()
export class LeaderboardsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clanService: ClansService,
    private readonly streaks: StreaksService,
  ) {}

  /** Every onboarded user with a countable toast in the period. Clan-only profiles are listed too. */
  async users(
    viewerId: string,
    period: Period,
    today: LocalDate = localDate(new Date()),
  ): Promise<UserLeaderboard> {
    const rows = await this.db
      .select({ user: userSummaryColumns, count: toastCount })
      .from(toast)
      .innerJoin(user, eq(user.id, toast.userId))
      .where(and(inPeriod(periodRange(period, today)), countableToasts(), ne(user.displayName, '')))
      .groupBy(user.id)
      .orderBy(desc(toastCount), asc(user.displayName), asc(user.id));
    const ranked = rankByCount(rows);
    return {
      items: ranked.slice(0, LEADERBOARD_SIZE),
      me: ranked.find((row) => row.user.id === viewerId) ?? null,
    };
  }

  /** Clans that are not deleted, by the toasts credited to them when logged (D9), with the current streak. */
  async clans(
    viewerId: string,
    period: Period,
    today: LocalDate = localDate(new Date()),
  ): Promise<ClanLeaderboard> {
    const [rows, [membership]] = await Promise.all([
      this.db
        .select({ clan: { id: clan.id, name: clan.name }, count: toastCount })
        .from(toast)
        .innerJoin(clan, and(eq(clan.id, toast.clanId), isNull(clan.deletedAt)))
        .where(and(inPeriod(periodRange(period, today)), countableToasts()))
        .groupBy(clan.id)
        .orderBy(desc(toastCount), asc(sql`lower(${clan.name})`), asc(clan.id)),
      this.db
        .select({ clanId: clanMembership.clanId })
        .from(clanMembership)
        .where(eq(clanMembership.userId, viewerId)),
    ]);
    const ranked = rankByCount(rows);
    const top = ranked.slice(0, LEADERBOARD_SIZE);
    const mine = ranked.find((row) => row.clan.id === membership?.clanId);
    const shown = mine && !top.includes(mine) ? [...top, mine] : top;
    const streaks = await this.streaks.currentForClans(
      shown.map((row) => row.clan.id),
      today,
    );
    const withStreak = (row: (typeof ranked)[number]) => ({
      ...row,
      currentStreak: streaks.get(row.clan.id) ?? 0,
    });
    return { items: top.map(withStreak), myClan: mine ? withStreak(mine) : null };
  }

  /**
   * Every current member who isn't banned, by the toasts they logged for this clan (D9); members without one
   * share the last rank. Any signed-in user may look, as on the other boards. 404 for an unknown clan.
   */
  async clanMembers(
    clanId: string,
    period: Period,
    today: LocalDate = localDate(new Date()),
  ): Promise<ClanMemberLeaderboard> {
    await this.clanService.assertExists(clanId);
    const counted = this.db
      .select({ userId: toast.userId, count: toastCount.as('count') })
      .from(toast)
      .where(and(eq(toast.clanId, clanId), inPeriod(periodRange(period, today)), countableToasts()))
      .groupBy(toast.userId)
      .as('counted');
    const memberCount = sql<number>`coalesce(${counted.count}, 0)`;
    const rows = await this.db
      .select({ user: userSummaryColumns, count: memberCount })
      .from(clanMembership)
      .innerJoin(user, and(eq(user.id, clanMembership.userId), eq(user.status, UserStatus.active)))
      .leftJoin(counted, eq(counted.userId, clanMembership.userId))
      .where(eq(clanMembership.clanId, clanId))
      .orderBy(desc(memberCount), asc(user.displayName), asc(user.id));
    return { items: rankByCount(rows) };
  }
}
