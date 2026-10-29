import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { ProfileVisibility, UserToastPage } from '@toasthub/shared';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn, WEB_ORIGIN } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { insertToasts } from '../../../test/toasts';
import { type Database, DB } from '../../db/db.module';
import {
  clan,
  clanMembership,
  flag,
  like,
  toast,
  toastOfTheWeek,
  toastSession,
  user,
} from '../../db/schema';
import { REPORT_RATE_LIMIT } from './toasts.service';

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

async function setVisibility(who: SignedIn, profileVisibility: ProfileVisibility) {
  await db.update(user).set({ profileVisibility }).where(eq(user.id, who.userId));
}

async function sameClan(...members: SignedIn[]) {
  const [row] = await db.insert(clan).values({ name: 'Crumbs' }).returning();
  if (!row) throw new Error('No clan');
  await db.insert(clanMembership).values(
    members.map((member, i) => ({
      userId: member.userId,
      clanId: row.id,
      role: i === 0 ? ('owner' as const) : ('member' as const),
    })),
  );
}

/** One session of Ann's with a photo on its lead toast; returns the lead toast's id. */
async function annPhoto(): Promise<string> {
  const [row] = await insertToasts(db, [
    { userId: ann.userId, photoKey: `toasts/${ann.userId}/photo.webp` },
  ]);
  if (!row) throw new Error('No toast');
  return row.id;
}

type Method = 'POST' | 'DELETE';

function call(as: SignedIn | null, method: Method, url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api/v1/toasts${url}`,
    headers: as ? { cookie: as.cookie, origin: WEB_ORIGIN } : {},
    ...(payload ? { payload } : {}),
  });
}

function expectError(res: Awaited<ReturnType<typeof call>>, status: number, code: string): void {
  expect(res.statusCode, res.body).toBe(status);
  expect(res.json<{ error: { code: string } }>().error.code).toBe(code);
}

async function likesOf(toastId: string) {
  return db.select({ userId: like.userId }).from(like).where(eq(like.toastId, toastId));
}

async function photoReports() {
  return db
    .select({
      subjectUserId: flag.subjectUserId,
      toastId: flag.toastId,
      reporterId: flag.reporterId,
      reason: flag.reason,
      status: flag.status,
    })
    .from(flag)
    .where(eq(flag.type, 'photo_report'));
}

describe('auth', () => {
  it.each([
    ['POST', '/like'],
    ['DELETE', '/like'],
    ['POST', '/report'],
  ] as const)('%s /toasts/:id%s requires a session', async (method, path) => {
    expectError(await call(null, method, `/${UNKNOWN_ID}${path}`), 401, 'UNAUTHENTICATED');
  });
});

describe('POST /toasts/:id/like', () => {
  it('likes a visible session once, however often it is sent', async () => {
    const toastId = await annPhoto();
    for (let i = 0; i < 2; i++) {
      expect((await call(bob, 'POST', `/${toastId}/like`)).statusCode).toBe(204);
    }
    expect(await likesOf(toastId)).toEqual([{ userId: bob.userId }]);
  });

  it('likes a session without a photo and the own one', async () => {
    const [row] = await insertToasts(db, [{ userId: ann.userId }]);
    const toastId = row?.id ?? UNKNOWN_ID;
    expect((await call(bob, 'POST', `/${toastId}/like`)).statusCode).toBe(204);
    expect((await call(ann, 'POST', `/${toastId}/like`)).statusCode).toBe(204);
    expect(await likesOf(toastId)).toHaveLength(2);
  });

  it('is a 403 for a clan-only profile, unless clanmates or a Toast of the week', async () => {
    await setVisibility(ann, 'clan');
    const toastId = await annPhoto();
    expectError(await call(bob, 'POST', `/${toastId}/like`), 403, 'FORBIDDEN');

    await db.insert(toastOfTheWeek).values({ weekStart: '2026-10-26', toastId });
    expect((await call(bob, 'POST', `/${toastId}/like`)).statusCode).toBe(204);
    await db.delete(toastOfTheWeek);
    await db.delete(like);

    await sameClan(ann, bob);
    expect((await call(bob, 'POST', `/${toastId}/like`)).statusCode).toBe(204);
  });

  it('is a 404 for a toast that is not a session’s lead toast', async () => {
    const [session] = await db.insert(toastSession).values({ userId: ann.userId }).returning();
    const rows = await db
      .insert(toast)
      .values([0, 1].map(() => ({ userId: ann.userId, sessionId: session?.id ?? UNKNOWN_ID })))
      .returning({ id: toast.id });
    const [lead, second] = rows.map((row) => row.id);
    expectError(await call(bob, 'POST', `/${second ?? UNKNOWN_ID}/like`), 404, 'NOT_FOUND');
    expect((await call(bob, 'POST', `/${lead ?? UNKNOWN_ID}/like`)).statusCode).toBe(204);
  });

  it.each([
    ['deleted', { deletedAt: new Date() }],
    ['rejected', { status: 'rejected' as const }],
  ])('is a 404 for a %s toast', async (_, change) => {
    const toastId = await annPhoto();
    await db.update(toast).set(change).where(eq(toast.id, toastId));
    expectError(await call(bob, 'POST', `/${toastId}/like`), 404, 'NOT_FOUND');
  });

  it('is a 404 for a banned owner’s toast and an unknown id', async () => {
    const toastId = await annPhoto();
    await db.update(user).set({ status: 'banned' }).where(eq(user.id, ann.userId));
    expectError(await call(bob, 'POST', `/${toastId}/like`), 404, 'NOT_FOUND');
    expectError(await call(bob, 'POST', `/${UNKNOWN_ID}/like`), 404, 'NOT_FOUND');
  });

  it('shows on the profile photo list (M9)', async () => {
    const toastId = await annPhoto();
    await call(bob, 'POST', `/${toastId}/like`);
    const get = (as: SignedIn) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/users/${ann.userId}/toasts`,
        headers: { cookie: as.cookie },
      });
    expect((await get(bob)).json<UserToastPage>().items).toMatchObject([
      { id: toastId, likeCount: 1, likedByMe: true },
    ]);
    expect((await get(ann)).json<UserToastPage>().items).toMatchObject([
      { id: toastId, likeCount: 1, likedByMe: false },
    ]);
  });
});

describe('DELETE /toasts/:id/like', () => {
  it('takes the own like back, idempotently', async () => {
    const toastId = await annPhoto();
    await call(ann, 'POST', `/${toastId}/like`);
    await call(bob, 'POST', `/${toastId}/like`);
    for (let i = 0; i < 2; i++) {
      expect((await call(bob, 'DELETE', `/${toastId}/like`)).statusCode).toBe(204);
    }
    expect(await likesOf(toastId)).toEqual([{ userId: ann.userId }]);
  });

  it('works without access to the toast any more', async () => {
    const toastId = await annPhoto();
    await call(bob, 'POST', `/${toastId}/like`);
    await setVisibility(ann, 'clan');
    expect((await call(bob, 'DELETE', `/${toastId}/like`)).statusCode).toBe(204);
    expect(await likesOf(toastId)).toEqual([]);
    expect((await call(bob, 'DELETE', `/${UNKNOWN_ID}/like`)).statusCode).toBe(204);
  });
});

describe('POST /toasts/:id/report', () => {
  it('opens a photo_report flag with the trimmed reason (BR-MOD-3)', async () => {
    const toastId = await annPhoto();
    const res = await call(bob, 'POST', `/${toastId}/report`, { reason: '  Not a toast  ' });
    expect(res.statusCode, res.body).toBe(202);
    expect(await photoReports()).toEqual([
      {
        subjectUserId: ann.userId,
        toastId,
        reporterId: bob.userId,
        reason: 'Not a toast',
        status: 'open',
      },
    ]);
  });

  it('takes no body or an empty reason', async () => {
    const toastId = await annPhoto();
    expect((await call(bob, 'POST', `/${toastId}/report`)).statusCode).toBe(202);
    const carol = await signUp('carol@example.com', 'Carol');
    expect((await call(carol, 'POST', `/${toastId}/report`, { reason: ' ' })).statusCode).toBe(202);
    expect((await photoReports()).map((r) => r.reason)).toEqual([null, null]);
  });

  it('adds nothing while the reporter’s earlier report is open', async () => {
    const toastId = await annPhoto();
    await call(bob, 'POST', `/${toastId}/report`);
    expect((await call(bob, 'POST', `/${toastId}/report`)).statusCode).toBe(202);
    expect(await photoReports()).toHaveLength(1);
    await db
      .update(flag)
      .set({ status: 'dismissed' })
      .where(and(eq(flag.toastId, toastId), eq(flag.reporterId, bob.userId)));
    await call(bob, 'POST', `/${toastId}/report`);
    expect(await photoReports()).toHaveLength(2);
  });

  it('is a 409 without a photo or for a hidden one', async () => {
    const [plain] = await insertToasts(db, [{ userId: ann.userId }]);
    expectError(await call(bob, 'POST', `/${plain?.id ?? UNKNOWN_ID}/report`), 409, 'CONFLICT');
    const toastId = await annPhoto();
    await db.update(toast).set({ photoHiddenAt: new Date() }).where(eq(toast.id, toastId));
    expectError(await call(bob, 'POST', `/${toastId}/report`), 409, 'CONFLICT');
    expect(await photoReports()).toEqual([]);
  });

  it('is a 403 for a photo the reporter can’t see and a 404 for an unknown toast', async () => {
    await setVisibility(ann, 'clan');
    const toastId = await annPhoto();
    expectError(await call(bob, 'POST', `/${toastId}/report`), 403, 'FORBIDDEN');
    expectError(await call(bob, 'POST', `/${UNKNOWN_ID}/report`), 404, 'NOT_FOUND');
  });

  it('is a 400 for a reason over 280 chars or an unknown field', async () => {
    const toastId = await annPhoto();
    const long = { reason: 'x'.repeat(281) };
    expectError(await call(bob, 'POST', `/${toastId}/report`, long), 400, 'VALIDATION_ERROR');
    const typo = { reasn: 'spam' };
    expectError(await call(bob, 'POST', `/${toastId}/report`, typo), 400, 'VALIDATION_ERROR');
  });

  it(`is rate limited to ${String(REPORT_RATE_LIMIT)} attempts an hour`, async () => {
    const toastId = await annPhoto();
    for (let i = 0; i < REPORT_RATE_LIMIT; i++) {
      expect((await call(bob, 'POST', `/${toastId}/report`)).statusCode).toBe(202);
    }
    expectError(await call(bob, 'POST', `/${toastId}/report`), 429, 'RATE_LIMITED');
    // Per user.
    expect((await call(ann, 'POST', `/${toastId}/report`)).statusCode).toBe(202);
  });
});
