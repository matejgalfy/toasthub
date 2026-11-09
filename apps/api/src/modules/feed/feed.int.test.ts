import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FeedPage } from '@toasthub/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn, WEB_ORIGIN } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { type Database, DB } from '../../db/db.module';
import { clan, clanMembership, like, toast, toastSession, user } from '../../db/schema';

let app: NestFastifyApplication;
let db: Database;
let ann: SignedIn;
let bob: SignedIn;
let cyril: SignedIn;

const UNKNOWN_ID = '01890a5d-ac96-774b-bcce-b302099a8057';

beforeEach(async () => {
  app = await createTestApp();
  db = app.get<Database>(DB);
  ann = await signUp('ann@example.com', 'Ann');
  bob = await signUp('bob@example.com', 'Bob');
  cyril = await signUp('cyril@example.com', 'Cyril');
});

afterEach(async () => {
  await app.close();
});

async function signUp(email: string, displayName: string): Promise<SignedIn> {
  const who = await signIn(app, email);
  await db.update(user).set({ displayName }).where(eq(user.id, who.userId));
  return who;
}

function get(as: SignedIn | null, url: string) {
  return app.inject({
    method: 'GET',
    url: `/api/v1${url}`,
    headers: as ? { cookie: as.cookie } : {},
  });
}

async function feed(as: SignedIn, query = ''): Promise<FeedPage> {
  const res = await get(as, `/feed${query}`);
  expect(res.statusCode, res.body).toBe(200);
  return res.json<FeedPage>();
}

/** A session of `count` toasts logged at `at`, with an optional photo on its lead toast. */
async function addSession(
  userId: string,
  at: Date,
  { count = 1, photo = false, hidden = false } = {},
): Promise<{ sessionId: string; leadId: string; toastIds: string[] }> {
  const [session] = await db.insert(toastSession).values({ userId, createdAt: at }).returning();
  if (!session) throw new Error('No session');
  const rows = await db
    .insert(toast)
    .values(
      Array.from({ length: count }, (_, i) => ({
        userId,
        sessionId: session.id,
        eatenAt: at,
        photoKey: i === 0 && photo ? `toasts/${userId}/${session.id}.webp` : null,
        photoHiddenAt: i === 0 && hidden ? at : null,
      })),
    )
    .returning({ id: toast.id });
  // v7 ids rise in insert order and the toasts share `eaten_at`, so the first is the lead toast.
  const toastIds = rows.map((row) => row.id);
  const [leadId] = toastIds;
  if (!leadId) throw new Error('No toasts');
  return { sessionId: session.id, leadId, toastIds };
}

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

describe('GET /feed (§4.14)', () => {
  it('lists every user’s sessions newest first, with count, photo and likes', async () => {
    // Ann and Bob share no clan, Cyril is in none: the global feed shows them all.
    const [crumbs] = await db.insert(clan).values({ name: 'Crumbs' }).returning();
    if (!crumbs) throw new Error('No clan');
    await db
      .insert(clanMembership)
      .values({ userId: bob.userId, clanId: crumbs.id, role: 'owner' });
    const oldest = await addSession(cyril.userId, hoursAgo(3));
    const older = await addSession(ann.userId, hoursAgo(2), { count: 3 });
    const newer = await addSession(bob.userId, hoursAgo(1), { count: 2, photo: true });
    await db.insert(like).values([
      { userId: ann.userId, toastId: newer.leadId },
      { userId: cyril.userId, toastId: newer.leadId },
    ]);

    const page = await feed(ann);
    expect(page.nextCursor).toBeNull();
    expect(page.items.map((item) => item.sessionId)).toEqual([
      newer.sessionId,
      older.sessionId,
      oldest.sessionId,
    ]);
    const [first, second] = page.items;
    expect(first).toMatchObject({
      toastId: newer.leadId,
      user: { id: bob.userId, displayName: 'Bob' },
      count: 2,
      likeCount: 2,
      likedByMe: true,
    });
    expect(first?.photoUrl).toContain(`toasts/${bob.userId}/`);
    expect(second).toMatchObject({ count: 3, photoUrl: null, likeCount: 0, likedByMe: false });
    expect((await feed(bob)).items[0]).toMatchObject({ likeCount: 2, likedByMe: false });
  });

  it('shares likes with the clan feed: both show the lead toast’s likes', async () => {
    const [crumbs] = await db.insert(clan).values({ name: 'Crumbs' }).returning();
    if (!crumbs) throw new Error('No clan');
    await db.insert(clanMembership).values([
      { userId: ann.userId, clanId: crumbs.id, role: 'owner' },
      { userId: bob.userId, clanId: crumbs.id, role: 'member' },
    ]);
    const session = await addSession(bob.userId, hoursAgo(1), { photo: true });
    const liked = await app.inject({
      method: 'POST',
      url: `/api/v1/toasts/${session.leadId}/like`,
      headers: { cookie: ann.cookie, origin: WEB_ORIGIN },
    });
    expect(liked.statusCode).toBe(204);

    const clanFeed = (await get(ann, `/clans/${crumbs.id}/feed`)).json<FeedPage>();
    expect(clanFeed.items[0]).toMatchObject({ likeCount: 1, likedByMe: true });
    expect((await feed(ann)).items[0]).toMatchObject({ likeCount: 1, likedByMe: true });
    expect((await feed(cyril)).items[0]).toMatchObject({ likeCount: 1, likedByMe: false });
  });

  it('counts only countable toasts, hides a hidden photo and leaves out removed sessions', async () => {
    const partly = await addSession(ann.userId, hoursAgo(1), { count: 3 });
    await db
      .update(toast)
      .set({ deletedAt: new Date() })
      .where(eq(toast.id, partly.toastIds[2] ?? UNKNOWN_ID));
    const hidden = await addSession(ann.userId, hoursAgo(2), { photo: true, hidden: true });
    const deleted = await addSession(ann.userId, hoursAgo(3));
    await db
      .update(toastSession)
      .set({ deletedAt: new Date() })
      .where(eq(toastSession.id, deleted.sessionId));
    const rejected = await addSession(bob.userId, hoursAgo(4));
    await db.update(toast).set({ status: 'rejected' }).where(eq(toast.id, rejected.leadId));
    await addSession(cyril.userId, hoursAgo(5));
    await db.update(user).set({ status: 'banned' }).where(eq(user.id, cyril.userId));

    const page = await feed(ann);
    expect(page.items.map((item) => [item.sessionId, item.count, item.photoUrl])).toEqual([
      [partly.sessionId, 2, null],
      [hidden.sessionId, 1, null],
    ]);
  });

  it('pages with a cursor', async () => {
    const at = hoursAgo(1);
    // Same instant: the session id breaks the tie.
    const sessions = [];
    for (let i = 0; i < 3; i++) sessions.push(await addSession(bob.userId, at));
    const ids = sessions.map((s) => s.sessionId).reverse();
    const first = await feed(ann, '?limit=2');
    expect(first.items.map((item) => item.sessionId)).toEqual(ids.slice(0, 2));
    expect(first.nextCursor).not.toBeNull();
    const second = await feed(ann, `?limit=2&cursor=${first.nextCursor ?? ''}`);
    expect(second.items.map((item) => item.sessionId)).toEqual(ids.slice(2));
    expect(second.nextCursor).toBeNull();
  });

  it('is a 401 without a session and a 400 for a bad cursor or limit', async () => {
    expect((await get(null, '/feed')).statusCode).toBe(401);
    expect((await get(ann, '/feed?cursor=nonsense')).statusCode).toBe(400);
    expect((await get(ann, '/feed?limit=51')).statusCode).toBe(400);
  });
});
