import { Locale, ProfileVisibility, UserRole, UserStatus } from '@toasthub/shared';
import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/*
 * Better Auth tables (SPEC §7), adapted by hand from the CLI output. After a Better Auth upgrade, run
 * `bun run --filter @toasthub/api auth:schema` (writes the ignored `.generated/auth-schema.ts`), port
 * the differences here and keep these changes:
 * - IDs default to Postgres 18 `uuidv7()` (Better Auth leaves IDs to the database: `generateId: 'uuid'`).
 * - `email` is citext; timestamps are timestamptz.
 * - The app's user fields are Postgres enums / smallint with NOT NULL defaults and checks.
 * - `display_name` is varchar(30). It is '' until onboarding, because Better Auth's `name` can't be null.
 */

const citext = customType<{ data: string }>({ dataType: () => 'citext' });

const id = () =>
  uuid()
    .default(sql`uuidv7()`)
    .primaryKey();
const timestamptz = () => timestamp({ withTimezone: true });

export const localeEnum = pgEnum('locale', Object.values(Locale) as [Locale, ...Locale[]]);
export const profileVisibilityEnum = pgEnum(
  'profile_visibility',
  Object.values(ProfileVisibility) as [ProfileVisibility, ...ProfileVisibility[]],
);
export const userRoleEnum = pgEnum(
  'user_role',
  Object.values(UserRole) as [UserRole, ...UserRole[]],
);
export const userStatusEnum = pgEnum(
  'user_status',
  Object.values(UserStatus) as [UserStatus, ...UserStatus[]],
);

export const user = pgTable(
  'user',
  {
    id: id(),
    displayName: varchar({ length: 30 }).notNull(),
    email: citext().notNull().unique(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    createdAt: timestamptz().defaultNow().notNull(),
    updatedAt: timestamptz()
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    avatarId: smallint(),
    locale: localeEnum().default(Locale.en).notNull(),
    profileVisibility: profileVisibilityEnum().default(ProfileVisibility.public).notNull(),
    role: userRoleEnum().default(UserRole.user).notNull(),
    status: userStatusEnum().default(UserStatus.active).notNull(),
  },
  (table) => [check('user_avatar_id_range', sql`${table.avatarId} BETWEEN 1 AND 6`)],
);

export const session = pgTable(
  'session',
  {
    id: id(),
    expiresAt: timestamptz().notNull(),
    token: text().notNull().unique(),
    createdAt: timestamptz().defaultNow().notNull(),
    updatedAt: timestamptz()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: id(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamptz(),
    refreshTokenExpiresAt: timestamptz(),
    scope: text(),
    password: text(),
    createdAt: timestamptz().defaultNow().notNull(),
    updatedAt: timestamptz()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

// Magic-link tokens (hashed) live here.
export const verification = pgTable(
  'verification',
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamptz().notNull(),
    createdAt: timestamptz().defaultNow().notNull(),
    updatedAt: timestamptz()
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

// Better Auth's per-IP limits, plus our per-email magic-link limit (`email-rate-limit.ts`).
export const rateLimit = pgTable('rate_limit', {
  id: id(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: 'number' }).notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
