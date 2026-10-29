import { APP_SETTING_DEFAULTS, type AppSettings } from '@toasthub/shared';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AppError } from '../../common/errors/app-error';
import { createDatabase, type Database } from '../../db/db.module';
import { appSetting } from '../../db/schema';
import { SettingsService } from './settings.service';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
let db: Database;
let settings: SettingsService;

beforeEach(() => {
  db = createDatabase(pool);
  settings = new SettingsService(db);
});

afterAll(async () => {
  await pool.end();
});

describe('SettingsService', () => {
  it('reads the defaults when no row is stored', async () => {
    expect(await settings.get('flagDailyThreshold')).toBe(8);
    expect(await settings.get('clanMaxMembers')).toBe(10);
    expect(await settings.getAll()).toEqual(APP_SETTING_DEFAULTS);
  });

  it('stores and reads a value', async () => {
    expect(await settings.set({ flagDailyThreshold: 12 })).toEqual({
      ...APP_SETTING_DEFAULTS,
      flagDailyThreshold: 12,
    });
    expect(await settings.get('flagDailyThreshold')).toBe(12);

    await settings.set({ flagDailyThreshold: 5, clanMaxMembers: 20 });
    expect(await settings.getAll()).toEqual({ flagDailyThreshold: 5, clanMaxMembers: 20 });
  });

  it('writes the SPEC key names', async () => {
    await settings.set({ clanMaxMembers: 15 });
    expect(
      await db.select({ key: appSetting.key, value: appSetting.value }).from(appSetting),
    ).toEqual([{ key: 'clan_max_members', value: 15 }]);
  });

  it.each<[string, Record<string, unknown>]>([
    ['zero', { flagDailyThreshold: 0 }],
    ['a fraction', { clanMaxMembers: 2.5 }],
    ['a string', { clanMaxMembers: '10' }],
    ['an unknown key', { maxToastsPerDay: 3 }],
  ])('rejects %s with VALIDATION_ERROR and stores nothing', async (_, patch) => {
    const error = await settings.set(patch as Partial<AppSettings>).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await db.select().from(appSetting)).toEqual([]);
  });

  it('throws on a corrupt stored value instead of guessing', async () => {
    await db.insert(appSetting).values({ key: 'flag_daily_threshold', value: 'eight' });
    await expect(settings.get('flagDailyThreshold')).rejects.toThrow();
    await expect(settings.getAll()).rejects.toThrow();
  });

  it('runs inside a caller transaction', async () => {
    await db
      .transaction(async (tx) => {
        await settings.set({ clanMaxMembers: 30 }, tx);
        expect(await settings.get('clanMaxMembers', tx)).toBe(30);
        tx.rollback();
      })
      .catch(() => undefined);
    expect(await settings.get('clanMaxMembers')).toBe(10);
  });
});
