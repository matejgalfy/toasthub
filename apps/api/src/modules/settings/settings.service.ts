import { Inject, Injectable } from '@nestjs/common';
import {
  APP_SETTING_DEFAULTS,
  type AppSettingKey,
  type AppSettings,
  appSettingsSchema,
} from '@toasthub/shared';
import { eq, sql } from 'drizzle-orm';

import { AppError } from '../../common/errors/app-error';
import { type Database, DB, type DbExecutor } from '../../db/db.module';
import { appSetting } from '../../db/schema';

/** `app_setting.key` for each setting (SPEC §7). */
export const SETTING_DB_KEYS = {
  flagDailyThreshold: 'flag_daily_threshold',
  clanMaxMembers: 'clan_max_members',
} as const satisfies Record<AppSettingKey, string>;

const settingKeys = Object.keys(SETTING_DB_KEYS) as AppSettingKey[];

/**
 * Typed access to the admin-editable settings. A missing row reads as its default from `shared`, so the
 * app works on an empty table. A stored value that fails its schema is a bug, so it throws (500).
 */
@Injectable()
export class SettingsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get<K extends AppSettingKey>(key: K, db: DbExecutor = this.db): Promise<AppSettings[K]> {
    const [row] = await db
      .select({ value: appSetting.value })
      .from(appSetting)
      .where(eq(appSetting.key, SETTING_DB_KEYS[key]));
    if (!row) return APP_SETTING_DEFAULTS[key];
    return appSettingsSchema.shape[key].parse(row.value);
  }

  async getAll(db: DbExecutor = this.db): Promise<AppSettings> {
    const rows = await db.select().from(appSetting);
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    const values: Record<string, unknown> = {};
    for (const key of settingKeys) {
      values[key] = stored.get(SETTING_DB_KEYS[key]) ?? APP_SETTING_DEFAULTS[key];
    }
    return appSettingsSchema.parse(values);
  }

  /** Validates and stores the given settings (400 on a bad value) and returns all settings. */
  async set(patch: Partial<AppSettings>, db: DbExecutor = this.db): Promise<AppSettings> {
    const parsed = appSettingsSchema.partial().strict().safeParse(patch);
    if (!parsed.success) throw AppError.validation(parsed.error);

    const entries = settingKeys.flatMap((key) => {
      const value = parsed.data[key];
      return value === undefined ? [] : [{ key: SETTING_DB_KEYS[key], value }];
    });
    if (entries.length > 0) {
      await db
        .insert(appSetting)
        .values(entries)
        .onConflictDoUpdate({ target: appSetting.key, set: { value: sql`excluded.value` } });
    }
    return this.getAll(db);
  }
}
