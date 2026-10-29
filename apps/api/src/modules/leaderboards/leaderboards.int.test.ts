import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  addDays,
  type ClanLeaderboard,
  type ClanMemberLeaderboard,
  type DateRange,
  LEADERBOARD_SIZE,
  type LocalDate,
  localDate,
  monthRange,
  Period,
  periodRange,
  type UserLeaderboard,
  yearRange,
} from '@toasthub/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { insertToasts } from '../../../test/toasts';
import { type Database, DB } from '../../db/db.module';
import { clan, clanMembership, user } from '../../db/schema';

let app: NestFastifyApplication;
let db: Database;
let ann: SignedIn;
let today: LocalDate;

const UNKNOWN_ID = '01890a5d-ac96-774b-bcce-b302099a8057';

beforeEach(async () => {
  app = await createTestApp();
  db = app.get<Database>(DB);
  today = localDate(new Date());
  ann = await signIn(app, 'ann@example.com');
  await db.update(user).set({ displayName: 'Ann', avatarId: 1 }).where(eq(user.id, ann.userId));
});

afterEach(async () => {
  await app.close();
});

/** A user who never signs in; `displayName: ''` is one who hasn't finished onboarding. */
async function addUser(
  displayName: string,
  extra: Partial<typeof user.$inferInsert> = {},
): Promise<string> {
  const [row] = await db
    .insert(user)
    .values({
      email: `${displayName || 'nobody'}-${crypto.randomUUID()}@example.com`,
      displayName,
      ...extra,
    })
    .returning({ id: user.id });
  if (!row) throw new Error('No user');
  return row.id;
}

async function addClan(name: string, ...memberIds: string[]): Promise<string> {
  const [row] = await db.insert(clan).values({ name }).returning({ id: clan.id });
  if (!row) throw new Error('No clan');
  if (memberIds.length > 0) {
    await db.insert(clanMembership).values(
      memberIds.map((userId, i) => ({
        userId,
        clanId: row.id,
        role: i === 0 ? ('owner' as const) : ('member' as const),
      })),
    );
  }
  return row.id;
}

/** `count` toasts on `date` (midday in Bratislava), each in its own session. */
async function addToasts(
  userId: string,
  count: number,
  date: LocalDate = today,
  extra: { clanId?: string; status?: 'rejected'; deletedAt?: Date } = {},
) {
  await insertToasts(
    db,
    Array.from({ length: count }, () => ({
      userId,
      eatenAt: new Date(`${date}T10:00:00Z`),
      ...extra,
    })),
  );
}

async function getOk<T>(url: string, as: SignedIn = ann): Promise<T> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1${url}`,
    headers: { cookie: as.cookie },
  });
  expect(res.statusCode).toBe(200);
  return res.json<T>();
}

function inRange(date: LocalDate, { start, end }: DateRange): boolean {
  return date >= start && date < end;
}

/**
 * Toasts on days around the period boundaries, a different power of two per day, so any sum of days is
 * unique. Which of them a period covers depends on today, so `spreadCount()` works it out the same way.
 */
function spreadDays(): [LocalDate, number][] {
  const monthStart = monthRange(today).start;
  return [
    [today, 1],
    [addDays(today, -7), 2],
    [monthStart, 4],
    [addDays(monthStart, -1), 8],
    [addDays(yearRange(today).start, -1), 16],
  ];
}

async function addSpread(userId: string, clanId?: string) {
  for (const [date, count] of spreadDays()) await addToasts(userId, count, date, { clanId });
}

function spreadCount(period: Period): number {
  const range = periodRange(period, today);
  return spreadDays().reduce((sum, [date, count]) => sum + (inRange(date, range) ? count : 0), 0);
}

describe('GET /leaderboards/users', () => {
  it('ranks by count with shared ranks for ties and lists every visibility', async () => {
    const bob = await addUser('Bob', { profileVisibility: 'clan' });
    const cyril = await addUser('Cyril');
    const dana = await addUser('Dana');
    await addToasts(bob, 3);
    await addToasts(cyril, 3);
    await addToasts(dana, 2);
    await addToasts(ann.userId, 1);

    const board = await getOk<UserLeaderboard>('/leaderboards/users');

    expect(board.items.map((r) => [r.rank, r.user.displayName, r.count])).toEqual([
      [1, 'Bob', 3],
      [1, 'Cyril', 3],
      [3, 'Dana', 2],
      [4, 'Ann', 1],
    ]);
    expect(board.items[3]).toEqual({
      rank: 4,
      user: { id: ann.userId, displayName: 'Ann', avatarId: 1 },
      count: 1,
    });
    expect(board.me).toEqual(board.items[3]);
    // Never the email.
    expect(JSON.stringify(board)).not.toContain('@example.com');
  });

  it('leaves out deleted and rejected toasts, banned and not onboarded users', async () => {
    const banned = await addUser('Banned', { status: 'banned' });
    const newcomer = await addUser('');
    await addToasts(banned, 5);
    await addToasts(newcomer, 5);
    await addToasts(ann.userId, 2);
    await addToasts(ann.userId, 3, today, { status: 'rejected' });
    await addToasts(ann.userId, 4, today, { deletedAt: new Date() });

    const board = await getOk<UserLeaderboard>('/leaderboards/users');

    expect(board.items.map((r) => [r.user.displayName, r.count])).toEqual([['Ann', 2]]);
  });

  it.each([Period.week, Period.month, Period.year])(
    'counts only the days of this %s',
    async (period) => {
      await addSpread(ann.userId);

      const board = await getOk<UserLeaderboard>(`/leaderboards/users?period=${period}`);

      expect(board.me?.count).toBe(spreadCount(period));
    },
  );

  it('defaults to this week', async () => {
    await addSpread(ann.userId);

    const board = await getOk<UserLeaderboard>('/leaderboards/users');

    expect(board.me?.count).toBe(spreadCount(Period.week));
  });

  it('lists the top 50 and gives the caller their own row with its true rank', async () => {
    const others = await Promise.all(
      Array.from({ length: LEADERBOARD_SIZE + 1 }, (_, i) =>
        addUser(`User ${String(i).padStart(2, '0')}`),
      ),
    );
    await insertToasts(
      db,
      others.flatMap((userId) =>
        [0, 1].map(() => ({ userId, eatenAt: new Date(`${today}T10:00:00Z`) })),
      ),
    );
    await addToasts(ann.userId, 1);

    const board = await getOk<UserLeaderboard>('/leaderboards/users');

    expect(board.items).toHaveLength(LEADERBOARD_SIZE);
    expect(board.items.every((r) => r.rank === 1 && r.user.id !== ann.userId)).toBe(true);
    expect(board.me).toMatchObject({ rank: LEADERBOARD_SIZE + 2, count: 1 });
  });

  it('has no row for a caller without toasts in the period', async () => {
    const bob = await addUser('Bob');
    await addToasts(bob, 1);

    const board = await getOk<UserLeaderboard>('/leaderboards/users');

    expect(board.items).toHaveLength(1);
    expect(board.me).toBeNull();
  });

  it('answers 400 for an unknown period and 401 without a session', async () => {
    const bad = await app.inject({
      method: 'GET',
      url: '/api/v1/leaderboards/users?period=day',
      headers: { cookie: ann.cookie },
    });
    expect(bad.statusCode).toBe(400);
    const anonymous = await app.inject({ method: 'GET', url: '/api/v1/leaderboards/users' });
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('GET /leaderboards/clans', () => {
  it('ranks clans by the toasts credited to them when logged, with their current streak', async () => {
    const bob = await addUser('Bob');
    const rye = await addClan('Rye', ann.userId);
    const spelt = await addClan('Spelt', bob);
    const left = await addClan('Left behind');
    // Bob logged these for "Left behind" before moving to Spelt: they stay with it (D9).
    await addToasts(bob, 3, today, { clanId: left });
    await addToasts(bob, 1, today, { clanId: spelt });
    await addToasts(bob, 1, addDays(today, -1), { clanId: spelt });
    await addToasts(ann.userId, 2, today, { clanId: rye });
    // Toasts outside a clan count for nobody.
    await addToasts(ann.userId, 9);

    const board = await getOk<ClanLeaderboard>('/leaderboards/clans?period=year');

    expect(board.items.map((r) => [r.rank, r.clan.name, r.count])).toEqual([
      [1, 'Left behind', 3],
      [2, 'Rye', 2],
      [2, 'Spelt', 2],
    ]);
    const streaks = Object.fromEntries(board.items.map((r) => [r.clan.name, r.currentStreak]));
    expect(streaks).toEqual({ 'Left behind': 1, Rye: 1, Spelt: 2 });
    expect(board.myClan).toEqual({
      rank: 2,
      clan: { id: rye, name: 'Rye' },
      count: 2,
      currentStreak: 1,
    });
  });

  it('defaults to this month and leaves out deleted clans', async () => {
    const rye = await addClan('Rye', ann.userId);
    const gone = await addClan('Gone');
    await db.update(clan).set({ deletedAt: new Date() }).where(eq(clan.id, gone));
    await addSpread(ann.userId, rye);
    await addToasts(ann.userId, 5, today, { clanId: gone });

    const board = await getOk<ClanLeaderboard>('/leaderboards/clans');

    expect(board.items.map((r) => [r.clan.name, r.count])).toEqual([
      ['Rye', spreadCount(Period.month)],
    ]);
  });

  it('gives the caller their clan below the top and nothing outside a clan', async () => {
    const owners = await Promise.all(
      Array.from({ length: LEADERBOARD_SIZE }, (_, i) => addUser(`Owner ${String(i)}`)),
    );
    const clanIds = await Promise.all(owners.map((id, i) => addClan(`Clan ${String(i)}`, id)));
    await insertToasts(
      db,
      owners.flatMap((userId, i) =>
        [0, 1].map(() => ({ userId, clanId: clanIds[i], eatenAt: new Date(`${today}T10:00:00Z`) })),
      ),
    );
    const rye = await addClan('Rye', ann.userId);
    await addToasts(ann.userId, 1, today, { clanId: rye });

    const board = await getOk<ClanLeaderboard>('/leaderboards/clans');
    expect(board.items).toHaveLength(LEADERBOARD_SIZE);
    expect(board.myClan).toMatchObject({ rank: LEADERBOARD_SIZE + 1, count: 1, currentStreak: 1 });

    await db.delete(clanMembership).where(eq(clanMembership.userId, ann.userId));
    const outside = await getOk<ClanLeaderboard>('/leaderboards/clans');
    expect(outside.myClan).toBeNull();
  });
});

describe('GET /clans/:id/leaderboard', () => {
  it('ranks every current member by toasts logged for this clan, also non-members may look', async () => {
    const bob = await addUser('Bob');
    const cyril = await addUser('Cyril');
    const banned = await addUser('Banned', { status: 'banned' });
    const rye = await addClan('Rye', bob, cyril, banned);
    const spelt = await addClan('Spelt');
    const former = await addUser('Former');
    await addToasts(bob, 2, today, { clanId: rye });
    // Logged for another clan, or by someone who has since left: not this board.
    await addToasts(cyril, 4, today, { clanId: spelt });
    await addToasts(former, 6, today, { clanId: rye });
    await addToasts(banned, 3, today, { clanId: rye });

    const board = await getOk<ClanMemberLeaderboard>(`/clans/${rye}/leaderboard`);

    expect(board.items.map((r) => [r.rank, r.user.displayName, r.count])).toEqual([
      [1, 'Bob', 2],
      [2, 'Cyril', 0],
    ]);
  });

  it.each([
    ['', Period.month],
    ['?period=week', Period.week],
    ['?period=year', Period.year],
  ])('counts the period of "%s" (this %s)', async (query, period) => {
    const rye = await addClan('Rye', ann.userId);
    await addSpread(ann.userId, rye);

    const board = await getOk<ClanMemberLeaderboard>(`/clans/${rye}/leaderboard${query}`);

    expect(board.items[0]?.count).toBe(spreadCount(period));
  });

  it('answers 404 for an unknown or deleted clan', async () => {
    const gone = await addClan('Gone', ann.userId);
    await db.update(clan).set({ deletedAt: new Date() }).where(eq(clan.id, gone));
    for (const id of [UNKNOWN_ID, gone]) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/clans/${id}/leaderboard`,
        headers: { cookie: ann.cookie },
      });
      expect(res.statusCode).toBe(404);
    }
  });
});
