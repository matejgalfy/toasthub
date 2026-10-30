import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { addDays, dayNumber, type HomeResponse, type LocalDate, localDate } from '@toasthub/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { insertToasts } from '../../../test/toasts';
import { type Database, DB } from '../../db/db.module';
import { clan, clanMembership, toastFact, user } from '../../db/schema';

let app: NestFastifyApplication;
let db: Database;
let ann: SignedIn;
let today: LocalDate;

beforeEach(async () => {
  app = await createTestApp();
  db = app.get<Database>(DB);
  ann = await signIn(app, 'ann@example.com');
  today = localDate(new Date());
});

afterEach(async () => {
  await app.close();
});

async function getHome(as: SignedIn): Promise<HomeResponse> {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/home',
    headers: { cookie: as.cookie },
  });
  expect(res.statusCode).toBe(200);
  return res.json<HomeResponse>();
}

/** Midday in Bratislava, `daysAgo` days before today. */
function dayAt(daysAgo: number): Date {
  return new Date(`${addDays(today, -daysAgo)}T10:00:00Z`);
}

type ToastInsert = Parameters<typeof insertToasts>[1][number];

async function addToasts(userId: string, daysAgo: number[], extra: Partial<ToastInsert> = {}) {
  await insertToasts(
    db,
    daysAgo.map((n) => ({ userId, eatenAt: dayAt(n), ...extra })),
  );
}

async function expectedFact(locale: 'sk' | 'en') {
  const facts = await db.select().from(toastFact).orderBy(toastFact.id);
  const fact = facts[dayNumber(today) % facts.length];
  return { id: fact?.id, text: locale === 'sk' ? fact?.textSk : fact?.textEn };
}

describe('GET /home', () => {
  it('requires a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/home' });
    expect(res.statusCode).toBe(401);
  });

  it('starts at zero for a new user', async () => {
    expect(await getHome(ann)).toEqual({
      todayCount: 0,
      streak: { current: 0, longest: 0 },
      clan: null,
      clanStreak: null,
      fact: await expectedFact('en'),
      toastOfTheWeek: null,
    });
  });

  it("shows the fact of the day in the user's locale", async () => {
    await db.update(user).set({ locale: 'sk' }).where(eq(user.id, ann.userId));
    expect((await getHome(ann)).fact).toEqual(await expectedFact('sk'));
  });

  it("counts today's toasts and the streak from countable toasts only", async () => {
    const bob = await signIn(app, 'bob@example.com');
    // An older run of 4 days, a gap, then yesterday and today.
    await addToasts(ann.userId, [10, 9, 8, 7, 1, 0, 0]);
    await addToasts(ann.userId, [0, 2], { deletedAt: new Date() });
    await addToasts(ann.userId, [0, 3], { status: 'rejected' });
    await addToasts(bob.userId, [0, 2, 3]);

    expect(await getHome(ann)).toMatchObject({
      todayCount: 2,
      streak: { current: 2, longest: 4 },
      clanStreak: null,
    });
  });

  it('keeps the streak alive while today has no toast yet', async () => {
    await addToasts(ann.userId, [3, 2, 1]);
    expect(await getHome(ann)).toMatchObject({
      todayCount: 0,
      streak: { current: 3, longest: 3 },
    });
  });

  it('shows the own clan and the streak of the toasts credited to it', async () => {
    const bob = await signIn(app, 'bob@example.com');
    const cyril = await signIn(app, 'cyril@example.com');
    const [breakfast, brunch] = await db
      .insert(clan)
      .values([{ name: 'Breakfast Club', avatarId: 4 }, { name: 'Brunch Club' }])
      .returning();
    if (!breakfast || !brunch) throw new Error('No clans');
    await db.insert(clanMembership).values([
      { userId: ann.userId, clanId: breakfast.id, role: 'owner' },
      { userId: bob.userId, clanId: breakfast.id, role: 'member' },
      { userId: cyril.userId, clanId: breakfast.id, role: 'member' },
    ]);

    await addToasts(ann.userId, [3], { clanId: breakfast.id });
    await addToasts(bob.userId, [1, 0], { clanId: breakfast.id });
    // Logged before joining or for another clan: not credited to this one (SPEC §12 D9).
    await addToasts(ann.userId, [2], { clanId: null });
    await addToasts(bob.userId, [2], { clanId: brunch.id });
    // Banned members' toasts stop counting.
    await addToasts(cyril.userId, [2], { clanId: breakfast.id });
    await db.update(user).set({ status: 'banned' }).where(eq(user.id, cyril.userId));

    const home = await getHome(ann);
    expect(home.clan).toEqual({ id: breakfast.id, name: 'Breakfast Club', avatarId: 4 });
    expect(home.clanStreak).toEqual({ current: 2, longest: 2 });
    expect(home.streak).toEqual({ current: 0, longest: 2 });
  });
});
