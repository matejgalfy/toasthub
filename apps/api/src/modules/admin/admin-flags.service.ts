import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminFlag,
  type AdminFlagListQuery,
  type AdminFlagPage,
  type AdminFlagResponse,
  FlagStatus,
  FlagType,
  type ResolveFlag,
  ToastStatus,
  UserStatus,
} from '@toasthub/shared';
import { and, desc, eq, inArray, isNull, lt, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error';
import { decodeCursor, toPage } from '../../common/pagination';
import { type Database, DB, type DbExecutor } from '../../db/db.module';
import { discardedPhoto, flag, toast, toastSession, user } from '../../db/schema';
import { AuthService } from '../auth/auth.service';
import { StorageService } from '../storage/storage.service';
import { planResolution, type RejectScope } from './admin-flags.policy';

const subject = alias(user, 'subject');
const reporter = alias(user, 'reporter');
const resolver = alias(user, 'resolver');
const reported = alias(toast, 'reported');

const keysetSchema = z.object({ id: z.uuid() });

// The subject's toasts on a count flag's day that are not deleted, by status. Not `countableToasts()`:
// the admin needs the day's toasts also once the subject is banned.
function dayCount(status: ToastStatus) {
  return sql<number>`(
    SELECT count(*)::int FROM ${toast}
    WHERE ${toast.userId} = ${flag.subjectUserId} AND ${toast.localDate} = ${flag.localDate}
      AND ${toast.deletedAt} IS NULL AND ${toast.status} = ${status}
  )`;
}

const flagColumns = {
  id: flag.id,
  type: flag.type,
  status: flag.status,
  createdAt: flag.createdAt,
  reason: flag.reason,
  localDate: flag.localDate,
  resolvedAt: flag.resolvedAt,
  subject: {
    id: subject.id,
    displayName: subject.displayName,
    avatarId: subject.avatarId,
    status: subject.status,
  },
  reporter: { id: reporter.id, displayName: reporter.displayName, avatarId: reporter.avatarId },
  resolvedBy: { id: resolver.id, displayName: resolver.displayName, avatarId: resolver.avatarId },
  toast: {
    id: reported.id,
    sessionId: reported.sessionId,
    eatenAt: reported.eatenAt,
    localDate: reported.localDate,
    status: reported.status,
    deletedAt: reported.deletedAt,
    photoKey: reported.photoKey,
    photoHiddenAt: reported.photoHiddenAt,
  },
  dayActive: dayCount(ToastStatus.active),
  dayRejected: dayCount(ToastStatus.rejected),
};

/** The admin's flag queue and its actions (SPEC §4.4, §4.13). */
@Injectable()
export class AdminFlagsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly auth: AuthService,
    private readonly storage: StorageService,
  ) {}

  /** Flags newest first, optionally of one type and status. */
  async list({ type, status, cursor, limit }: AdminFlagListQuery): Promise<AdminFlagPage> {
    const after = cursor === undefined ? null : decodeCursor(cursor, keysetSchema);
    const rows = await this.rows(
      and(
        type === undefined ? undefined : eq(flag.type, type),
        status === undefined ? undefined : eq(flag.status, status),
        after ? lt(flag.id, after.id) : undefined,
      ),
      limit + 1,
    );
    const page = toPage(rows, limit, (row) => ({ id: row.id }));
    return { items: await this.toDtos(page.items), nextCursor: page.nextCursor };
  }

  /**
   * Applies an admin's action (BR-MOD-4) in one transaction and records who resolved the flag. Hiding or
   * rejecting a toast also closes the other open photo reports on it, which have nothing left to review.
   */
  async resolve(adminId: string, flagId: string, body: ResolveFlag): Promise<AdminFlagResponse> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          status: flag.status,
          subjectUserId: flag.subjectUserId,
          toastId: flag.toastId,
          localDate: flag.localDate,
        })
        .from(flag)
        .where(eq(flag.id, flagId))
        .for('update');
      if (!row) throw new AppError('NOT_FOUND', 'Flag not found');
      const plan = planResolution(row, body, adminId);

      const touched = plan.reject ? await this.rejectToasts(tx, plan.reject) : [];
      if (plan.hidePhotoOf !== null) {
        await tx
          .update(toast)
          .set({ photoHiddenAt: sql`coalesce(${toast.photoHiddenAt}, now())` })
          .where(eq(toast.id, plan.hidePhotoOf));
        touched.push(plan.hidePhotoOf);
      }
      if (plan.ban) await this.auth.setStatus(row.subjectUserId, UserStatus.banned, tx);

      const resolved = { resolvedBy: adminId, resolvedAt: sql`now()` };
      await tx
        .update(flag)
        .set({ status: plan.status, ...resolved })
        .where(eq(flag.id, flagId));
      if (touched.length > 0) {
        await tx
          .update(flag)
          .set({ status: FlagStatus.actioned, ...resolved })
          .where(
            and(
              eq(flag.type, FlagType.photo_report),
              eq(flag.status, FlagStatus.open),
              inArray(flag.toastId, touched),
            ),
          );
      }
    });
    const [row] = await this.rows(eq(flag.id, flagId), 1);
    const [dto] = await this.toDtos(row ? [row] : []);
    if (!dto) throw new Error('Flag disappeared after resolving it');
    return { flag: dto };
  }

  /**
   * Rejects the toasts in scope that are still active and not deleted, and returns their ids. Their
   * sessions are locked first, in id order, as the session edits lock them (SPEC §12 D44), so an edit
   * can't change a session while its toasts are rejected; a rejected toast makes its session read-only.
   */
  private async rejectToasts(tx: DbExecutor, scope: RejectScope): Promise<string[]> {
    const where = and(
      scope.kind === 'toast'
        ? eq(toast.id, scope.toastId)
        : and(eq(toast.userId, scope.userId), eq(toast.localDate, scope.localDate)),
      isNull(toast.deletedAt),
      eq(toast.status, ToastStatus.active),
    );
    await tx
      .select({ id: toastSession.id })
      .from(toastSession)
      .where(inArray(toastSession.id, tx.select({ id: toast.sessionId }).from(toast).where(where)))
      .orderBy(toastSession.id)
      .for('update');
    const rows = await tx
      .update(toast)
      .set({ status: ToastStatus.rejected })
      .where(where)
      .returning({ id: toast.id });
    return rows.map((r) => r.id);
  }

  private rows(where: SQL | undefined, limit: number) {
    return (
      this.db
        .select(flagColumns)
        .from(flag)
        .innerJoin(subject, eq(subject.id, flag.subjectUserId))
        .leftJoin(reporter, eq(reporter.id, flag.reporterId))
        .leftJoin(resolver, eq(resolver.id, flag.resolvedBy))
        .leftJoin(reported, eq(reported.id, flag.toastId))
        .where(where)
        // UUID v7: newest first.
        .orderBy(desc(flag.id))
        .limit(limit)
    );
  }

  private async toDtos(rows: Awaited<ReturnType<AdminFlagsService['rows']>>): Promise<AdminFlag[]> {
    const toastIds = rows.flatMap((row) => (row.toast ? [row.toast.id] : []));
    const discarded =
      toastIds.length === 0
        ? []
        : await this.db
            .select({ key: discardedPhoto.key, toastId: discardedPhoto.toastId })
            .from(discardedPhoto)
            .where(inArray(discardedPhoto.toastId, toastIds))
            .orderBy(desc(discardedPhoto.createdAt));
    const earlierKeys = Map.groupBy(discarded, (row) => row.toastId);

    return Promise.all(
      rows.map(async (row) => {
        const reportedToast = row.toast;
        return {
          id: row.id,
          type: row.type,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          subject: row.subject,
          reporter: row.reporter,
          reason: row.reason,
          localDate: row.localDate,
          day: row.localDate === null ? null : { active: row.dayActive, rejected: row.dayRejected },
          toast: reportedToast && {
            id: reportedToast.id,
            sessionId: reportedToast.sessionId,
            eatenAt: reportedToast.eatenAt.toISOString(),
            localDate: reportedToast.localDate,
            status: reportedToast.status,
            deleted: reportedToast.deletedAt !== null,
            // Admins review the photo as it was reported, so a hidden one is signed too.
            photoUrl:
              reportedToast.photoKey === null
                ? null
                : await this.storage.presignGet(reportedToast.photoKey),
            photoHidden: reportedToast.photoHiddenAt !== null,
            earlierPhotoUrls: await Promise.all(
              (earlierKeys.get(reportedToast.id) ?? []).map((r) => this.storage.presignGet(r.key)),
            ),
          },
          resolvedBy: row.resolvedBy,
          resolvedAt: row.resolvedAt?.toISOString() ?? null,
        };
      }),
    );
  }
}
