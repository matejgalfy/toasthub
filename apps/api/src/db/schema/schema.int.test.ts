import { localDate } from '@toasthub/shared';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createDatabase, type Database } from '../db.module';
import {
  clan,
  clanJoinRequest,
  clanMembership,
  flag,
  toast,
  toastOfTheWeek,
  user,
  userAchievement,
} from './index';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const db: Database = createDatabase(pool);

afterAll(async () => {
  await pool.end();
});

let annId: string;
let bobId: string;
let clanId: string;

async function createUser(email: string): Promise<string> {
  const [row] = await db.insert(user).values({ email, displayName: '' }).returning({ id: user.id });
  if (!row) throw new Error('insert failed');
  return row.id;
}

async function createClan(name: string): Promise<string> {
  const [row] = await db.insert(clan).values({ name }).returning({ id: clan.id });
  if (!row) throw new Error('insert failed');
  return row.id;
}

/** The Postgres error code (e.g. 23505 unique_violation) of a failed query. */
async function pgCode(query: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await query;
    return undefined;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? (error as { code?: string }).code;
  }
}

const UNIQUE = '23505';
const CHECK = '23514';

beforeEach(async () => {
  annId = await createUser('ann@example.com');
  bobId = await createUser('bob@example.com');
  clanId = await createClan('Crumbs');
});

describe('toast.local_date', () => {
  it.each([
    '2026-03-28T22:59:59Z',
    '2026-03-28T23:00:00Z',
    '2026-07-01T21:59:59Z',
    '2026-07-01T22:00:00Z',
    '2026-10-24T22:00:00Z',
    '2026-10-25T22:59:59Z',
    '2026-10-25T23:00:00Z',
    '2026-12-31T23:30:00Z',
  ])('for eaten_at %s matches localDate()', async (iso) => {
    const eatenAt = new Date(iso);
    const [row] = await db
      .insert(toast)
      .values({ userId: annId, eatenAt })
      .returning({ localDate: toast.localDate });
    expect(row?.localDate).toBe(localDate(eatenAt));
  });

  it('defaults to an active, uuid v7 toast eaten now', async () => {
    const [row] = await db.insert(toast).values({ userId: annId }).returning();
    expect(row).toMatchObject({ status: 'active', deletedAt: null, clanId: null });
    expect(row?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(row?.localDate).toBe(localDate(new Date()));
  });
});

describe('clan', () => {
  it('names are unique regardless of case', async () => {
    expect(await pgCode(db.insert(clan).values({ name: 'CRUMBS' }))).toBe(UNIQUE);
  });

  it('a deleted clan frees its name', async () => {
    await db.update(clan).set({ deletedAt: new Date() }).where(eq(clan.id, clanId));
    expect(await pgCode(db.insert(clan).values({ name: 'crumbs' }))).toBeUndefined();
  });

  it('has one owner at most', async () => {
    await db.insert(clanMembership).values({ userId: annId, clanId, role: 'owner' });
    expect(
      await pgCode(db.insert(clanMembership).values({ userId: bobId, clanId, role: 'owner' })),
    ).toBe(UNIQUE);
    expect(
      await pgCode(db.insert(clanMembership).values({ userId: bobId, clanId, role: 'officer' })),
    ).toBeUndefined();
  });

  it('a user is in one clan at most', async () => {
    const otherId = await createClan('Crusts');
    await db.insert(clanMembership).values({ userId: annId, clanId, role: 'member' });
    expect(
      await pgCode(
        db.insert(clanMembership).values({ userId: annId, clanId: otherId, role: 'owner' }),
      ),
    ).toBe(UNIQUE);
  });

  it('a user has one pending join request at most', async () => {
    const otherId = await createClan('Crusts');
    await db.insert(clanJoinRequest).values({ userId: annId, clanId });
    expect(
      await pgCode(db.insert(clanJoinRequest).values({ userId: annId, clanId: otherId })),
    ).toBe(UNIQUE);

    await db
      .update(clanJoinRequest)
      .set({ status: 'cancelled' })
      .where(eq(clanJoinRequest.userId, annId));
    expect(
      await pgCode(db.insert(clanJoinRequest).values({ userId: annId, clanId: otherId })),
    ).toBeUndefined();
  });
});

describe('flag', () => {
  const countFlag = () => ({
    type: 'count_threshold' as const,
    subjectUserId: annId,
    localDate: '2026-10-29',
  });

  it('allows one count flag per user and day, so ON CONFLICT DO NOTHING inserts once', async () => {
    await db.insert(flag).values(countFlag()).onConflictDoNothing();
    await db.insert(flag).values(countFlag()).onConflictDoNothing();
    expect(await db.select().from(flag)).toHaveLength(1);
    await db.insert(flag).values({ ...countFlag(), localDate: '2026-10-30' });
    expect(await db.select().from(flag)).toHaveLength(2);
  });

  it('allows several photo reports on the same user', async () => {
    const [t] = await db.insert(toast).values({ userId: annId, photoKey: 'k' }).returning();
    const report = {
      type: 'photo_report' as const,
      subjectUserId: annId,
      toastId: t?.id,
      reporterId: bobId,
    };
    await db.insert(flag).values([report, report]);
    expect(await db.select().from(flag)).toHaveLength(2);
  });

  it('needs a date on count flags and a toast on photo reports', async () => {
    expect(
      await pgCode(db.insert(flag).values({ type: 'count_threshold', subjectUserId: annId })),
    ).toBe(CHECK);
    expect(
      await pgCode(db.insert(flag).values({ type: 'photo_report', subjectUserId: annId })),
    ).toBe(CHECK);
  });
});

describe('user_achievement', () => {
  it('accepts only codes from shared', async () => {
    expect(
      await pgCode(
        db.insert(userAchievement).values({ userId: annId, achievementCode: 'first_bite' }),
      ),
    ).toBeUndefined();
    expect(
      await pgCode(
        db.insert(userAchievement).values({ userId: annId, achievementCode: 'speedrun' }),
      ),
    ).toBe(CHECK);
  });

  it('is earned once per user', async () => {
    await db.insert(userAchievement).values({ userId: annId, achievementCode: 'first_bite' });
    expect(
      await pgCode(
        db.insert(userAchievement).values({ userId: annId, achievementCode: 'first_bite' }),
      ),
    ).toBe(UNIQUE);
  });
});

describe('toast_of_the_week', () => {
  it('starts on a Monday', async () => {
    expect(
      await pgCode(db.insert(toastOfTheWeek).values({ weekStart: '2026-10-26' })),
    ).toBeUndefined();
    expect(await pgCode(db.insert(toastOfTheWeek).values({ weekStart: '2026-10-27' }))).toBe(CHECK);
  });
});
