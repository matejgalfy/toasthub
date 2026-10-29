import { randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ACHIEVEMENTS,
  addDays,
  type Heatmap,
  type LocalDate,
  localDate,
  type ProfileVisibility,
  type UserAchievements,
  type UserProfileResponse,
  type UserStats,
  type UserToastPage,
  weekStart,
} from '@toasthub/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { insertToasts } from '../../../test/toasts';
import { type Database, DB } from '../../db/db.module';
import {
  clan,
  clanMembership,
  toast,
  toastOfTheWeek,
  toastSession,
  user,
  userAchievement,
} from '../../db/schema';
import { StorageService } from '../storage/storage.service';

let app: NestFastifyApplication;
let db: Database;
let ann: SignedIn;
let bob: SignedIn;
let today: LocalDate;

const UNKNOWN_ID = '01890a5d-ac96-774b-bcce-b302099a8057';
const ROUTES = ['', '/toasts', '/stats', '/heatmap', '/achievements'] as const;

beforeEach(async () => {
  app = await createTestApp();
  db = app.get<Database>(DB);
  today = localDate(new Date());
  ann = await signIn(app, 'ann@example.com');
  bob = await signIn(app, 'bob@example.com');
  await onboard(ann, 'Ann');
  await onboard(bob, 'Bob');
});

afterEach(async () => {
  await app.close();
});

async function onboard(who: SignedIn, displayName: string, visibility?: ProfileVisibility) {
  await db
    .update(user)
    .set({ displayName, avatarId: 3, profileVisibility: visibility })
    .where(eq(user.id, who.userId));
}

async function joinClan(name: string, ...members: SignedIn[]): Promise<string> {
  const [row] = await db.insert(clan).values({ name }).returning();
  if (!row) throw new Error('No clan');
  await db.insert(clanMembership).values(
    members.map((member, i) => ({
      userId: member.userId,
      clanId: row.id,
      role: i === 0 ? ('owner' as const) : ('member' as const),
    })),
  );
  return row.id;
}

function get(as: SignedIn | null, url: string) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/users${url}`,
    headers: as ? { cookie: as.cookie } : {},
  });
}

async function getOk<T>(as: SignedIn, url: string): Promise<T> {
  const res = await get(as, url);
  expect(res.statusCode).toBe(200);
  return res.json<T>();
}

/** Midday in Bratislava, `daysAgo` days before today. */
function dayAt(daysAgo: number): Date {
  return new Date(`${addDays(today, -daysAgo)}T10:00:00Z`);
}

async function addToasts(userId: string, daysAgo: number[], extra: { status?: 'rejected' } = {}) {
  await insertToasts(
    db,
    daysAgo.map((n) => ({ userId, eatenAt: dayAt(n), ...extra })),
  );
}

/** A session of `count` toasts `daysAgo` days ago with a stored photo on its lead toast. */
async function addPhotoSession(userId: string, daysAgo: number, count = 1) {
  const key = `toasts/${userId}/${randomUUID()}.webp`;
  await app.get(StorageService).put(key, Buffer.from(key), 'image/webp');
  const eatenAt = dayAt(daysAgo);
  const [session] = await db
    .insert(toastSession)
    .values({ userId, createdAt: eatenAt })
    .returning();
  if (!session) throw new Error('No session');
  const toasts = await db
    .insert(toast)
    .values(
      Array.from({ length: count }, (_, i) => ({
        userId,
        sessionId: session.id,
        eatenAt,
        photoKey: i === 0 ? key : null,
      })),
    )
    .returning();
  const lead = toasts[0];
  if (!lead) throw new Error('No lead toast');
  return { key, sessionId: session.id, lead };
}

describe.each([
  { name: 'a public profile', visibility: 'public', clanmates: false, access: 'full' },
  {
    name: 'a clan-only profile seen by a clanmate',
    visibility: 'clan',
    clanmates: true,
    access: 'full',
  },
  {
    name: 'a clan-only profile seen by a stranger',
    visibility: 'clan',
    clanmates: false,
    access: 'reduced',
  },
] as const)('visibility: $name', ({ visibility, clanmates, access }) => {
  beforeEach(async () => {
    await onboard(bob, 'Bob', visibility);
    if (clanmates) {
      await joinClan('Breakfast Club', bob, ann);
    } else {
      // In clans, but not the same one.
      await joinClan('Breakfast Club', bob);
      await joinClan('Brunch Club', ann);
    }
    await addToasts(bob.userId, [0, 1]);
    await addPhotoSession(bob.userId, 0);
  });

  it(`GET /users/:id is ${access}, with name, avatar and counts`, async () => {
    const { profile } = await getOk<UserProfileResponse>(ann, `/${bob.userId}`);
    expect(profile).toEqual({
      id: bob.userId,
      displayName: 'Bob',
      avatarId: 3,
      access,
      counts: expect.objectContaining({ year: expect.any(Number) as number }) as object,
    });
  });

  it.each(ROUTES.slice(1))(
    `GET /users/:id%s is ${access === 'full' ? '200' : '403'}`,
    async (route) => {
      const res = await get(ann, `/${bob.userId}${route}`);
      if (access === 'full') {
        expect(res.statusCode).toBe(200);
      } else {
        expect(res.statusCode).toBe(403);
        expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
      }
    },
  );

  it('GET /users/:id/toasts signs photos only for full access', async () => {
    const res = await get(ann, `/${bob.userId}/toasts`);
    if (access === 'full') {
      expect(res.json<UserToastPage>().items).toHaveLength(1);
    } else {
      expect(res.body).not.toMatch(/X-Amz/);
    }
  });
});

describe('GET /users/:id', () => {
  it('requires a session', async () => {
    expect((await get(null, `/${bob.userId}`)).statusCode).toBe(401);
  });

  it('never returns the email', async () => {
    const res = await get(ann, `/${bob.userId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('@example.com');
  });

  it('counts countable toasts in the current week, month and year', async () => {
    await addToasts(bob.userId, [0, 0, 400]);
    await addToasts(bob.userId, [0], { status: 'rejected' });
    await insertToasts(db, [{ userId: bob.userId, eatenAt: dayAt(0), deletedAt: new Date() }]);
    const { profile } = await getOk<UserProfileResponse>(ann, `/${bob.userId}`);
    expect(profile.counts).toEqual({ week: 2, month: 2, year: 2 });
  });

  it('shows the own clan-only profile in full', async () => {
    await onboard(ann, 'Ann', 'clan');
    const { profile } = await getOk<UserProfileResponse>(ann, `/${ann.userId}`);
    expect(profile.access).toBe('full');
  });

  it('is a 404 for an unknown, banned or not yet onboarded user', async () => {
    const cyril = await signIn(app, 'cyril@example.com');
    await db.update(user).set({ status: 'banned' }).where(eq(user.id, bob.userId));
    for (const id of [UNKNOWN_ID, bob.userId, cyril.userId]) {
      for (const route of ROUTES) {
        const res = await get(ann, `/${id}${route}`);
        expect(res.statusCode, `${id}${route}`).toBe(404);
      }
    }
  });

  it('is a 400 for an id that is not a UUID', async () => {
    const res = await get(ann, '/not-a-uuid');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fields: { id: expect.any(String) as string } },
    });
  });
});

describe('GET /users/:id/toasts', () => {
  it('lists visible photos newest first, one per session, with its toast count', async () => {
    const older = await addPhotoSession(bob.userId, 2, 3);
    const newer = await addPhotoSession(bob.userId, 0);
    await addToasts(bob.userId, [0, 1]);

    const page = await getOk<UserToastPage>(ann, `/${bob.userId}/toasts`);
    expect(page.nextCursor).toBeNull();
    expect(page.items).toEqual([
      {
        id: newer.lead.id,
        sessionId: newer.sessionId,
        eatenAt: dayAt(0).toISOString(),
        localDate: today,
        count: 1,
        photoUrl: expect.stringMatching(/X-Amz-Expires=3600/) as string,
        likeCount: 0,
        likedByMe: false,
      },
      expect.objectContaining({ id: older.lead.id, count: 3, localDate: addDays(today, -2) }),
    ]);
    const download = await fetch(page.items[0]?.photoUrl ?? '');
    expect(download.status).toBe(200);
    expect(await download.text()).toBe(newer.key);
  });

  it('leaves out hidden, rejected and deleted photos', async () => {
    const hidden = await addPhotoSession(bob.userId, 1);
    const rejected = await addPhotoSession(bob.userId, 2);
    const deleted = await addPhotoSession(bob.userId, 3);
    await db.update(toast).set({ photoHiddenAt: new Date() }).where(eq(toast.id, hidden.lead.id));
    await db.update(toast).set({ status: 'rejected' }).where(eq(toast.id, rejected.lead.id));
    await db.update(toast).set({ deletedAt: new Date() }).where(eq(toast.id, deleted.lead.id));
    const kept = await addPhotoSession(bob.userId, 4);

    const page = await getOk<UserToastPage>(ann, `/${bob.userId}/toasts`);
    expect(page.items.map((item) => item.id)).toEqual([kept.lead.id]);
  });

  it('pages with a cursor', async () => {
    const sessions = [];
    for (const daysAgo of [0, 1, 2]) sessions.push(await addPhotoSession(bob.userId, daysAgo));

    const first = await getOk<UserToastPage>(ann, `/${bob.userId}/toasts?limit=2`);
    expect(first.items.map((item) => item.id)).toEqual(sessions.slice(0, 2).map((s) => s.lead.id));
    expect(first.nextCursor).not.toBeNull();
    const second = await getOk<UserToastPage>(
      ann,
      `/${bob.userId}/toasts?limit=2&cursor=${first.nextCursor ?? ''}`,
    );
    expect(second.items.map((item) => item.id)).toEqual([sessions[2]?.lead.id]);
    expect(second.nextCursor).toBeNull();
  });

  it('rejects a bad cursor', async () => {
    const res = await get(ann, `/${bob.userId}/toasts?cursor=nope`);
    expect(res.statusCode).toBe(400);
  });

  it("shows a Toast of the week winner's photo like any other on a full profile", async () => {
    const winner = await addPhotoSession(bob.userId, 7);
    await db
      .insert(toastOfTheWeek)
      .values({ weekStart: weekStart(addDays(today, -7)), toastId: winner.lead.id });
    const page = await getOk<UserToastPage>(ann, `/${bob.userId}/toasts`);
    expect(page.items.map((item) => item.id)).toEqual([winner.lead.id]);
  });
});

describe('GET /users/:id/stats', () => {
  it('is all zero before the first toast', async () => {
    expect(await getOk<UserStats>(ann, `/${bob.userId}/stats`)).toEqual({
      totals: { allTime: 0, firstToastDate: null },
      averages: { perDay: 0, perWeek: 0, perMonth: 0 },
      bestDay: null,
      streak: { current: 0, longest: 0 },
    });
  });

  it('sums countable toasts, finds the best day and the streaks', async () => {
    await addToasts(bob.userId, [9, 5, 5, 5, 4, 1, 0, 0]);
    await addToasts(bob.userId, [3, 3, 3, 3], { status: 'rejected' });
    await addToasts(ann.userId, [2, 2, 2, 2, 2]);

    const stats = await getOk<UserStats>(ann, `/${bob.userId}/stats`);
    expect(stats.totals).toEqual({ allTime: 8, firstToastDate: addDays(today, -9) });
    expect(stats.averages.perDay).toBeCloseTo(8 / 10);
    expect(stats.bestDay).toEqual({ date: addDays(today, -5), count: 3 });
    expect(stats.streak).toEqual({ current: 2, longest: 2 });
  });
});

describe('GET /users/:id/heatmap', () => {
  it('returns the days of the current year with their counts', async () => {
    const year = Number(today.slice(0, 4));
    await insertToasts(db, [
      { userId: bob.userId, eatenAt: new Date(`${String(year)}-01-01T10:00:00Z`) },
      { userId: bob.userId, eatenAt: new Date(`${String(year - 1)}-12-31T10:00:00Z`) },
    ]);
    await addToasts(bob.userId, [0, 0]);

    const heatmap = await getOk<Heatmap>(ann, `/${bob.userId}/heatmap`);
    expect(heatmap.year).toBe(year);
    // On 1 January both entries are the same day.
    const expected =
      today === `${String(year)}-01-01`
        ? [{ date: today, count: 3 }]
        : [
            { date: `${String(year)}-01-01`, count: 1 },
            { date: today, count: 2 },
          ];
    expect(heatmap.days).toEqual(expected);

    const previous = await getOk<Heatmap>(ann, `/${bob.userId}/heatmap?year=${String(year - 1)}`);
    expect(previous).toEqual({
      year: year - 1,
      days: [{ date: `${String(year - 1)}-12-31`, count: 1 }],
    });
  });

  it.each(['1999', '2101', '2026.5', 'abc'])('rejects ?year=%s', async (year) => {
    const res = await get(ann, `/${bob.userId}/heatmap?year=${year}`);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('GET /users/:id/achievements', () => {
  it('lists every achievement in display order with the earned dates', async () => {
    const earnedAt = new Date('2026-03-01T08:00:00.000Z');
    await db.insert(userAchievement).values([
      { userId: bob.userId, achievementCode: 'shutterbug', earnedAt },
      { userId: ann.userId, achievementCode: 'first_bite' },
    ]);

    const { items } = await getOk<UserAchievements>(ann, `/${bob.userId}/achievements`);
    expect(items.map((item) => item.code)).toEqual(ACHIEVEMENTS.map((a) => a.code));
    expect(items.filter((item) => item.earnedAt !== null)).toEqual([
      { code: 'shutterbug', earnedAt: earnedAt.toISOString() },
    ]);
  });
});
