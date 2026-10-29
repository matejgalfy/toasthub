import { FLAG_REASON_MAX, FlagStatus, FlagType } from '@toasthub/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { createdAt, enumValues, id, timestamptz } from './columns';
import { toast } from './toasts';

export const flagTypeEnum = pgEnum('flag_type', enumValues(FlagType));
export const flagStatusEnum = pgEnum('flag_status', enumValues(FlagStatus));

export const flag = pgTable(
  'flag',
  {
    id: id(),
    type: flagTypeEnum().notNull(),
    subjectUserId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    toastId: uuid().references(() => toast.id, { onDelete: 'set null' }),
    localDate: date(),
    reporterId: uuid().references(() => user.id, { onDelete: 'set null' }),
    reason: varchar({ length: FLAG_REASON_MAX }),
    status: flagStatusEnum().default(FlagStatus.open).notNull(),
    resolvedBy: uuid().references(() => user.id, { onDelete: 'set null' }),
    resolvedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    // One count flag per user and day: inserts use ON CONFLICT DO NOTHING. Photo reports have a null
    // `local_date`, and nulls never conflict.
    uniqueIndex('flag_subject_type_local_date_unique').on(t.subjectUserId, t.type, t.localDate),
    // The admin queue, newest first by UUID v7.
    index('flag_status_id_idx').on(t.status, t.id),
    check(
      'flag_count_threshold_has_date',
      sql`${t.type} <> 'count_threshold' OR ${t.localDate} IS NOT NULL`,
    ),
    check(
      'flag_photo_report_has_toast',
      sql`${t.type} <> 'photo_report' OR ${t.toastId} IS NOT NULL`,
    ),
  ],
);
