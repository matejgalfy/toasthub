import { Inject, Injectable } from '@nestjs/common';
import {
  type Comment,
  type CommentPage,
  type CommentQuery,
  type CreateComment,
  UserRole,
  UserStatus,
} from '@toasthub/shared';
import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error';
import { decodeCursor, toPage } from '../../common/pagination';
import { consumeRateLimit } from '../../common/rate-limit';
import { type Database, DB, type DbExecutor } from '../../db/db.module';
import { comment, commentLike, toast, toastSession, user } from '../../db/schema';
import type { AuthUser } from '../auth/auth.config';
import { countableToasts } from '../toasts/countable-toasts';
import { canSeeToast } from '../users/users.policy';

export const COMMENT_RATE_LIMIT = 30;
const CREATE_LIMIT = { window: 60 * 60, max: COMMENT_RATE_LIMIT };
const earlier = alias(toast, 'earlier');
const keysetSchema = z.object({ at: z.iso.datetime(), id: z.uuid() });
// Keep Postgres microseconds in cursors so pages cannot skip comments within the same millisecond.
const cursorAt = sql<string>`to_char(${comment.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const commentColumns = {
  id: comment.id,
  toastId: comment.toastId,
  parentId: comment.parentId,
  createdAt: comment.createdAt,
  cursorAt,
  body: comment.body,
  deletedAt: comment.deletedAt,
  authorStatus: user.status,
  author: { id: user.id, displayName: user.displayName, avatarId: user.avatarId },
};
type CommentRow = {
  id: string;
  toastId: string;
  parentId: string | null;
  createdAt: Date;
  body: string | null;
  deletedAt: Date | null;
  authorStatus: string;
  author: { id: string; displayName: string; avatarId: number | null };
};

@Injectable()
export class CommentsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(
    viewer: AuthUser,
    toastId: string,
    { cursor, limit, topLevel }: CommentQuery,
  ): Promise<CommentPage> {
    await this.assertVisible(this.db, toastId);
    const after = cursor === undefined ? null : decodeCursor(cursor, keysetSchema);
    const rows = await this.db
      .select(commentColumns)
      .from(comment)
      .innerJoin(user, eq(user.id, comment.authorId))
      .where(
        and(
          eq(comment.toastId, toastId),
          topLevel ? isNull(comment.parentId) : undefined,
          after
            ? sql`(${comment.createdAt}, ${comment.id}) > (${after.at}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(asc(comment.createdAt), asc(comment.id))
      .limit(limit + 1);
    const page = toPage(rows, limit, (row) => ({ at: row.cursorAt, id: row.id }));
    const likes =
      page.items.length === 0
        ? []
        : await this.db
            .select({
              commentId: commentLike.commentId,
              likeCount: count(),
              likedByMe: sql<boolean>`bool_or(${commentLike.userId} = ${viewer.id})`,
            })
            .from(commentLike)
            .where(
              inArray(
                commentLike.commentId,
                page.items.map((row) => row.id),
              ),
            )
            .groupBy(commentLike.commentId);
    const likesByComment = new Map(likes.map(({ commentId, ...stats }) => [commentId, stats]));
    return {
      items: page.items.map((row) => this.toComment(row, viewer, likesByComment.get(row.id))),
      nextCursor: page.nextCursor,
    };
  }

  async create(viewer: AuthUser, toastId: string, input: CreateComment): Promise<Comment> {
    if (!(await consumeRateLimit(this.db, `comment:${viewer.id}`, CREATE_LIMIT)).allowed) {
      throw new AppError('RATE_LIMITED', 'Too many comments, try again later');
    }
    return this.db.transaction(async (tx) => {
      await this.assertVisible(tx, toastId, true);
      const parentId = input.parentId ?? null;
      if (parentId !== null) {
        const [parent] = await tx
          .select({ id: comment.id })
          .from(comment)
          .where(and(eq(comment.id, parentId), eq(comment.toastId, toastId)));
        if (!parent) {
          throw new AppError('VALIDATION_ERROR', 'Request validation failed', {
            parentId: 'Parent comment must belong to this toast',
          });
        }
      }
      const [inserted] = await tx
        .insert(comment)
        .values({
          toastId,
          authorId: viewer.id,
          parentId,
          body: input.body,
          // A transaction may have begun before its parent committed. The child must still sort later.
          createdAt:
            parentId === null
              ? sql`clock_timestamp()`
              : sql`greatest(clock_timestamp(), (SELECT created_at + interval '1 microsecond' FROM ${comment} WHERE id = ${parentId}::uuid))`,
        })
        .returning({ id: comment.id });
      if (!inserted) throw new Error('Comment insert returned no row');
      const [row] = await tx
        .select(commentColumns)
        .from(comment)
        .innerJoin(user, eq(user.id, comment.authorId))
        .where(eq(comment.id, inserted.id));
      if (!row) throw new Error('Inserted comment not found');
      return this.toComment(row, viewer);
    });
  }

  async delete(viewer: AuthUser, commentId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ toastId: comment.toastId, authorId: comment.authorId })
        .from(comment)
        .where(eq(comment.id, commentId));
      if (!row) throw new AppError('NOT_FOUND', 'Comment not found');
      await this.assertVisible(tx, row.toastId, true);
      if (row.authorId !== viewer.id && viewer.role !== UserRole.admin) {
        throw new AppError('FORBIDDEN', 'Only the author or an admin may delete this comment');
      }
      await tx
        .update(comment)
        .set({ body: null, deletedAt: sql`coalesce(${comment.deletedAt}, clock_timestamp())` })
        .where(eq(comment.id, commentId));
      await tx.delete(commentLike).where(eq(commentLike.commentId, commentId));
    });
  }

  async like(viewer: AuthUser, commentId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ toastId: comment.toastId })
        .from(comment)
        .where(eq(comment.id, commentId));
      if (!target) throw new AppError('NOT_FOUND', 'Comment not found');
      await this.assertVisible(tx, target.toastId, true);
      // Share-lock after the session, in the same order as delete, so removal cannot leave a late like.
      const [row] = await tx
        .select({ deletedAt: comment.deletedAt, authorStatus: user.status })
        .from(comment)
        .innerJoin(user, eq(user.id, comment.authorId))
        .where(eq(comment.id, commentId))
        .for('share', { of: comment });
      if (!row || row.deletedAt !== null || row.authorStatus !== UserStatus.active) {
        throw new AppError('NOT_FOUND', 'Comment not found');
      }
      await tx.insert(commentLike).values({ userId: viewer.id, commentId }).onConflictDoNothing();
    });
  }

  async unlike(userId: string, commentId: string): Promise<void> {
    await this.db
      .delete(commentLike)
      .where(and(eq(commentLike.userId, userId), eq(commentLike.commentId, commentId)));
  }

  private toComment(
    row: CommentRow,
    viewer: AuthUser,
    likes: Pick<Comment, 'likeCount' | 'likedByMe'> = { likeCount: 0, likedByMe: false },
  ): Comment {
    const deleted = row.deletedAt !== null || row.authorStatus === UserStatus.banned;
    return {
      id: row.id,
      toastId: row.toastId,
      parentId: row.parentId,
      createdAt: row.createdAt.toISOString(),
      deleted,
      body: deleted ? null : row.body,
      author: deleted ? null : row.author,
      canDelete: !deleted && (row.author.id === viewer.id || viewer.role === UserRole.admin),
      likeCount: deleted ? 0 : likes.likeCount,
      likedByMe: !deleted && likes.likedByMe,
    };
  }

  private async assertVisible(db: DbExecutor, toastId: string, lockSession = false): Promise<void> {
    const query = db
      .select({
        removed: sql<boolean>`NOT (${countableToasts()}) OR ${toastSession.deletedAt} IS NOT NULL`,
        isLead: sql<boolean>`NOT EXISTS (
          SELECT 1 FROM ${toast} AS ${earlier}
          WHERE ${earlier.sessionId} = ${toast.sessionId} AND ${earlier.deletedAt} IS NULL
            AND (${earlier.eatenAt}, ${earlier.id}) < (${toast.eatenAt}, ${toast.id})
        )`,
      })
      .from(toast)
      .innerJoin(toastSession, eq(toastSession.id, toast.sessionId))
      .where(eq(toast.id, toastId));
    const [row] = lockSession ? await query.for('share', { of: toastSession }) : await query;
    if (!row || !row.isLead || !canSeeToast(row)) {
      throw new AppError('NOT_FOUND', 'Toast not found');
    }
  }
}
