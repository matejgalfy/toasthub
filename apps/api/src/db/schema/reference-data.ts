import { jsonb, pgTable, serial, text } from 'drizzle-orm/pg-core';

import { createdAt } from './columns';

// Both tables are filled by the `seed_reference_data` migration, so every environment has them.

/** The id is the rotation order of the fact of the day (SPEC §4.11). */
export const toastFact = pgTable('toast_fact', {
  id: serial().primaryKey(),
  textSk: text().notNull(),
  textEn: text().notNull(),
  createdAt: createdAt(),
});

/** Read and written only through `SettingsService`, which validates `value` per key. */
export const appSetting = pgTable('app_setting', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  createdAt: createdAt(),
});
