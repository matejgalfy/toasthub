import { Inject, Injectable } from '@nestjs/common';
import { FlagStatus, FlagType } from '@toasthub/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { AppError } from '../../common/errors/app-error';
import { RateLimiter } from '../../common/rate-limiter';
import { type Database, DB, type DbExecutor } from '../../db/db.module';
import {
  clanMembership,
  flag,
  like,
  toast,
  toastOfTheWeek,
  toastSession,
  user,
} from '../../db/schema';
import type { Viewer } from '../users/users.policy';
import { countableToasts } from './countable-toasts';
import { assertCanLike, assertCanReport, type ReactionFacts } from './toasts.policy';

/** Photo reports per user and hour (BR-MOD-3); every attempt counts. */
export const REPORT_RATE_LIMIT = 10;
const HOUR_MS = 60 * 60 * 1000;

const earlier = alias(toast, 'earlier');

/** Likes and photo reports on a toast session's lead toast (SPEC §4.4, §4.9, §12 D43). */
@Injectable()
export class ToastsService {
  private readonly reportLimiter = new RateLimiter(REPORT_RATE_LIMIT, HOUR_MS);

  constructor(@Inject(DB) private readonly db: Database) {}

  /** Idempotent. The session row is shared-locked, so a like can't outlive a concurrent delete. */
  async like(userId: string, toastId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const { viewer, facts } = await this.load(tx, userId, toastId, true);
      assertCanLike(viewer, facts);
      await tx.insert(like).values({ userId, toastId }).onConflictDoNothing();
    });
  }

  /** Idempotent, and needs no access: taking back the own like is always allowed. */
  async unlike(userId: string, toastId: string): Promise<void> {
    await this.db.delete(like).where(and(eq(like.userId, userId), eq(like.toastId, toastId)));
  }

  /**
   * Opens a `photo_report` flag for an admin (BR-MOD-3); the photo stays visible until one hides it. A
   * second report from the same user while theirs is still open adds nothing.
   */
  async report(userId: string, toastId: string, reason?: string | null): Promise<void> {
    if (!this.reportLimiter.tryHit(userId)) {
      throw new AppError('RATE_LIMITED', 'Too many reports, try again later');
    }
    const { viewer, facts } = await this.load(this.db, userId, toastId, false);
    assertCanReport(viewer, facts);
    const [open] = await this.db
      .select({ id: flag.id })
      .from(flag)
      .where(
        and(
          eq(flag.type, FlagType.photo_report),
          eq(flag.toastId, toastId),
          eq(flag.reporterId, userId),
          eq(flag.status, FlagStatus.open),
        ),
      );
    if (open) return;
    await this.db.insert(flag).values({
      type: FlagType.photo_report,
      subjectUserId: facts.owner.userId,
      toastId,
      reporterId: userId,
      // An empty reason is stored as none.
      reason: reason === '' ? null : (reason ?? null),
    });
  }

  /** The facts the policy needs; 404 for an unknown toast. */
  private async load(
    db: DbExecutor,
    viewerId: string,
    toastId: string,
    lockSession: boolean,
  ): Promise<{ viewer: Viewer; facts: ReactionFacts }> {
    const query = db
      .select({
        ownerId: toast.userId,
        profileVisibility: user.profileVisibility,
        hasPhoto: sql<boolean>`${toast.photoKey} IS NOT NULL`,
        hidden: sql<boolean>`${toast.photoHiddenAt} IS NOT NULL`,
        countable: sql<boolean>`${countableToasts()}`,
        // The lead toast is the oldest one not deleted (SPEC §12 D44).
        isLead: sql<boolean>`NOT EXISTS (
          SELECT 1 FROM ${toast} AS ${earlier}
          WHERE ${earlier.sessionId} = ${toast.sessionId} AND ${earlier.deletedAt} IS NULL
            AND (${earlier.eatenAt}, ${earlier.id}) < (${toast.eatenAt}, ${toast.id})
        )`,
        wonToastOfTheWeek: sql<boolean>`EXISTS (
          SELECT 1 FROM ${toastOfTheWeek} WHERE ${toastOfTheWeek.toastId} = ${toast.id}
        )`,
      })
      .from(toast)
      .innerJoin(toastSession, eq(toastSession.id, toast.sessionId))
      .innerJoin(user, eq(user.id, toast.userId))
      .where(eq(toast.id, toastId));
    const [row] = lockSession ? await query.for('share', { of: toastSession }) : await query;
    if (!row) throw new AppError('NOT_FOUND', 'Toast not found');

    const memberships = await db
      .select({ userId: clanMembership.userId, clanId: clanMembership.clanId })
      .from(clanMembership)
      .where(inArray(clanMembership.userId, [viewerId, row.ownerId]));
    const clanOf = (userId: string) =>
      memberships.find((membership) => membership.userId === userId)?.clanId ?? null;
    return {
      viewer: { userId: viewerId, clanId: clanOf(viewerId) },
      facts: {
        owner: {
          userId: row.ownerId,
          profileVisibility: row.profileVisibility,
          clanId: clanOf(row.ownerId),
        },
        hasPhoto: row.hasPhoto,
        hidden: row.hidden,
        removed: !row.countable,
        wonToastOfTheWeek: row.wonToastOfTheWeek,
        isLead: row.isLead,
      },
    };
  }
}
