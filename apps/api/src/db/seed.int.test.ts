import { count } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { createDatabase } from './db.module';
import { clan, clanMembership, toast, user } from './schema';
import { seed } from './seed';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const db = createDatabase(pool);

afterAll(async () => {
  await pool.end();
});

async function counts() {
  const n = async (table: typeof user | typeof clan | typeof clanMembership | typeof toast) =>
    (await db.select({ n: count() }).from(table))[0]?.n;
  return {
    users: await n(user),
    clans: await n(clan),
    memberships: await n(clanMembership),
    toasts: await n(toast),
  };
}

describe('dev seed', () => {
  it('creates onboarded users, a clan with an owner and toasts', async () => {
    await seed(db);
    const after = await counts();
    expect(after).toMatchObject({ users: 5, clans: 1, memberships: 3 });
    expect(after.toasts).toBeGreaterThan(50);

    const users = await db.select().from(user);
    expect(users.every((u) => u.displayName !== '' && u.emailVerified)).toBe(true);
    const owners = await db.select().from(clanMembership);
    expect(owners.filter((m) => m.role === 'owner')).toHaveLength(1);
  });

  it('is idempotent', async () => {
    await seed(db);
    const first = await counts();
    await seed(db);
    expect(await counts()).toEqual(first);
  });
});
