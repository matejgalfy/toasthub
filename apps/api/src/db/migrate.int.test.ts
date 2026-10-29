import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

interface Journal {
  entries: { tag: string }[];
}

async function readJournal(folder: string): Promise<Journal> {
  return JSON.parse(await readFile(path.join(folder, 'meta', '_journal.json'), 'utf8')) as Journal;
}

async function appliedCount(): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    'select count(*)::int as n from drizzle.__drizzle_migrations',
  );
  return rows[0]?.n ?? 0;
}

/**
 * Runs `test` against a new, empty database. The shared test database is truncated before each test,
 * so migrations that seed or move rows are checked on a fresh one.
 */
async function withFreshDatabase(test: (url: string, db: Pool) => Promise<void>): Promise<void> {
  const name = `fresh_${String(Date.now())}`;
  await pool.query(`CREATE DATABASE ${name}`);
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/${name}`;
  const fresh = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    await test(url.toString(), fresh);
  } finally {
    await fresh.end();
    await pool.query(`DROP DATABASE ${name}`);
  }
}

/** A copy of the migrations folder whose journal stops before the migration tagged `tag`. */
async function migrationsBefore(tag: string): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), 'toasthub-migrations-'));
  await cp(MIGRATIONS_FOLDER, folder, { recursive: true });
  const journal = await readJournal(folder);
  const end = journal.entries.findIndex((entry) => entry.tag === tag);
  expect(end).toBeGreaterThan(0);
  await writeFile(
    path.join(folder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, end) }),
  );
  return folder;
}

describe('runMigrations', () => {
  it('has applied every journal entry (global setup ran it once)', async () => {
    expect(await appliedCount()).toBe((await readJournal(MIGRATIONS_FOLDER)).entries.length);
  });

  it('is idempotent', async () => {
    const before = await appliedCount();
    await runMigrations(process.env.DATABASE_URL ?? '');
    expect(await appliedCount()).toBe(before);
  });
});

describe('on an empty database', () => {
  it('applies cleanly and seeds the reference data', async () => {
    await withFreshDatabase(async (url, fresh) => {
      await runMigrations(url);

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
    });
  });
});

describe('0005_toast_sessions', () => {
  it('gives every existing toast its own session on the same day', async () => {
    const before = await migrationsBefore('0005_toast_sessions');
    try {
      await withFreshDatabase(async (url, fresh) => {
        await runMigrations(url, before);
        const { rows: users } = await fresh.query<{ id: string }>(
          `insert into "user" (email, display_name) values ('ann@example.com', 'Ann') returning id`,
        );
        // Half past midnight in Bratislava, still the day before in UTC; one toast is deleted.
        await fresh.query(
          `insert into toast (user_id, eaten_at, deleted_at) values
             ($1, '2026-10-28T23:30:00Z', null),
             ($1, '2026-10-28T23:30:00Z', '2026-10-29T08:00:00Z'),
             ($1, '2026-10-20T10:00:00Z', null)`,
          [users[0]?.id],
        );

        await runMigrations(url);

        const { rows } = await fresh.query<{
          sameId: boolean;
          sameUser: boolean;
          sameDay: boolean;
          sameDeleted: boolean;
          localDate: string;
        }>(
          `select t.session_id = t.id as "sameId", s.user_id = t.user_id as "sameUser",
                  s.local_date = t.local_date as "sameDay",
                  s.deleted_at is not distinct from t.deleted_at as "sameDeleted",
                  s.local_date::text as "localDate"
           from toast t join toast_session s on s.id = t.session_id order by t.eaten_at, t.id`,
        );
        expect(rows).toHaveLength(3);
        expect(rows.every((r) => r.sameId && r.sameUser && r.sameDay && r.sameDeleted)).toBe(true);
        expect(rows.map((r) => r.localDate)).toEqual(['2026-10-20', '2026-10-29', '2026-10-29']);
        const { rows: sessions } = await fresh.query('select id from toast_session');
        expect(sessions).toHaveLength(3);
      });
    } finally {
      await rm(before, { recursive: true, force: true });
    }
  });
});
