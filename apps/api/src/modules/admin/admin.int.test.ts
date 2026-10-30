import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  addDays,
  type AdminClanResponse,
  type AdminMetrics,
  type AdminUserPage,
  type AdminUserResponse,
  type AppSettingsResponse,
  localDate,
  type ToastOfTheWeek,
} from '@toasthub/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn, WEB_ORIGIN } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { insertToasts } from '../../../test/toasts';
import { type Database, DB } from '../../db/db.module';
import {
  clan,
  clanJoinRequest,
  clanMembership,
  flag,
  session,
  toastOfTheWeek,
  user,
} from '../../db/schema';
import { previousWeekStart } from '../totw/totw-draw';
import { promoteToAdmin } from './promote-admin';

let app: NestFastifyApplication;
let db: Database;
let admin: SignedIn;
let ann: SignedIn;
let bob: SignedIn;

const UNKNOWN_ID = '01890a5d-ac96-774b-bcce-b302099a8057';

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

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function call(as: SignedIn | null, method: Method, url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api/v1/admin${url}`,
    headers: as ? { cookie: as.cookie, origin: WEB_ORIGIN } : {},
    ...(payload ? { payload } : {}),
  });
}

/** Breakfast Club with Ann as its Owner and Bob as a Member. */
async function breakfastClub(): Promise<string> {
  const [row] = await db.insert(clan).values({ name: 'Breakfast Club' }).returning();
  if (!row) throw new Error('No clan');
  await db.insert(clanMembership).values([
    { userId: ann.userId, clanId: row.id, role: 'owner' },
    { userId: bob.userId, clanId: row.id, role: 'member' },
  ]);
  return row.id;
}

async function roleOf(userId: string) {
  const [row] = await db
    .select({ role: clanMembership.role })
    .from(clanMembership)
    .where(eq(clanMembership.userId, userId));
  return row?.role ?? null;
}

describe('admin access', () => {
  const routes: [Method, string, object?][] = [
    ['GET', '/flags'],
    ['POST', `/flags/${UNKNOWN_ID}/resolve`, { action: 'dismiss' }],
    ['GET', '/users'],
    ['POST', `/users/${UNKNOWN_ID}/status`, { status: 'banned' }],
    ['PATCH', `/clans/${UNKNOWN_ID}`, { name: 'Crumbs' }],
    ['DELETE', `/clans/${UNKNOWN_ID}`],
    ['GET', '/settings'],
    ['PATCH', '/settings', { clanMaxMembers: 20 }],
    ['GET', '/metrics'],
    ['POST', '/toast-of-the-week/2026-10-19/redraw'],
  ];

  it('is 403 for users and 401 without a session on every route', async () => {
    for (const [method, url, payload] of routes) {
      expect((await call(ann, method, url, payload)).statusCode, `${method} ${url}`).toBe(403);
      expect((await call(null, method, url, payload)).statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('opens once the promote script makes a user an admin', async () => {
    expect(await promoteToAdmin(db, 'nobody@example.com')).toBe(false);
    expect(await promoteToAdmin(db, ' ANN@example.com ')).toBe(true);
    expect((await call(ann, 'GET', '/settings')).statusCode).toBe(200);
  });
});

describe('GET /admin/users', () => {
  it('lists users newest first with their email and clan', async () => {
    const clanId = await breakfastClub();
    const carl = await signIn(app, 'carl@example.com');

    const res = await call(admin, 'GET', '/users');
    expect(res.statusCode).toBe(200);
    const page = res.json<AdminUserPage>();
    expect(page.items.map((item) => item.id)).toEqual([
      carl.userId,
      bob.userId,
      ann.userId,
      admin.userId,
    ]);
    expect(page.items[0]).toMatchObject({
      email: 'carl@example.com',
      displayName: null,
      clan: null,
    });
    expect(page.items[2]).toMatchObject({
      email: 'ann@example.com',
      displayName: 'Ann',
      role: 'user',
      status: 'active',
      clan: { id: clanId, name: 'Breakfast Club' },
    });
    expect(page.items[3]).toMatchObject({ role: 'admin' });
  });

  it('searches the email and the display name, literally', async () => {
    await db.update(user).set({ displayName: '100% Bob' }).where(eq(user.id, bob.userId));
    const ids = async (search: string) =>
      (await call(admin, 'GET', `/users?search=${encodeURIComponent(search)}`))
        .json<AdminUserPage>()
        .items.map((item) => item.id);

    expect(await ids('ANN@')).toEqual([ann.userId]);
    expect(await ids('admi')).toEqual([admin.userId]);
    expect(await ids('0% b')).toEqual([bob.userId]);
    expect(await ids('%')).toEqual([bob.userId]);
    expect(await ids(' ')).toHaveLength(3);
  });

  it('pages with a cursor', async () => {
    const first = (await call(admin, 'GET', '/users?limit=2')).json<AdminUserPage>();
    expect(first.items.map((item) => item.id)).toEqual([bob.userId, ann.userId]);
    const second = (
      await call(admin, 'GET', `/users?limit=2&cursor=${first.nextCursor ?? ''}`)
    ).json<AdminUserPage>();
    expect(second.items.map((item) => item.id)).toEqual([admin.userId]);
    expect(second.nextCursor).toBeNull();
  });
});

describe('POST /admin/users/:id/status', () => {
  it('bans a user, which signs them out, and unbans them', async () => {
    const banned = await call(admin, 'POST', `/users/${ann.userId}/status`, { status: 'banned' });
    expect(banned.statusCode).toBe(200);
    expect(banned.json<AdminUserResponse>().user).toMatchObject({
      id: ann.userId,
      status: 'banned',
    });
    expect(await db.$count(session, eq(session.userId, ann.userId))).toBe(0);
    expect(
      (await app.inject({ url: '/api/v1/me', headers: { cookie: ann.cookie } })).statusCode,
    ).toBe(401);

    const unbanned = await call(admin, 'POST', `/users/${ann.userId}/status`, { status: 'active' });
    expect(unbanned.json<AdminUserResponse>().user.status).toBe('active');
  });

  it('refuses the own account, unknown users and bad statuses', async () => {
    expect(
      (await call(admin, 'POST', `/users/${admin.userId}/status`, { status: 'banned' })).statusCode,
    ).toBe(409);
    expect(
      (await call(admin, 'POST', `/users/${UNKNOWN_ID}/status`, { status: 'banned' })).statusCode,
    ).toBe(404);
    expect(
      (await call(admin, 'POST', `/users/${ann.userId}/status`, { status: 'gone' })).statusCode,
    ).toBe(400);
  });
});

describe('PATCH /admin/clans/:id', () => {
  it('renames a clan and hands it to another member', async () => {
    const clanId = await breakfastClub();

    const res = await call(admin, 'PATCH', `/clans/${clanId}`, {
      name: 'Brunch Club',
      description: '',
      ownerId: bob.userId,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<AdminClanResponse>().clan).toMatchObject({
      id: clanId,
      name: 'Brunch Club',
      description: null,
      memberCount: 2,
    });
    expect(await roleOf(bob.userId)).toBe('owner');
    expect(await roleOf(ann.userId)).toBe('officer');
  });

  it('keeps the Owner when ownerId is already the Owner', async () => {
    const clanId = await breakfastClub();
    const res = await call(admin, 'PATCH', `/clans/${clanId}`, { ownerId: ann.userId });
    expect(res.statusCode).toBe(200);
    expect(await roleOf(ann.userId)).toBe('owner');
  });

  it('refuses an owner from outside the clan, a taken name and an unknown clan', async () => {
    const clanId = await breakfastClub();
    await db.insert(clan).values({ name: 'Crumbs' });

    const outsider = await call(admin, 'PATCH', `/clans/${clanId}`, {
      name: 'Toasters',
      ownerId: admin.userId,
    });
    expect(outsider.statusCode).toBe(404);
    expect((await call(admin, 'PATCH', `/clans/${clanId}`, { name: 'crumbs' })).statusCode).toBe(
      409,
    );
    expect((await call(admin, 'PATCH', `/clans/${UNKNOWN_ID}`, { name: 'Nope' })).statusCode).toBe(
      404,
    );
    const [row] = await db.select().from(clan).where(eq(clan.id, clanId));
    expect(row?.name).toBe('Breakfast Club');
  });
});

describe('DELETE /admin/clans/:id', () => {
  it('deletes the clan, its memberships and pending requests', async () => {
    const clanId = await breakfastClub();
    const carl = await signUp('carl@example.com', 'Carl');
    await db.insert(clanJoinRequest).values({ clanId, userId: carl.userId });

    expect((await call(admin, 'DELETE', `/clans/${clanId}`)).statusCode).toBe(204);
    const [row] = await db.select().from(clan).where(eq(clan.id, clanId));
    expect(row?.deletedAt).not.toBeNull();
    expect(await db.$count(clanMembership, eq(clanMembership.clanId, clanId))).toBe(0);
    const [request] = await db.select().from(clanJoinRequest);
    expect(request).toMatchObject({ status: 'cancelled', decidedBy: admin.userId });

    expect((await call(admin, 'DELETE', `/clans/${clanId}`)).statusCode).toBe(404);
  });
});

describe('/admin/settings', () => {
  it('reads the defaults and changes single settings', async () => {
    const before = await call(admin, 'GET', '/settings');
    expect(before.json<AppSettingsResponse>()).toEqual({
      settings: { flagDailyThreshold: 8, clanMaxMembers: 10 },
    });

    const changed = await call(admin, 'PATCH', '/settings', { clanMaxMembers: 12 });
    expect(changed.statusCode).toBe(200);
    expect(changed.json<AppSettingsResponse>().settings).toEqual({
      flagDailyThreshold: 8,
      clanMaxMembers: 12,
    });
    const after = await call(admin, 'GET', '/settings');
    expect(after.json<AppSettingsResponse>().settings.clanMaxMembers).toBe(12);
  });

  it('refuses bad values and unknown keys', async () => {
    expect((await call(admin, 'PATCH', '/settings', { flagDailyThreshold: 0 })).statusCode).toBe(
      400,
    );
    expect((await call(admin, 'PATCH', '/settings', { maxClans: 3 })).statusCode).toBe(400);
  });
});

describe('GET /admin/metrics', () => {
  it('counts users, active users today, toasts per day and open flags', async () => {
    const today = localDate(new Date());
    const midday = (date: string) => new Date(`${date}T10:00:00Z`);
    await insertToasts(db, [
      { userId: ann.userId },
      { userId: ann.userId },
      { userId: bob.userId },
      { userId: bob.userId, status: 'rejected' },
      { userId: ann.userId, eatenAt: midday(addDays(today, -1)) },
      { userId: ann.userId, eatenAt: midday(addDays(today, -1)), deletedAt: new Date() },
      { userId: ann.userId, eatenAt: midday(addDays(today, -30)) },
    ]);
    await db.insert(flag).values([
      { type: 'count_threshold', subjectUserId: ann.userId, localDate: today },
      { type: 'count_threshold', subjectUserId: bob.userId, localDate: today, status: 'dismissed' },
    ]);

    const res = await call(admin, 'GET', '/metrics');
    expect(res.statusCode).toBe(200);
    const metrics = res.json<AdminMetrics>();
    expect(metrics).toMatchObject({ users: 3, dau: 2, openFlags: 1 });
    expect(metrics.toastsPerDay).toHaveLength(30);
    expect(metrics.toastsPerDay[0]).toEqual({ date: addDays(today, -29), count: 0 });
    expect(metrics.toastsPerDay.at(-2)).toEqual({ date: addDays(today, -1), count: 1 });
    expect(metrics.toastsPerDay.at(-1)).toEqual({ date: today, count: 3 });
    expect(metrics.toastsPerDay.reduce((sum, day) => sum + day.count, 0)).toBe(4);
  });
});

describe('POST /admin/toast-of-the-week/:weekStart/redraw', () => {
  it('draws the week again and records the admin', async () => {
    const lastWeek = previousWeekStart(localDate(new Date()));
    const [winner] = await insertToasts(db, [
      {
        userId: ann.userId,
        eatenAt: new Date(`${addDays(lastWeek, 2)}T10:00:00Z`),
        photoKey: 'toasts/ann/winner.webp',
      },
    ]);
    await db.insert(toastOfTheWeek).values({ weekStart: lastWeek, toastId: null });

    const res = await call(admin, 'POST', `/toast-of-the-week/${lastWeek}/redraw`);
    expect(res.statusCode).toBe(200);
    expect(res.json<ToastOfTheWeek>()).toMatchObject({
      weekStart: lastWeek,
      status: 'won',
      toast: { id: winner?.id, user: { id: ann.userId, displayName: 'Ann' } },
    });
    const [row] = await db.select().from(toastOfTheWeek);
    expect(row).toMatchObject({ toastId: winner?.id, drawnBy: admin.userId });
  });

  it('refuses a day that is not a Monday and a week that has not ended', async () => {
    const thisWeek = addDays(previousWeekStart(localDate(new Date())), 7);
    expect(
      (await call(admin, 'POST', `/toast-of-the-week/${addDays(thisWeek, -6)}/redraw`)).statusCode,
    ).toBe(400);
    expect((await call(admin, 'POST', `/toast-of-the-week/${thisWeek}/redraw`)).statusCode).toBe(
      409,
    );
    expect((await call(admin, 'POST', '/toast-of-the-week/monday/redraw')).statusCode).toBe(400);
  });
});
