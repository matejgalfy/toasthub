import { Inject, Injectable } from '@nestjs/common';
import { type FeedPage, type PageQuery, ToastStatus, UserStatus } from '@toasthub/shared';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { decodeCursor, toPage } from '../../common/pagination';
import { type Database, DB } from '../../db/db.module';
import { clanMembership, toast, toastSession, user } from '../../db/schema';
import { StorageService } from '../storage/storage.service';
import { countableToasts } from '../toasts/countable-toasts';
import { likeStats } from '../toasts/like-stats';
import { canSeePhoto } from '../users/users.policy';

// `created_at` with all six fraction digits: a JS Date would round it to milliseconds and skip rows.
const cursorAt = sql<string>`to_char(${toastSession.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const keysetSchema = z.object({ at: z.iso.datetime(), id: z.uuid() });

const sessionCount = sql<number>`(
  SELECT count(*)::int FROM ${toast} WHERE ${toast.sessionId} = ${toastSession.id} AND ${countableToasts()}
)`;

export interface FeedScope {
  // Only sessions of this clan's current members (the clan feed, §4.8); every user when left out (§4.14).
  clanId?: string;
}

/**
 * Toast sessions newest first, for the global feed on home and for a clan's feed (SPEC §4.8, §4.14, §12
 * D48, D67). Callers check access first: anyone signed in may read the global feed, only members a clan's.
 */
@Injectable()
export class FeedService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  /**
   * Every session that isn't deleted and whose lead toast counts: a rejected session or one of a banned
   * user leaves the feed. A clan feed also lists a member's sessions from before they joined.
   */
  async list(
    viewerId: string,
    { cursor, limit }: PageQuery,
    scope: FeedScope = {},
  ): Promise<FeedPage> {
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
    const base = this.db
      .select({
        sessionId: toastSession.id,
        createdAt: toastSession.createdAt,
        localDate: toastSession.localDate,
        cursorAt,
        count: sessionCount,
        user: { id: user.id, displayName: user.displayName, avatarId: user.avatarId },
        toastId: lead.id,
        photoKey: lead.photoKey,
        photoHiddenAt: lead.photoHiddenAt,
      })
      .from(toastSession)
      // A banned user's toasts don't count, so their sessions leave the feed.
      .innerJoin(user, and(eq(user.id, toastSession.userId), eq(user.status, UserStatus.active)))
      .innerJoinLateral(lead, sql`true`)
      .$dynamic();
    const scoped =
      scope.clanId === undefined
        ? base
        : base.innerJoin(
            clanMembership,
            and(
              eq(clanMembership.userId, toastSession.userId),
              eq(clanMembership.clanId, scope.clanId),
            ),
          );
    const rows = await scoped
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

    const items = await Promise.all(
      page.items.map(async (row) => {
        const visible = canSeePhoto({
          hasPhoto: row.photoKey !== null,
          hidden: row.photoHiddenAt !== null,
          removed: false,
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
