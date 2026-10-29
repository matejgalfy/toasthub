import { AchievementCode } from '@toasthub/shared';
import { sql } from 'drizzle-orm';
import { check, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { createdAt, timestamptz } from './columns';

const knownCodes = Object.values(AchievementCode)
  .map((code) => `'${code}'`)
  .join(', ');

// Rows outlive the toasts that earned them (BR-TOAST-4), so there is no FK to `toast`.
export const userAchievement = pgTable(
  'user_achievement',
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    achievementCode: text().notNull(),
    earnedAt: timestamptz().defaultNow().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.achievementCode] }),
    check('user_achievement_code_known', sql`${t.achievementCode} IN (${sql.raw(knownCodes)})`),
  ],
);
