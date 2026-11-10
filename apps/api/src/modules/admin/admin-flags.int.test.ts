import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AdminFlagPage, AdminFlagResponse } from '@toasthub/shared';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn, WEB_ORIGIN } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { insertToasts } from '../../../test/toasts';
import { type Database, DB } from '../../db/db.module';
import {
  comment,
  commentLike,
  discardedPhoto,
  flag,
  session,
  toast,
  toastSession,
  user,
} from '../../db/schema';
import { promoteToAdmin } from './promote-admin';

let app: NestFastifyApplication;
let db: Database;
let admin: SignedIn;
let ann: SignedIn;
let bob: SignedIn;

const UNKNOWN_ID = '01890a5d-ac96-774b-bcce-b302099a8057';
const DAY = '2026-10-01';
const AT = new Date(`${DAY}T10:00:00Z`);

beforeEach(async () => {
  app = await createTestApp();
  db = app.get<Database>(DB);
  admin = await signUp('admin@example.com', 'Admin');
  ann = await signUp('ann@example.com', 'Ann');
  bob = await signUp('bob@example.com', 'Bob');
  await promoteToAdmin(db, 'admin@example.com');
});

afterEach(async () => {
  await app.close();
});

async function signUp(email: string, displayName: string): Promise<SignedIn> {
  const who = await signIn(app, email);
  await db.update(user).set({ displayName }).where(eq(user.id, who.userId));
  return who;
}

function list(query = '') {
  return app.inject({ url: `/api/v1/admin/flags${query}`, headers: { cookie: admin.cookie } });
}

function resolve(flagId: string, payload: object, as: SignedIn | null = admin) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/admin/flags/${flagId}/resolve`,
    headers: as ? { cookie: as.cookie, origin: WEB_ORIGIN } : { origin: WEB_ORIGIN },
    payload,
  });
}

/** One session of `count` toasts of Ann's on DAY, a photo on the lead; returns the toast ids, lead first. */
async function annSession(count: number, photoKey: string | null = null): Promise<string[]> {
  const [row] = await db
    .insert(toastSession)
    .values({ userId: ann.userId, createdAt: AT })
    .returning({ id: toastSession.id });
  if (!row) throw new Error('No session');
  const rows = await db
    .insert(toast)
    .values(
      Array.from({ length: count }, (_, i) => ({
        userId: ann.userId,
        sessionId: row.id,
        eatenAt: new Date(AT.getTime() + i),
        photoKey: i === 0 ? photoKey : null,
      })),
    )
    .returning({ id: toast.id });
  return rows.map((r) => r.id);
}

async function countFlag(subjectUserId = ann.userId, localDate = DAY): Promise<string> {
  const [row] = await db
    .insert(flag)
    .values({ type: 'count_threshold', subjectUserId, localDate })
    .returning({ id: flag.id });
  if (!row) throw new Error('No flag');
  return row.id;
}

async function photoReport(toastId: string, reporterId = bob.userId, reason: string | null = null) {
  const [row] = await db
    .insert(flag)
    .values({ type: 'photo_report', subjectUserId: ann.userId, toastId, reporterId, reason })
    .returning({ id: flag.id });
  if (!row) throw new Error('No flag');
  return row.id;
}

async function commentOnToast(
  toastId: string,
  authorId = ann.userId,
  body = 'Reported comment',
  parentId: string | null = null,
): Promise<string> {
  const [row] = await db
    .insert(comment)
    .values({ toastId, authorId, body, parentId })
    .returning({ id: comment.id });
  if (!row) throw new Error('No comment');
  return row.id;
}

async function commentReport(
  commentId: string,
  toastId: string,
  subjectUserId = ann.userId,
  reporterId = bob.userId,
  reason: string | null = null,
): Promise<string> {
  const [row] = await db
    .insert(flag)
    .values({
      type: 'comment_report',
      subjectUserId,
      toastId,
      commentId,
      reporterId,
      reason,
    })
    .returning({ id: flag.id });
  if (!row) throw new Error('No flag');
  return row.id;
}

async function flagRow(id: string) {
  const [row] = await db.select().from(flag).where(eq(flag.id, id));
  if (!row) throw new Error('No flag');
  return row;
}

async function statusesOf(ids: string[]) {
  const rows = await db
    .select({ id: toast.id, status: toast.status })
    .from(toast)
    .where(inArray(toast.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.status]));
}

describe('GET /admin/flags', () => {
  it('lists flags newest first with their subject and toast context', async () => {
    const [lead = ''] = await annSession(2, 'toasts/ann/now.webp');
    await annSession(1);
    await db.insert(discardedPhoto).values({ key: 'toasts/ann/before.webp', toastId: lead });
    const countId = await countFlag();
    const reportId = await photoReport(lead, bob.userId, 'not toast');

    const res = await list();
    expect(res.statusCode).toBe(200);
    const page = res.json<AdminFlagPage>();
    expect(page.items.map((item) => item.id)).toEqual([reportId, countId]);
    const [report, count] = page.items;
    expect(report).toMatchObject({
      type: 'photo_report',
      status: 'open',
      subject: { id: ann.userId, displayName: 'Ann', status: 'active' },
      reporter: { id: bob.userId, displayName: 'Bob' },
      reason: 'not toast',
      localDate: null,
      day: null,
      toast: { id: lead, localDate: DAY, status: 'active', deleted: false, photoHidden: false },
      resolvedBy: null,
      resolvedAt: null,
    });
    expect(report?.toast?.photoUrl).toContain('toasts/ann/now.webp');
    expect(report?.toast?.earlierPhotoUrls).toHaveLength(1);
    expect(report?.toast?.earlierPhotoUrls[0]).toContain('toasts/ann/before.webp');
    expect(count).toMatchObject({
      type: 'count_threshold',
      reporter: null,
      localDate: DAY,
      day: { active: 3, rejected: 0 },
      toast: null,
    });
  });

  it('filters by type and status and pages with a cursor', async () => {
    const [lead = ''] = await annSession(1, 'toasts/ann/a.webp');
    const countId = await countFlag();
    const reportId = await photoReport(lead);
    const dismissed = await countFlag(bob.userId);
    await db.update(flag).set({ status: 'dismissed' }).where(eq(flag.id, dismissed));

    const byType = (await list('?type=count_threshold')).json<AdminFlagPage>();
    expect(byType.items.map((item) => item.id)).toEqual([dismissed, countId]);
    const open = (await list('?status=open')).json<AdminFlagPage>();
    expect(open.items.map((item) => item.id)).toEqual([reportId, countId]);

    const first = (await list('?limit=2')).json<AdminFlagPage>();
    expect(first.items.map((item) => item.id)).toEqual([dismissed, reportId]);
    expect(first.nextCursor).not.toBeNull();
    const second = (await list(`?limit=2&cursor=${first.nextCursor ?? ''}`)).json<AdminFlagPage>();
    expect(second.items.map((item) => item.id)).toEqual([countId]);
    expect(second.nextCursor).toBeNull();

    expect((await list('?type=spam')).statusCode).toBe(400);
  });

  it('includes reported comment, author, and linked toast context without exposing emails', async () => {
    const [toastId = ''] = await annSession(1, 'toasts/ann/comment.webp');
    const commentId = await commentOnToast(toastId, bob.userId, 'A reportable comment');
    const id = await commentReport(commentId, toastId, bob.userId, ann.userId, 'be kind');

    const all = (await list()).json<AdminFlagPage>();
    expect(all.items.map((item) => item.id)).toContain(id);
    const [toastRow] = await db
      .select({ sessionId: toast.sessionId })
      .from(toast)
      .where(eq(toast.id, toastId));
    if (!toastRow) throw new Error('No linked toast');
    const filtered = (await list('?type=comment_report&status=open')).json<AdminFlagPage>();
    expect(filtered.items.map((item) => item.id)).toEqual([id]);
    const reported = filtered.items[0];
    expect(reported).toMatchObject({
      id,
      type: 'comment_report',
      status: 'open',
      subject: { id: bob.userId, displayName: 'Bob', status: 'active' },
      reporter: { id: ann.userId, displayName: 'Ann' },
      reason: 'be kind',
      localDate: null,
      day: null,
      comment: {
        id: commentId,
        toastId,
        parentId: null,
        body: 'A reportable comment',
        deleted: false,
      },
      toast: {
        id: toastId,
        sessionId: toastRow.sessionId,
        localDate: DAY,
        status: 'active',
        deleted: false,
      },
    });
    expect(reported?.comment?.createdAt).toEqual(expect.any(String));
    expect(reported?.toast?.photoUrl).toContain('toasts/ann/comment.webp');
    expect(JSON.stringify(reported)).not.toContain('email');
  });

  it('keeps dismissed comment reports visible with their original context', async () => {
    const [toastId = ''] = await annSession(1);
    const commentId = await commentOnToast(toastId);
    const id = await commentReport(commentId, toastId);

    expect((await resolve(id, { action: 'dismiss' })).statusCode).toBe(200);
    const page = (await list('?type=comment_report&status=dismissed')).json<AdminFlagPage>();
    expect(page.items.map((item) => item.id)).toEqual([id]);
    expect(page.items[0]).toMatchObject({
      status: 'dismissed',
      comment: { id: commentId, body: 'Reported comment', deleted: false },
    });
  });

  it('is only for admins', async () => {
    const res = await app.inject({ url: '/api/v1/admin/flags', headers: { cookie: ann.cookie } });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /admin/flags/:id/resolve', () => {
  it('dismisses a flag and records who resolved it, once', async () => {
    const id = await countFlag();
    await annSession(1);

    const res = await resolve(id, { action: 'dismiss' });
    expect(res.statusCode).toBe(200);
    const body = res.json<AdminFlagResponse>();
    expect(body.flag).toMatchObject({
      id,
      status: 'dismissed',
      resolvedBy: { id: admin.userId, displayName: 'Admin' },
      day: { active: 1, rejected: 0 },
    });
    expect(body.flag.resolvedAt).not.toBeNull();

    expect((await resolve(id, { action: 'reject_toasts' })).statusCode).toBe(409);
    expect((await flagRow(id)).status).toBe('dismissed');
  });

  it("rejects the flagged day's toasts and closes reports on them", async () => {
    const [lead = '', second = ''] = await annSession(2, 'toasts/ann/a.webp');
    const [deleted = ''] = await annSession(1);
    await db.update(toast).set({ deletedAt: new Date() }).where(eq(toast.id, deleted));
    const [otherDay] = await insertToasts(db, [
      { userId: ann.userId, eatenAt: new Date('2026-10-02T10:00:00Z') },
    ]);
    const id = await countFlag();
    const reportId = await photoReport(lead);

    const res = await resolve(id, { action: 'reject_toasts' });
    expect(res.statusCode).toBe(200);
    expect(res.json<AdminFlagResponse>().flag).toMatchObject({
      status: 'actioned',
      day: { active: 0, rejected: 2 },
    });
    expect(await statusesOf([lead, second, deleted, otherDay?.id ?? ''])).toEqual({
      [lead]: 'rejected',
      [second]: 'rejected',
      [deleted]: 'active',
      [otherDay?.id ?? '']: 'active',
    });
    expect(await flagRow(reportId)).toMatchObject({
      status: 'actioned',
      resolvedBy: admin.userId,
    });
  });

  it('rejects only the reported toast of a photo report', async () => {
    const [lead = '', second = ''] = await annSession(2, 'toasts/ann/a.webp');
    const id = await photoReport(lead);

    const res = await resolve(id, { action: 'reject_toasts' });
    expect(res.statusCode).toBe(200);
    expect(res.json<AdminFlagResponse>().flag.toast).toMatchObject({ status: 'rejected' });
    expect(await statusesOf([lead, second])).toEqual({ [lead]: 'rejected', [second]: 'active' });
  });

  it('hides the photo, still shows it to the admin and closes the other reports on it', async () => {
    const [lead = ''] = await annSession(1, 'toasts/ann/a.webp');
    const id = await photoReport(lead);
    const other = await photoReport(lead, admin.userId);
    const [elsewhere = ''] = await annSession(1, 'toasts/ann/b.webp');
    const unrelated = await photoReport(elsewhere);

    const res = await resolve(id, { action: 'hide_photo' });
    expect(res.statusCode).toBe(200);
    const { flag: dto } = res.json<AdminFlagResponse>();
    expect(dto.status).toBe('actioned');
    expect(dto.toast).toMatchObject({ photoHidden: true, status: 'active' });
    expect(dto.toast?.photoUrl).toContain('toasts/ann/a.webp');

    const [row] = await db.select().from(toast).where(eq(toast.id, lead));
    expect(row?.photoHiddenAt).not.toBeNull();
    expect((await flagRow(other)).status).toBe('actioned');
    expect((await flagRow(unrelated)).status).toBe('open');
  });

  it('refuses to hide a photo on a count flag', async () => {
    const id = await countFlag();
    const res = await resolve(id, { action: 'hide_photo' });
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json<{ error: { fields: object } }>().error.fields)).toEqual(['action']);
    expect((await flagRow(id)).status).toBe('open');
  });

  it('deletes a reported comment, preserves replies, clears likes, and closes only comment reports', async () => {
    const [toastId = ''] = await annSession(1, 'toasts/ann/review.webp');
    const rootId = await commentOnToast(toastId, ann.userId, 'Remove this root');
    const replyId = await commentOnToast(toastId, bob.userId, 'Keep this reply', rootId);
    const id = await commentReport(rootId, toastId, ann.userId, bob.userId);
    const otherReport = await commentReport(rootId, toastId, ann.userId, admin.userId);
    const photoFlagId = await photoReport(toastId);
    await db.insert(commentLike).values([
      { userId: bob.userId, commentId: rootId },
      { userId: ann.userId, commentId: rootId },
    ]);

    const res = await resolve(id, { action: 'delete_comment' });
    expect(res.statusCode).toBe(200);
    expect(res.json<AdminFlagResponse>().flag.comment).toMatchObject({
      id: rootId,
      toastId,
      parentId: null,
      body: null,
      deleted: true,
    });
    expect(await db.select().from(comment).where(eq(comment.id, rootId))).toMatchObject([
      { id: rootId, toastId, body: null, deletedAt: expect.any(Date) as Date },
    ]);
    expect(await db.select().from(comment).where(eq(comment.id, replyId))).toMatchObject([
      { id: replyId, parentId: rootId, body: 'Keep this reply', deletedAt: null },
    ]);
    expect(await db.$count(commentLike, eq(commentLike.commentId, rootId))).toBe(0);
    expect((await flagRow(id)).status).toBe('actioned');
    expect((await flagRow(otherReport)).status).toBe('actioned');
    expect((await flagRow(photoFlagId)).status).toBe('open');
  });

  it.each(['deleted session', 'rejected toast', 'banned author'] as const)(
    'can delete a reported comment after its %s',
    async (inaccessibility) => {
      const [toastId = ''] = await annSession(1);
      const commentId = await commentOnToast(toastId);
      const id = await commentReport(commentId, toastId);
      if (inaccessibility === 'deleted session') {
        const [toastRow] = await db
          .select({ sessionId: toast.sessionId })
          .from(toast)
          .where(eq(toast.id, toastId));
        if (!toastRow) throw new Error('No toast');
        await db
          .update(toastSession)
          .set({ deletedAt: new Date() })
          .where(eq(toastSession.id, toastRow.sessionId));
      } else if (inaccessibility === 'rejected toast') {
        await db.update(toast).set({ status: 'rejected' }).where(eq(toast.id, toastId));
      } else {
        await db.update(user).set({ status: 'banned' }).where(eq(user.id, ann.userId));
      }
      const queued = (await list('?type=comment_report&status=open')).json<AdminFlagPage>();
      expect(queued.items.find((item) => item.id === id)).toMatchObject({
        subject: {
          id: ann.userId,
          status: inaccessibility === 'banned author' ? 'banned' : 'active',
        },
        comment: { id: commentId, body: 'Reported comment', deleted: false },
      });

      const res = await resolve(id, { action: 'delete_comment' });
      expect(res.statusCode).toBe(200);
      expect(res.json<AdminFlagResponse>().flag.comment).toMatchObject({
        id: commentId,
        body: null,
        deleted: true,
      });
    },
  );

  it('rejects comment-only actions on other flag types and toast actions on linked comment reports', async () => {
    const [toastId = ''] = await annSession(1, 'toasts/ann/comment-actions.webp');
    const commentId = await commentOnToast(toastId);
    const reportId = await commentReport(commentId, toastId);
    for (const action of ['hide_photo', 'reject_toasts'] as const) {
      const res = await resolve(reportId, { action });
      expect(res.statusCode).toBe(400);
      expect((await flagRow(reportId)).status).toBe('open');
    }
    const countId = await countFlag();
    const photoFlagId = await photoReport(toastId);
    for (const id of [countId, photoFlagId]) {
      expect((await resolve(id, { action: 'delete_comment' })).statusCode).toBe(400);
      expect((await flagRow(id)).status).toBe('open');
    }
    expect(await db.$count(commentLike, eq(commentLike.commentId, commentId))).toBe(0);
    const [toastRow] = await db.select().from(toast).where(eq(toast.id, toastId));
    expect(toastRow?.photoHiddenAt).toBeNull();
    expect(toastRow?.status).toBe('active');
  });

  it('bans the subject and signs them out', async () => {
    const id = await countFlag();

    const res = await resolve(id, { action: 'dismiss', ban: true });
    expect(res.statusCode).toBe(200);
    expect(res.json<AdminFlagResponse>().flag).toMatchObject({
      status: 'actioned',
      subject: { id: ann.userId, status: 'banned' },
    });
    expect(await db.$count(session, eq(session.userId, ann.userId))).toBe(0);
    const me = await app.inject({ url: '/api/v1/me', headers: { cookie: ann.cookie } });
    expect(me.statusCode).toBe(401);
  });

  it("refuses to ban the admin's own account and changes nothing", async () => {
    const id = await countFlag(admin.userId);
    const res = await resolve(id, { action: 'reject_toasts', ban: true });
    expect(res.statusCode).toBe(409);
    expect((await flagRow(id)).status).toBe('open');
  });

  it('answers 404 for an unknown flag, 400 for a bad action and 403 for non-admins', async () => {
    expect((await resolve(UNKNOWN_ID, { action: 'dismiss' })).statusCode).toBe(404);
    expect((await resolve(UNKNOWN_ID, { action: 'dismiss' }, null)).statusCode).toBe(401);
    const id = await countFlag();
    expect((await resolve(id, { action: 'delete' })).statusCode).toBe(400);
    expect((await resolve(id, { action: 'dismiss' }, ann)).statusCode).toBe(403);
    expect((await flagRow(id)).status).toBe('open');
  });
});
