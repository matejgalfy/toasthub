import { CLAN_DESCRIPTION_MAX, CLAN_NAME_MAX, ClanRole, JoinRequestStatus } from '@toasthub/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { createdAt, enumValues, id, timestamptz } from './columns';

export const clanRoleEnum = pgEnum('clan_role', enumValues(ClanRole));
export const joinRequestStatusEnum = pgEnum('join_request_status', enumValues(JoinRequestStatus));

// Clans are only soft-deleted, so the clan FKs below never fire a delete.
export const clan = pgTable(
  'clan',
  {
    id: id(),
    name: varchar({ length: CLAN_NAME_MAX }).notNull(),
    description: varchar({ length: CLAN_DESCRIPTION_MAX }),
    avatarId: smallint(),
    deletedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    // A deleted clan frees its name.
    uniqueIndex('clan_name_unique')
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} IS NULL`),
    // CLAN_AVATAR_COUNT; raise both when a picture is added.
    check('clan_avatar_id_range', sql`${t.avatarId} BETWEEN 1 AND 6`),
  ],
);

export const clanMembership = pgTable(
  'clan_membership',
  {
    // The PK makes "one clan per user" a constraint.
    userId: uuid()
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    clanId: uuid()
      .notNull()
      .references(() => clan.id, { onDelete: 'cascade' }),
    role: clanRoleEnum().notNull(),
    joinedAt: timestamptz().defaultNow().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('clan_membership_clan_id_idx').on(t.clanId),
    uniqueIndex('clan_membership_one_owner')
      .on(t.clanId)
      .where(sql`${t.role} = 'owner'`),
  ],
);

export const clanJoinRequest = pgTable(
  'clan_join_request',
  {
    id: id(),
    clanId: uuid()
      .notNull()
      .references(() => clan.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: joinRequestStatusEnum().default(JoinRequestStatus.pending).notNull(),
    decidedBy: uuid().references(() => user.id, { onDelete: 'set null' }),
    decidedAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('clan_join_request_one_pending')
      .on(t.userId)
      .where(sql`${t.status} = 'pending'`),
    // The Officer's request list.
    index('clan_join_request_pending_idx')
      .on(t.clanId, t.id)
      .where(sql`${t.status} = 'pending'`),
  ],
);
