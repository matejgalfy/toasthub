import { sql } from 'drizzle-orm';
import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';

// Column helpers shared by every table (SPEC §7: UUID v7 ids, timestamptz).

export const citext = customType<{ data: string }>({ dataType: () => 'citext' });

export const id = () =>
  uuid()
    .default(sql`uuidv7()`)
    .primaryKey();

export const timestamptz = () => timestamp({ withTimezone: true });

export const createdAt = () => timestamptz().defaultNow().notNull();

/** A Postgres enum from a shared `as const` object, e.g. `ClanRole`. */
export function enumValues<T extends Record<string, string>>(values: T) {
  return Object.values(values) as [T[keyof T], ...T[keyof T][]];
}
