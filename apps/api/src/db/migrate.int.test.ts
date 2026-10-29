import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { MIGRATIONS_FOLDER, runMigrations } from './migrate';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

afterAll(async () => {
  await pool.end();
});

async function appliedCount(): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    'select count(*)::int as n from drizzle.__drizzle_migrations',
  );
  return rows[0]?.n ?? 0;
}

describe('runMigrations', () => {
  it('has applied every journal entry (global setup ran it once)', async () => {
    const journal = JSON.parse(
      await readFile(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: unknown[] };
    expect(await appliedCount()).toBe(journal.entries.length);
  });

  it('is idempotent', async () => {
    const before = await appliedCount();
    await runMigrations(process.env.DATABASE_URL ?? '');
    expect(await appliedCount()).toBe(before);
  });
});
