import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { addDays, type LocalDate, localDate } from '@toasthub/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp } from '../../../test/create-app';
import { insertToasts } from '../../../test/toasts';
import { type Database, DB } from '../../db/db.module';
import { clan, user } from '../../db/schema';
import { StreaksService } from './streaks.service';

let app: NestFastifyApplication;
let db: Database;
let streaks: StreaksService;
let today: LocalDate;

beforeEach(async () => {
  app = await createTestApp();
  db = app.get<Database>(DB);
  streaks = app.get(StreaksService);
  today = localDate(new Date());
});

afterEach(async () => {
  await app.close();
});

async function clanWithToasts(
  name: string,
  daysAgo: number[],
  extra: { status?: 'rejected' } = {},
): Promise<string> {
  const [owner] = await db
    .insert(user)
    .values({ email: `${name}@example.com`, displayName: name })
    .returning({ id: user.id });
  const [row] = await db.insert(clan).values({ name }).returning({ id: clan.id });
  if (!owner || !row) throw new Error('Insert returned no row');
  await insertToasts(
    db,
    daysAgo.map((n) => ({
      userId: owner.id,
      clanId: row.id,
      eatenAt: new Date(`${addDays(today, -n)}T10:00:00Z`),
      ...extra,
    })),
  );
  return row.id;
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('StreaksService.currentForClans', () => {
  it('agrees with forClan across several windows', async () => {
    const clans = {
      // 12 days up to today, then a gap: crosses the 2, 4 and 8 day windows.
      long: await clanWithToasts('Long', [...range(0, 11), 13, 14]),
      // Still alive through today (BR-STREAK-2).
      yesterday: await clanWithToasts('Yesterday', range(1, 3)),
      // A run that ends exactly on a window's first day.
      edge: await clanWithToasts('Edge', range(0, 1)),
      broken: await clanWithToasts('Broken', [0, 2, 3]),
      over: await clanWithToasts('Over', [2, 3, 4]),
      none: await clanWithToasts('None', []),
    };
    const rejected = await clanWithToasts('Rejected', [0, 1], { status: 'rejected' });
    const ids = [...Object.values(clans), rejected];

    const current = await streaks.currentForClans(ids, today, 2);

    expect(
      Object.fromEntries(Object.entries(clans).map(([k, id]) => [k, current.get(id)])),
    ).toEqual({
      long: 12,
      yesterday: 3,
      edge: 2,
      broken: 1,
      over: 0,
      none: 0,
    });
    expect(current.get(rejected)).toBe(0);
    for (const id of ids) {
      expect(current.get(id)).toBe((await streaks.forClan(id, today)).current);
    }
  });

  it('answers an empty map for no clans', async () => {
    expect(await streaks.currentForClans([], today)).toEqual(new Map());
  });
});
