import { Inject, Injectable } from '@nestjs/common';
import {
  ACHIEVEMENTS,
  type Heatmap,
  type HeatmapDay,
  type LocalDate,
  localDate,
  monthRange,
  type PageQuery,
  type PeriodCounts,
  ProfileAccess,
  type UserAchievements,
  type UserProfile,
  type UserStats,
  UserStatus,
  type UserToastPage,
  weekRange,
  yearRange,
} from '@toasthub/shared';
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  type SQL,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error';
import { decodeCursor, toPage } from '../../common/pagination';
import { type Database, DB } from '../../db/db.module';
import { clanMembership, toast, toastOfTheWeek, user, userAchievement } from '../../db/schema';
import { StorageService } from '../storage/storage.service';
import { countableToasts } from '../toasts/countable-toasts';
import { computeStats } from './stats';
import { canSeePhoto, type ProfileOwner, profileAccess, type Viewer } from './users.policy';

const subjectColumns = {
  id: user.id,
  displayName: user.displayName,
  avatarId: user.avatarId,
  profileVisibility: user.profileVisibility,
  status: user.status,
};
type SubjectRow = Pick<typeof user.$inferSelect, keyof typeof subjectColumns>;

interface Access {
  subject: SubjectRow;
  viewer: Viewer;
  owner: ProfileOwner;
  access: ProfileAccess;
}

// `eaten_at` with all six fraction digits: a JS Date would round it to milliseconds and skip rows.
const cursorAt = sql<string>`to_char(${toast.eatenAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const keysetSchema = z.object({ at: z.iso.datetime(), id: z.uuid() });

/** Profiles of any user, as far as the viewer may see them (SPEC §4.2, §4.6). */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  async getProfile(viewerId: string, subjectId: string): Promise<UserProfile> {
    const { subject, access } = await this.resolveAccess(viewerId, subjectId);
    return {
      id: subject.id,
      displayName: subject.displayName,
      avatarId: subject.avatarId,
      access,
      counts: await this.periodCounts(subject.id, localDate(new Date())),
    };
  }

  /** The user's visible photos, newest first; one per toast session, on its lead toast. */
  async listToasts(
    viewerId: string,
    subjectId: string,
    { cursor, limit }: PageQuery,
  ): Promise<UserToastPage> {
    const { viewer, owner } = await this.requireFullAccess(viewerId, subjectId);
    const after = cursor === undefined ? null : decodeCursor(cursor, keysetSchema);
    const rows = await this.db
      .select({
        id: toast.id,
        sessionId: toast.sessionId,
        eatenAt: toast.eatenAt,
        localDate: toast.localDate,
        photoKey: toast.photoKey,
        cursorAt,
        wonToastOfTheWeek: sql<boolean>`EXISTS (
          SELECT 1 FROM ${toastOfTheWeek} WHERE ${toastOfTheWeek.toastId} = ${toast.id}
        )`,
      })
      .from(toast)
      .where(
        and(
          eq(toast.userId, subjectId),
          isNotNull(toast.photoKey),
          isNull(toast.photoHiddenAt),
          countableToasts(),
          after
            ? sql`(${toast.eatenAt}, ${toast.id}) < (${after.at}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(toast.eatenAt), desc(toast.id))
      .limit(limit + 1);
    const page = toPage(rows, limit, (row) => ({ at: row.cursorAt, id: row.id }));
    const counts = await this.sessionCounts(page.items.map((row) => row.sessionId));

    const items = [];
    for (const row of page.items) {
      // The query only selects visible photos; the policy stays the last word before signing.
      const visible = canSeePhoto(viewer, {
        owner,
        hasPhoto: true,
        hidden: false,
        removed: false,
        wonToastOfTheWeek: row.wonToastOfTheWeek,
      });
      if (!visible || row.photoKey === null) continue;
      items.push({
        id: row.id,
        sessionId: row.sessionId,
        eatenAt: row.eatenAt.toISOString(),
        localDate: row.localDate,
        count: counts.get(row.sessionId) ?? 0,
        photoUrl: await this.storage.presignGet(row.photoKey),
      });
    }
    return { items, nextCursor: page.nextCursor };
  }

  async getStats(viewerId: string, subjectId: string): Promise<UserStats> {
    await this.requireFullAccess(viewerId, subjectId);
    return computeStats(await this.toastDays(eq(toast.userId, subjectId)), localDate(new Date()));
  }

  async getHeatmap(
    viewerId: string,
    subjectId: string,
    year: number | undefined,
  ): Promise<Heatmap> {
    await this.requireFullAccess(viewerId, subjectId);
    const shown = year ?? Number(localDate(new Date()).slice(0, 4));
    const range = yearRange(`${String(shown)}-01-01`);
    const days = await this.toastDays(
      and(
        eq(toast.userId, subjectId),
        gte(toast.localDate, range.start),
        lt(toast.localDate, range.end),
      ),
    );
    return { year: shown, days };
  }

  /** Every achievement in display order, with the date the user earned it. */
  async getAchievements(viewerId: string, subjectId: string): Promise<UserAchievements> {
    await this.requireFullAccess(viewerId, subjectId);
    const rows = await this.db
      .select({ code: userAchievement.achievementCode, earnedAt: userAchievement.earnedAt })
      .from(userAchievement)
      .where(eq(userAchievement.userId, subjectId));
    const earned = new Map(rows.map((row) => [row.code, row.earnedAt]));
    return {
      items: ACHIEVEMENTS.map(({ code }) => ({
        code,
        earnedAt: earned.get(code)?.toISOString() ?? null,
      })),
    };
  }

  /**
   * The subject and how much the viewer may see. 404 for an unknown or banned user and for one who hasn't
   * finished onboarding (no display name yet), so profiles never show an empty name.
   */
  private async resolveAccess(viewerId: string, subjectId: string): Promise<Access> {
    const [subject] = await this.db.select(subjectColumns).from(user).where(eq(user.id, subjectId));
    if (!subject || subject.status !== UserStatus.active || subject.displayName === '') {
      throw new AppError('NOT_FOUND', 'User not found');
    }
    const memberships = await this.db
      .select({ userId: clanMembership.userId, clanId: clanMembership.clanId })
      .from(clanMembership)
      .where(inArray(clanMembership.userId, [viewerId, subjectId]));
    const clanOf = (userId: string) =>
      memberships.find((row) => row.userId === userId)?.clanId ?? null;
    const viewer: Viewer = { userId: viewerId, clanId: clanOf(viewerId) };
    const owner: ProfileOwner = {
      userId: subject.id,
      profileVisibility: subject.profileVisibility,
      clanId: clanOf(subject.id),
    };
    return { subject, viewer, owner, access: profileAccess(viewer, owner) };
  }

  /** 403 for a viewer who only gets the reduced profile. */
  private async requireFullAccess(viewerId: string, subjectId: string): Promise<Access> {
    const resolved = await this.resolveAccess(viewerId, subjectId);
    if (resolved.access !== ProfileAccess.full) {
      throw new AppError('FORBIDDEN', 'This profile is visible to clanmates only');
    }
    return resolved;
  }

  private async periodCounts(userId: string, today: LocalDate): Promise<PeriodCounts> {
    const week = weekRange(today);
    const month = monthRange(today);
    const year = yearRange(today);
    const inRange = (range: { start: LocalDate; end: LocalDate }) =>
      sql<number>`count(*) FILTER (WHERE ${toast.localDate} >= ${range.start} AND ${toast.localDate} < ${range.end})::int`;
    // A week can start in the previous year or end in the next one.
    const from = week.start < year.start ? week.start : year.start;
    const to = week.end > year.end ? week.end : year.end;
    const [row] = await this.db
      .select({ week: inRange(week), month: inRange(month), year: inRange(year) })
      .from(toast)
      .where(
        and(
          eq(toast.userId, userId),
          gte(toast.localDate, from),
          lt(toast.localDate, to),
          countableToasts(),
        ),
      );
    return { week: row?.week ?? 0, month: row?.month ?? 0, year: row?.year ?? 0 };
  }

  /** Countable toasts per day, oldest first. */
  private async toastDays(where: SQL | undefined): Promise<HeatmapDay[]> {
    return this.db
      .select({ date: toast.localDate, count: count() })
      .from(toast)
      .where(and(where, countableToasts()))
      .groupBy(toast.localDate)
      .orderBy(toast.localDate);
  }

  private async sessionCounts(sessionIds: string[]): Promise<Map<string, number>> {
    if (sessionIds.length === 0) return new Map();
    const rows = await this.db
      .select({ sessionId: toast.sessionId, count: count() })
      .from(toast)
      .where(and(inArray(toast.sessionId, sessionIds), countableToasts()))
      .groupBy(toast.sessionId);
    return new Map(rows.map((row) => [row.sessionId, row.count]));
  }
}
