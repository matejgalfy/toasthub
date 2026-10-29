import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { APP_SETTING_DEFAULTS } from '@toasthub/shared';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { SETTING_DB_KEYS } from '../modules/settings/settings.service';
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

describe('on an empty database', () => {
  // The shared test database is truncated before each test, so check the seeded rows on a fresh one.
  it('applies cleanly and seeds the reference data', async () => {
    const name = `fresh_${String(Date.now())}`;
    await pool.query(`CREATE DATABASE ${name}`);
    const url = new URL(process.env.DATABASE_URL ?? '');
    url.pathname = `/${name}`;
    const fresh = new Pool({ connectionString: url.toString(), max: 1 });
    try {
      await runMigrations(url.toString());

      const settings = await fresh.query<{ key: string; value: unknown }>(
        'select key, value from app_setting order by key',
      );
      const expected = Object.entries(SETTING_DB_KEYS).map(([key, dbKey]) => ({
        key: dbKey,
        value: APP_SETTING_DEFAULTS[key as keyof typeof SETTING_DB_KEYS],
      }));
      expect(settings.rows).toEqual(expect.arrayContaining(expected));
      expect(settings.rows).toHaveLength(expected.length);

      const facts = await fresh.query<{ id: number; text_sk: string; text_en: string }>(
        'select id, text_sk, text_en from toast_fact order by id',
      );
      expect(facts.rows.length).toBeGreaterThanOrEqual(10);
      expect(facts.rows[0]?.id).toBe(1);
      for (const fact of facts.rows) {
        expect(fact.text_sk).not.toBe('');
        expect(fact.text_en).not.toBe('');
      }
    } finally {
      await fresh.end();
      await pool.query(`DROP DATABASE ${name}`);
    }
  });
});
