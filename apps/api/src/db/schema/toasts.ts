import { TIME_ZONE, ToastStatus } from '@toasthub/shared';
import { sql } from 'drizzle-orm';
import { check, date, index, pgEnum, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { clan } from './clans';
import { createdAt, enumValues, id, timestamptz } from './columns';

export const toastStatusEnum = pgEnum('toast_status', enumValues(ToastStatus));

// One log of 1–10 toasts eaten in one sitting (SPEC §4.3 BR-TOAST-5). Not named `session`, which is Better
// Auth's table.
export const toastSession = pgTable(
  'toast_session',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // The only day the session can be edited (BR-TOAST-7), derived like `toast.local_date` (SPEC §12 D29).
    localDate: date()
      .generatedAlwaysAs(sql.raw(`(created_at AT TIME ZONE '${TIME_ZONE}')::date`))
      .notNull(),
    deletedAt: timestamptz(),
    createdAt: createdAt(),
  },
  // The history list, newest first.
  (t) => [
    index('toast_session_user_id_created_at_idx').on(t.userId, t.createdAt.desc(), t.id.desc()),
  ],
);

export const toast = pgTable(
  'toast',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sessionId: uuid()
      .notNull()
      .references(() => toastSession.id, { onDelete: 'cascade' }),
    // The clan at logging time; leaving later doesn't move the toast (SPEC §12 D9).
    clanId: uuid().references(() => clan.id, { onDelete: 'set null' }),
    eatenAt: timestamptz().defaultNow().notNull(),
    // Derived by Postgres so it can never disagree with `eaten_at` (SPEC §12 D29).
    localDate: date()
      .generatedAlwaysAs(sql.raw(`(eaten_at AT TIME ZONE '${TIME_ZONE}')::date`))
      .notNull(),
    // Only on a session's lead toast: its first one, which lowering the count never removes.
    photoKey: text(),
    photoHiddenAt: timestamptz(),
    status: toastStatusEnum().default(ToastStatus.active).notNull(),
    deletedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    index('toast_user_id_local_date_idx').on(t.userId, t.localDate),
    index('toast_clan_id_local_date_idx').on(t.clanId, t.localDate),
    index('toast_session_id_idx').on(t.sessionId),
    // Toast of the week candidates.
    index('toast_photo_local_date_idx')
      .on(t.localDate)
      .where(sql`${t.photoKey} IS NOT NULL`),
  ],
);

// Photos taken off a toast by a replace or remove. The object stays until the cleanup job (M15) deletes
// it, since an open `photo_report` on the toast may still need it (SPEC §12 D44).
export const discardedPhoto = pgTable(
  'discarded_photo',
  {
    key: text().primaryKey(),
    toastId: uuid()
      .notNull()
      .references(() => toast.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [index('discarded_photo_toast_id_idx').on(t.toastId)],
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
