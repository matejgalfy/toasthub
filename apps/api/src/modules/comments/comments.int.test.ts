import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Comment, CommentPage } from '@toasthub/shared';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn, WEB_ORIGIN } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { insertToasts } from '../../../test/toasts';
import { type Database, DB } from '../../db/db.module';
import { comment, commentLike, toast, toastSession, user } from '../../db/schema';
import { COMMENT_RATE_LIMIT } from './comments.service';

let app: NestFastifyApplication;
let db: Database;
let ann: SignedIn;
let bob: SignedIn;

const UNKNOWN_ID = '01890a5d-ac96-774b-bcce-b302099a8057';

beforeEach(async () => {
  app = await createTestApp();
  db = app.get<Database>(DB);
  ann = await signUp('ann@example.com', 'Ann');
  bob = await signUp('bob@example.com', 'Bob');
});

afterEach(async () => {
  await app.close();
});

async function signUp(email: string, displayName: string): Promise<SignedIn> {
  const who = await signIn(app, email);
  await db.update(user).set({ displayName }).where(eq(user.id, who.userId));
  return who;
}

async function annToast(): Promise<string> {
  const [row] = await insertToasts(db, [{ userId: ann.userId }]);
  if (!row) throw new Error('No toast');
  return row.id;
}

function call(
  as: SignedIn | null,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  payload?: object,
) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    headers: as ? { cookie: as.cookie, origin: WEB_ORIGIN } : {},
    ...(payload ? { payload } : {}),
  });
}

function list(as: SignedIn | null, toastId: string, query = '') {
  return call(as, 'GET', `/toasts/${toastId}/comments${query}`);
}

function post(as: SignedIn | null, toastId: string, payload: object = { body: 'Nice toast!' }) {
  return call(as, 'POST', `/toasts/${toastId}/comments`, payload);
}

function remove(as: SignedIn | null, commentId: string) {
  return call(as, 'DELETE', `/comments/${commentId}`);
}

function likeComment(as: SignedIn | null, commentId: string) {
  return call(as, 'POST', `/comments/${commentId}/like`);
}

function unlikeComment(as: SignedIn | null, commentId: string) {
  return call(as, 'DELETE', `/comments/${commentId}/like`);
}

function expectError(res: Awaited<ReturnType<typeof call>>, status: number, code: string): void {
  expect(res.statusCode, res.body).toBe(status);
  expect(res.json<{ error: { code: string } }>().error.code).toBe(code);
}

async function create(as: SignedIn, toastId: string, payload: object = { body: 'Nice toast!' }) {
  const res = await post(as, toastId, payload);
  expect(res.statusCode, res.body).toBe(201);
  return res.json<Comment>();
}

describe('comments auth', () => {
  it('requires a session for listing, creating and deleting comments', async () => {
    expectError(await list(null, UNKNOWN_ID), 401, 'UNAUTHENTICATED');
    expectError(await post(null, UNKNOWN_ID), 401, 'UNAUTHENTICATED');
    expectError(await remove(null, UNKNOWN_ID), 401, 'UNAUTHENTICATED');
    expectError(await likeComment(null, UNKNOWN_ID), 401, 'UNAUTHENTICATED');
    expectError(await unlikeComment(null, UNKNOWN_ID), 401, 'UNAUTHENTICATED');
  });
});

describe('comment toast visibility', () => {
  it('is a 404 for unknown toasts', async () => {
    expectError(await list(bob, UNKNOWN_ID), 404, 'NOT_FOUND');
    expectError(await post(bob, UNKNOWN_ID), 404, 'NOT_FOUND');
  });

  it('is a 404 for a nonlead toast', async () => {
    const [session] = await db.insert(toastSession).values({ userId: ann.userId }).returning();
    if (!session) throw new Error('No session');
    const rows = await db
      .insert(toast)
      .values([0, 1].map(() => ({ userId: ann.userId, sessionId: session.id })))
      .returning({ id: toast.id });
    const [lead, second] = rows;
    if (!lead || !second) throw new Error('No toasts');
    expectError(await list(bob, second.id), 404, 'NOT_FOUND');
    expectError(await post(bob, second.id), 404, 'NOT_FOUND');
    expect((await list(bob, lead.id)).statusCode).toBe(200);
    expect((await post(bob, lead.id)).statusCode).toBe(201);
  });

  it.each([
    ['deleted', { deletedAt: new Date() }],
    ['rejected', { status: 'rejected' as const }],
  ])('is a 404 for a %s toast', async (_, change) => {
    const toastId = await annToast();
    await db.update(toast).set(change).where(eq(toast.id, toastId));
    expectError(await list(bob, toastId), 404, 'NOT_FOUND');
    expectError(await post(bob, toastId), 404, 'NOT_FOUND');
  });

  it('is a 404 for a deleted session even while its toast is not deleted', async () => {
    const toastId = await annToast();
    const [row] = await db.select().from(toast).where(eq(toast.id, toastId));
    if (!row) throw new Error('No toast');
    await db
      .update(toastSession)
      .set({ deletedAt: new Date() })
      .where(eq(toastSession.id, row.sessionId));
    expectError(await list(bob, toastId), 404, 'NOT_FOUND');
    expectError(await post(bob, toastId), 404, 'NOT_FOUND');
  });

  it('is a 404 for a banned owner’s toast', async () => {
    const toastId = await annToast();
    await db.update(user).set({ status: 'banned' }).where(eq(user.id, ann.userId));
    expectError(await list(bob, toastId), 404, 'NOT_FOUND');
    expectError(await post(bob, toastId), 404, 'NOT_FOUND');
  });
});

describe('GET /toasts/:id/comments', () => {
  it('returns an empty standard page for a visible toast without a photo', async () => {
    const res = await list(bob, await annToast());
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<CommentPage>()).toEqual({ items: [], nextCursor: null });
  });

  it('pages oldest first by createdAt and id, including replies and timestamp ties', async () => {
    const toastId = await annToast();
    const ids = [
      '01890a5d-ac96-774b-bcce-b302099a8061',
      '01890a5d-ac96-774b-bcce-b302099a8062',
      '01890a5d-ac96-774b-bcce-b302099a8063',
      '01890a5d-ac96-774b-bcce-b302099a8064',
    ];
    const [firstId, secondId, thirdId, fourthId] = ids;
    if (!firstId || !secondId || !thirdId || !fourthId) throw new Error('No ids');
    await db.insert(comment).values({
      id: firstId,
      toastId,
      authorId: ann.userId,
      body: 'first',
      createdAt: new Date('2026-06-01T12:00:00Z'),
    });
    await db.insert(comment).values([
      {
        id: fourthId,
        toastId,
        authorId: ann.userId,
        body: 'last',
        createdAt: new Date('2026-06-02T12:00:00Z'),
      },
      {
        id: thirdId,
        toastId,
        authorId: bob.userId,
        body: 'third',
        parentId: firstId,
        createdAt: new Date('2026-06-01T12:00:00Z'),
      },
      {
        id: secondId,
        toastId,
        authorId: ann.userId,
        body: 'second',
        createdAt: new Date('2026-06-01T12:00:00Z'),
      },
    ]);
    const first = (await list(bob, toastId, '?limit=2')).json<CommentPage>();
    expect(first.items.map((item) => item.id)).toEqual([firstId, secondId]);
    expect(first.nextCursor).not.toBeNull();
    const second = (
      await list(bob, toastId, `?limit=2&cursor=${first.nextCursor ?? ''}`)
    ).json<CommentPage>();
    expect(second.items.map((item) => item.id)).toEqual([thirdId, fourthId]);
    expect(second.items[0]?.parentId).toBe(firstId);
    expect(second.nextCursor).toBeNull();
  });

  it('filters top-level comments before pagination while false includes replies', async () => {
    const toastId = await annToast();
    const [firstRoot, firstReply, secondReply, secondRoot, thirdRoot, fourthRoot] = [
      '01890a5d-ac96-774b-bcce-b302099a8071',
      '01890a5d-ac96-774b-bcce-b302099a8072',
      '01890a5d-ac96-774b-bcce-b302099a8073',
      '01890a5d-ac96-774b-bcce-b302099a8074',
      '01890a5d-ac96-774b-bcce-b302099a8075',
      '01890a5d-ac96-774b-bcce-b302099a8076',
    ];
    if (!firstRoot || !firstReply || !secondReply || !secondRoot || !thirdRoot || !fourthRoot) {
      throw new Error('No comment ids');
    }
    const baseTime = Date.parse('2026-06-01T12:00:00Z');
    await db.insert(comment).values([
      {
        id: firstRoot,
        toastId,
        authorId: ann.userId,
        body: 'root 1',
        createdAt: new Date(baseTime),
      },
      {
        id: firstReply,
        toastId,
        authorId: bob.userId,
        parentId: firstRoot,
        body: 'reply 1',
        createdAt: new Date(baseTime + 1_000),
      },
      {
        id: secondReply,
        toastId,
        authorId: bob.userId,
        parentId: firstRoot,
        body: 'reply 2',
        createdAt: new Date(baseTime + 2_000),
      },
      {
        id: secondRoot,
        toastId,
        authorId: ann.userId,
        body: 'root 2',
        createdAt: new Date(baseTime + 3_000),
      },
      {
        id: thirdRoot,
        toastId,
        authorId: ann.userId,
        body: 'root 3',
        createdAt: new Date(baseTime + 4_000),
      },
      {
        id: fourthRoot,
        toastId,
        authorId: ann.userId,
        body: 'root 4',
        createdAt: new Date(baseTime + 5_000),
      },
    ]);

    const firstPage = (await list(bob, toastId, '?topLevel=true&limit=3')).json<CommentPage>();
    expect(firstPage.items.map((item) => item.id)).toEqual([firstRoot, secondRoot, thirdRoot]);
    expect(firstPage.items.every((item) => item.parentId === null)).toBe(true);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = (
      await list(bob, toastId, `?topLevel=true&limit=3&cursor=${firstPage.nextCursor ?? ''}`)
    ).json<CommentPage>();
    expect(secondPage.items.map((item) => item.id)).toEqual([fourthRoot]);
    expect(secondPage.nextCursor).toBeNull();

    const allComments = (await list(bob, toastId, '?topLevel=false')).json<CommentPage>();
    expect(allComments.items.map((item) => item.id)).toEqual([
      firstRoot,
      firstReply,
      secondReply,
      secondRoot,
      thirdRoot,
      fourthRoot,
    ]);
  });

  it('keeps microsecond-separated rows across page boundaries', async () => {
    const toastId = await annToast();
    const rows = await db
      .insert(comment)
      .values(
        [1, 2, 3].map((microsecond) => ({
          toastId,
          authorId: ann.userId,
          body: 'A comment',
          createdAt: sql`'2026-06-01T12:00:00Z'::timestamptz + ${microsecond} * interval '1 microsecond'`,
        })),
      )
      .returning({ id: comment.id });
    const ids: string[] = [];
    let cursor = '';
    do {
      const page = (await list(bob, toastId, `?limit=1&cursor=${cursor}`)).json<CommentPage>();
      ids.push(...page.items.map((row) => row.id));
      cursor = page.nextCursor ?? '';
    } while (cursor !== '');
    expect(ids).toEqual(rows.map((row) => row.id));
  });

  it.each([
    '?limit=0',
    '?limit=51',
    '?limit=1.5',
    '?cursor=not-a-cursor',
    '?topLevel=',
    '?topLevel=invalid',
  ])('rejects invalid pagination %s', async (query) => {
    expectError(await list(bob, await annToast(), query), 400, 'VALIDATION_ERROR');
  });

  it('uses the standard default limit of 20 and treats blank pagination as the first page', async () => {
    const toastId = await annToast();
    await db.insert(comment).values(
      Array.from({ length: 21 }, (_, i) => ({
        toastId,
        authorId: ann.userId,
        body: `Comment ${String(i)}`,
      })),
    );
    const first = (await list(bob, toastId)).json<CommentPage>();
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    expect((await list(bob, toastId, '?limit=&cursor=')).json<CommentPage>()).toEqual(first);
  });

  it('only lists the requested toast’s comments', async () => {
    const first = await annToast();
    const second = await annToast();
    const own = await create(bob, first);
    await create(bob, second);
    expect((await list(ann, first)).json<CommentPage>().items.map((item) => item.id)).toEqual([
      own.id,
    ]);
  });
});

describe('POST /toasts/:id/comments', () => {
  it('returns the Comment directly with a trimmed body and public author summary', async () => {
    const toastId = await annToast();
    const item = await create(bob, toastId, { body: '  Nice toast!  ' });
    expect(item).toEqual({
      id: expect.any(String) as string,
      toastId,
      parentId: null,
      createdAt: expect.any(String) as string,
      deleted: false,
      body: 'Nice toast!',
      author: { id: bob.userId, displayName: 'Bob', avatarId: null },
      canDelete: true,
      likeCount: 0,
      likedByMe: false,
    });
    expect(new Date(item.createdAt).toISOString()).toBe(item.createdAt);
    const page = (await list(ann, toastId)).json<CommentPage>();
    expect(page.items).toEqual([{ ...item, canDelete: false }]);
  });

  it('accepts an explicit null parent and the maximum body length after trimming', async () => {
    const item = await create(ann, await annToast(), {
      body: `  ${'x'.repeat(500)}  `,
      parentId: null,
    });
    expect(item.body).toHaveLength(500);
    expect(item.parentId).toBeNull();
  });

  it.each([
    {},
    { body: '' },
    { body: ' \n ' },
    { body: 'x'.repeat(501) },
    { body: 1 },
    { body: 'x', parentId: 'bad' },
    { body: 'x', unknown: true },
  ])('rejects invalid payload %j', async (payload) => {
    const toastId = await annToast();
    expectError(await post(bob, toastId, payload), 400, 'VALIDATION_ERROR');
    expect((await list(bob, toastId)).json<CommentPage>().items).toEqual([]);
  });

  it('rejects missing and cross-toast parents with a parentId validation field', async () => {
    const toastId = await annToast();
    const other = await create(bob, await annToast());
    for (const parentId of [UNKNOWN_ID, other.id]) {
      const res = await post(bob, toastId, { body: 'Reply', parentId });
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(Object.keys(res.json<{ error: { fields: object } }>().error.fields)).toContain(
        'parentId',
      );
    }
    expect((await list(bob, toastId)).json<CommentPage>().items).toEqual([]);
  });

  it('allows replies to replies without a depth cap', async () => {
    const toastId = await annToast();
    let parent = await create(ann, toastId);
    for (let depth = 0; depth < 12; depth++) {
      const reply = await create(bob, toastId, {
        body: `Reply ${String(depth)}`,
        parentId: parent.id,
      });
      expect(reply.parentId).toBe(parent.id);
      parent = reply;
    }
    const page = (await list(bob, toastId)).json<CommentPage>();
    expect(page.items).toHaveLength(13);
    const seen = new Set<string>();
    for (const row of page.items) {
      if (row.parentId !== null) expect(seen.has(row.parentId)).toBe(true);
      seen.add(row.id);
    }
  });

  it('rejects a live row with no body at the database boundary', async () => {
    await expect(
      db.insert(comment).values({
        toastId: await annToast(),
        authorId: ann.userId,
        body: null,
      }),
    ).rejects.toThrow();
  });

  it('limits each user to 30 comments per hour across toasts', async () => {
    expect(COMMENT_RATE_LIMIT).toBe(30);
    const toastId = await annToast();
    for (let i = 0; i < COMMENT_RATE_LIMIT; i++) {
      expect((await post(bob, toastId)).statusCode).toBe(201);
    }
    expectError(await post(bob, await annToast()), 429, 'RATE_LIMITED');
    expect((await post(ann, toastId)).statusCode).toBe(201);
  });
});

describe('POST and DELETE /comments/:id/like', () => {
  it('allows an author to like their own comment and is idempotent', async () => {
    const toastId = await annToast();
    const item = await create(ann, toastId);

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await likeComment(ann, item.id);
      expect(res.statusCode, res.body).toBe(204);
      expect(res.body).toBe('');
    }
    expect((await likeComment(bob, item.id)).statusCode).toBe(204);
    expect((await list(ann, toastId)).json<CommentPage>().items[0]).toMatchObject({
      id: item.id,
      likeCount: 2,
      likedByMe: true,
    });
    expect((await list(bob, toastId)).json<CommentPage>().items[0]).toMatchObject({
      id: item.id,
      likeCount: 2,
      likedByMe: true,
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await unlikeComment(bob, item.id);
      expect(res.statusCode, res.body).toBe(204);
      expect(res.body).toBe('');
    }
    expect((await list(ann, toastId)).json<CommentPage>().items[0]).toMatchObject({
      likeCount: 1,
      likedByMe: true,
    });
    expect((await list(bob, toastId)).json<CommentPage>().items[0]).toMatchObject({
      likeCount: 1,
      likedByMe: false,
    });
  });

  it('only likes a live comment on a visible toast', async () => {
    const deletedToastId = await annToast();
    const deleted = await create(bob, deletedToastId);
    await remove(bob, deleted.id);
    expectError(await likeComment(ann, deleted.id), 404, 'NOT_FOUND');

    const bannedToastId = await annToast();
    const banned = await create(bob, bannedToastId);
    await db.update(user).set({ status: 'banned' }).where(eq(user.id, bob.userId));
    expectError(await likeComment(ann, banned.id), 404, 'NOT_FOUND');
    await db.update(user).set({ status: 'active' }).where(eq(user.id, bob.userId));

    const invisibleToastId = await annToast();
    const invisible = await create(bob, invisibleToastId);
    await db.update(toast).set({ status: 'rejected' }).where(eq(toast.id, invisibleToastId));
    expectError(await likeComment(ann, invisible.id), 404, 'NOT_FOUND');
    expectError(await likeComment(ann, UNKNOWN_ID), 404, 'NOT_FOUND');
  });

  it('allows unlike without toast visibility and returns 204 for an unknown comment', async () => {
    const toastId = await annToast();
    const item = await create(bob, toastId);
    expect((await likeComment(ann, item.id)).statusCode).toBe(204);
    await db.update(toast).set({ status: 'rejected' }).where(eq(toast.id, toastId));

    const res = await unlikeComment(ann, item.id);
    expect(res.statusCode, res.body).toBe(204);
    expect(res.body).toBe('');
    expect(await db.select().from(commentLike).where(eq(commentLike.commentId, item.id))).toEqual(
      [],
    );
    expect((await unlikeComment(ann, UNKNOWN_ID)).statusCode).toBe(204);
  });
});

describe('DELETE /comments/:id', () => {
  it('lets the author soft-delete, preserving replies and allowing new replies to the placeholder', async () => {
    const toastId = await annToast();
    const parent = await create(bob, toastId);
    const reply = await create(ann, toastId, { body: 'Reply', parentId: parent.id });
    await likeComment(ann, parent.id);
    const likesBeforeDelete = await db
      .select()
      .from(commentLike)
      .where(eq(commentLike.commentId, parent.id));
    expect(likesBeforeDelete).toHaveLength(1);
    expect(likesBeforeDelete[0]).toMatchObject({
      commentId: parent.id,
      userId: ann.userId,
      createdAt: expect.any(Date) as Date,
    });
    const res = await remove(bob, parent.id);
    expect(res.statusCode, res.body).toBe(204);
    expect(res.body).toBe('');
    const [stored] = await db.select().from(comment).where(eq(comment.id, parent.id));
    expect(stored?.deletedAt).toBeInstanceOf(Date);
    expect(await db.select().from(commentLike).where(eq(commentLike.commentId, parent.id))).toEqual(
      [],
    );
    const page = (await list(bob, toastId)).json<CommentPage>();
    expect(page.items).toEqual([
      { ...parent, deleted: true, body: null, author: null, canDelete: false },
      { ...reply, canDelete: false },
    ]);
    const later = await create(ann, toastId, { body: 'Still a reply', parentId: parent.id });
    expect(later.parentId).toBe(parent.id);
  });

  it('forbids another user, including the toast owner, from deleting a comment', async () => {
    const toastId = await annToast();
    const item = await create(bob, toastId);
    expectError(await remove(ann, item.id), 403, 'FORBIDDEN');
    expect((await list(bob, toastId)).json<CommentPage>().items).toEqual([item]);
  });

  it('lets an admin delete another author’s comment and exposes canDelete to admins', async () => {
    const toastId = await annToast();
    const item = await create(bob, toastId);
    await db.update(user).set({ role: 'admin' }).where(eq(user.id, ann.userId));
    expect((await list(ann, toastId)).json<CommentPage>().items[0]?.canDelete).toBe(true);
    expect((await remove(ann, item.id)).statusCode).toBe(204);
    expect((await list(ann, toastId)).json<CommentPage>().items[0]).toEqual({
      ...item,
      deleted: true,
      body: null,
      author: null,
      canDelete: false,
    });
  });

  it('cannot delete comments on an inaccessible session', async () => {
    const toastId = await annToast();
    const item = await create(bob, toastId);
    await db.update(toast).set({ status: 'rejected' }).where(eq(toast.id, toastId));
    expectError(await remove(bob, item.id), 404, 'NOT_FOUND');
  });

  it('is a 404 for an unknown comment', async () => {
    expectError(await remove(bob, UNKNOWN_ID), 404, 'NOT_FOUND');
  });

  it('shows a banned author as a placeholder without removing their replies', async () => {
    const toastId = await annToast();
    const parent = await create(bob, toastId);
    const reply = await create(ann, toastId, { body: 'Reply', parentId: parent.id });
    await likeComment(ann, parent.id);
    await db.update(user).set({ status: 'banned' }).where(eq(user.id, bob.userId));
    expect((await list(ann, toastId)).json<CommentPage>().items).toEqual([
      { ...parent, deleted: true, body: null, author: null, canDelete: false },
      reply,
    ]);
    expect(
      (await create(ann, toastId, { body: 'Another reply', parentId: parent.id })).parentId,
    ).toBe(parent.id);
  });
});
