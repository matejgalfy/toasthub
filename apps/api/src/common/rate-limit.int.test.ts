import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { createDatabase } from '../db/db.module';
import { consumeRateLimit, type RateLimitRule } from './rate-limit';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const db = createDatabase(pool);

afterAll(async () => {
  await pool.end();
});

const MINUTE = 60;
const rule = (max: number): RateLimitRule => ({ window: MINUTE, max });

async function allowed(key: string, max: number, now: number, cost = 1): Promise<boolean> {
  return (await consumeRateLimit(db, key, rule(max), { cost, now })).allowed;
}

describe('consumeRateLimit', () => {
  it('allows up to the limit within the window', async () => {
    const results = [];
    for (const at of [0, 1, 2, 3]) results.push(await allowed('ann', 3, at));
    expect(results).toEqual([true, true, true, false]);
  });

  it('counts keys separately', async () => {
    expect(await allowed('ann', 1, 0)).toBe(true);
    expect(await allowed('bob', 1, 0)).toBe(true);
    expect(await allowed('ann', 1, 1)).toBe(false);
  });

  it('starts a new window once the first hit is a window old', async () => {
    await allowed('ann', 2, 0);
    await allowed('ann', 2, 30_000);
    expect(await allowed('ann', 2, 59_999)).toBe(false);
    expect(await allowed('ann', 2, 60_000)).toBe(true);
    expect(await allowed('ann', 2, 60_001)).toBe(true);
    expect(await allowed('ann', 2, 60_002)).toBe(false);
  });

  it('does not record refused hits', async () => {
    await allowed('ann', 2, 0);
    expect(await allowed('ann', 2, 1, 2)).toBe(false);
    expect(await allowed('ann', 2, 2)).toBe(true);
  });

  it('takes several hits at once or none of them', async () => {
    expect(await allowed('ann', 5, 0, 3)).toBe(true);
    expect(await allowed('ann', 5, 1, 3)).toBe(false);
    expect(await allowed('ann', 5, 2, 2)).toBe(true);
    expect(await allowed('ann', 5, 3)).toBe(false);
    expect(await allowed('ann', 5, 60_000, 3)).toBe(true);
    expect(await allowed('bob', 2, 0, 3)).toBe(false);
  });

  it('says when the window ends', async () => {
    await consumeRateLimit(db, 'ann', rule(1), { now: 0 });
    expect(await consumeRateLimit(db, 'ann', rule(1), { now: 45_500 })).toEqual({
      allowed: false,
      retryAfter: 15,
    });
  });

  it('holds across concurrent requests, as from several api replicas', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consumeRateLimit(db, 'ann', rule(5), { now: 0 })),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
  });
});
