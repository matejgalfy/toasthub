import { TIME_ZONE, ToastStatus } from '@toasthub/shared';
import { sql } from 'drizzle-orm';
import { check, date, index, pgEnum, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { clan } from './clans';
import { createdAt, enumValues, id, timestamptz } from './columns';

export const toastStatusEnum = pgEnum('toast_status', enumValues(ToastStatus));

export const toast = pgTable(
  'toast',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // The clan at logging time; leaving later doesn't move the toast (SPEC §12 D9).
    clanId: uuid().references(() => clan.id, { onDelete: 'set null' }),
    eatenAt: timestamptz().defaultNow().notNull(),
    // Derived by Postgres so it can never disagree with `eaten_at` (SPEC §12 D29).
    localDate: date()
      .generatedAlwaysAs(sql.raw(`(eaten_at AT TIME ZONE '${TIME_ZONE}')::date`))
      .notNull(),
    photoKey: text(),
    photoHiddenAt: timestamptz(),
    status: toastStatusEnum().default(ToastStatus.active).notNull(),
    deletedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    index('toast_user_id_local_date_idx').on(t.userId, t.localDate),
    index('toast_clan_id_local_date_idx').on(t.clanId, t.localDate),
    // Toast of the week candidates.
    index('toast_photo_local_date_idx')
      .on(t.localDate)
      .where(sql`${t.photoKey} IS NOT NULL`),
  ],
);

export const like = pgTable(
  'like',
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    toastId: uuid()
      .notNull()
      .references(() => toast.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  // Toast first, so like counts per toast use the PK index.
  (t) => [primaryKey({ columns: [t.toastId, t.userId] })],
);

export const toastOfTheWeek = pgTable(
  'toast_of_the_week',
  {
    weekStart: date().primaryKey(),
    // Null when no toast was eligible.
    toastId: uuid().references(() => toast.id, { onDelete: 'set null' }),
    drawnAt: timestamptz().defaultNow().notNull(),
    // Null when the scheduled job drew it; an admin on a redraw.
    drawnBy: uuid().references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [check('toast_of_the_week_monday', sql`extract(isodow from ${t.weekStart}) = 1`)],
);
