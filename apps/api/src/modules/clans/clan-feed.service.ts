import { Inject, Injectable } from '@nestjs/common';
import { type ClanFeedPage, type PageQuery, ToastStatus, UserStatus } from '@toasthub/shared';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { decodeCursor, toPage } from '../../common/pagination';
import { type Database, DB } from '../../db/db.module';
import { clanMembership, toast, toastSession, user } from '../../db/schema';
import { StorageService } from '../storage/storage.service';
import { countableToasts } from '../toasts/countable-toasts';
import { likeStats } from '../toasts/like-stats';
import { canSeePhoto, type Viewer } from '../users/users.policy';
import { ClanAction } from './clans.policy';
import { ClansService } from './clans.service';

// `created_at` with all six fraction digits: a JS Date would round it to milliseconds and skip rows.
const cursorAt = sql<string>`to_char(${toastSession.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const keysetSchema = z.object({ at: z.iso.datetime(), id: z.uuid() });

const sessionCount = sql<number>`(
  SELECT count(*)::int FROM ${toast} WHERE ${toast.sessionId} = ${toastSession.id} AND ${countableToasts()}
)`;

/** The clan feed: toast sessions of the current members, newest first (SPEC §4.8). */
@Injectable()
export class ClanFeedService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clans: ClansService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Members only. Every session of a current member, also those logged before joining, as long as its lead
   * toast counts; a session whose lead toast was rejected leaves the feed.
   */
  async list(
    viewerId: string,
    clanId: string,
    { cursor, limit }: PageQuery,
  ): Promise<ClanFeedPage> {
    await this.clans.authorize(viewerId, clanId, ClanAction.viewFeed);
    const after = cursor === undefined ? null : decodeCursor(cursor, keysetSchema);
    // The lead toast is the oldest one not deleted (SPEC §12 D44).
    const lead = this.db
      .select({
        id: toast.id,
        photoKey: toast.photoKey,
        photoHiddenAt: toast.photoHiddenAt,
        status: toast.status,
      })
      .from(toast)
      .where(and(eq(toast.sessionId, toastSession.id), isNull(toast.deletedAt)))
      .orderBy(asc(toast.eatenAt), asc(toast.id))
      .limit(1)
      .as('lead');
    const rows = await this.db
      .select({
        sessionId: toastSession.id,
        createdAt: toastSession.createdAt,
        localDate: toastSession.localDate,
        cursorAt,
        count: sessionCount,
        user: { id: user.id, displayName: user.displayName, avatarId: user.avatarId },
        profileVisibility: user.profileVisibility,
        toastId: lead.id,
        photoKey: lead.photoKey,
        photoHiddenAt: lead.photoHiddenAt,
      })
      .from(toastSession)
      .innerJoin(
        clanMembership,
        and(eq(clanMembership.userId, toastSession.userId), eq(clanMembership.clanId, clanId)),
      )
      // A banned member's toasts don't count, so their sessions leave the feed.
      .innerJoin(user, and(eq(user.id, toastSession.userId), eq(user.status, UserStatus.active)))
      .innerJoinLateral(lead, sql`true`)
      .where(
        and(
          isNull(toastSession.deletedAt),
          eq(lead.status, ToastStatus.active),
          after
            ? sql`(${toastSession.createdAt}, ${toastSession.id}) < (${after.at}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(toastSession.createdAt), desc(toastSession.id))
      .limit(limit + 1);
    const page = toPage(rows, limit, (row) => ({ at: row.cursorAt, id: row.sessionId }));
    const likesOf = await likeStats(
      this.db,
      viewerId,
      page.items.map((row) => row.toastId),
    );

    const viewer: Viewer = { userId: viewerId, clanId };
    const items = await Promise.all(
      page.items.map(async (row) => {
        // Clanmates always see each other's photos (§4.8); the policy still has the last word.
        const visible = canSeePhoto(viewer, {
          owner: { userId: row.user.id, profileVisibility: row.profileVisibility, clanId },
          hasPhoto: row.photoKey !== null,
          hidden: row.photoHiddenAt !== null,
          removed: false,
          wonToastOfTheWeek: false,
        });
        return {
          sessionId: row.sessionId,
          toastId: row.toastId,
          user: row.user,
          loggedAt: row.createdAt.toISOString(),
          localDate: row.localDate,
          count: row.count,
          photoUrl:
            visible && row.photoKey !== null ? await this.storage.presignGet(row.photoKey) : null,
          ...likesOf(row.toastId),
        };
      }),
    );
    return { items, nextCursor: page.nextCursor };
  }
}
