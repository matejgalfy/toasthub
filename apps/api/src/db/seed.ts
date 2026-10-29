import { ClanRole, Locale, ProfileVisibility } from '@toasthub/shared';
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Pool } from 'pg';

import { parseEnv } from '../config/env';
import { createDatabase, type Database } from './db.module';
import { clan, clanMembership, toast, toastSession, user } from './schema';

/*
 * Dev sample data: a few onboarded users, one clan and about two months of toast sessions. Idempotent:
 * users and the clan are matched by email and name, and a user who already has toasts gets no new ones.
 * Sign in as any of them with the magic link (Mailpit catches it). No photos, since they would need S3
 * objects.
 */

const SEED_CLAN = { name: 'Breakfast Club', description: 'Sample clan from the dev seed.' };
const DAYS = 60;

interface SeedUser {
  email: string;
  displayName: string;
  avatarId: number;
  locale: Locale;
  profileVisibility: ProfileVisibility;
  clanRole: ClanRole | null;
  // Chance of toasting on a given day; the last days are always toasted for a visible streak.
  activity: number;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'ann@example.com',
    displayName: 'Ann',
    avatarId: 1,
    locale: 'en',
    profileVisibility: 'public',
    clanRole: 'owner',
    activity: 0.9,
  },
  {
    email: 'bob@example.com',
    displayName: 'Bob',
    avatarId: 2,
    locale: 'en',
    profileVisibility: 'public',
    clanRole: 'officer',
    activity: 0.7,
  },
  {
    email: 'cyril@example.com',
    displayName: 'Cyril',
    avatarId: 3,
    locale: 'sk',
    profileVisibility: 'clan',
    clanRole: 'member',
    activity: 0.5,
  },
  {
    email: 'dana@example.com',
    displayName: 'Dana',
    avatarId: 4,
    locale: 'sk',
    profileVisibility: 'public',
    clanRole: null,
    activity: 0.6,
  },
  {
    email: 'emil@example.com',
    displayName: 'Emil',
    avatarId: 5,
    locale: 'sk',
    profileVisibility: 'clan',
    clanRole: null,
    activity: 0.3,
  },
];

// Deterministic, so a fresh database always gets the same data (mulberry32).
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface Sitting {
  at: Date;
  toasts: number;
}

/** One or two toast sessions on an active day, each of one to three toasts. */
function sampleSittings(activity: number, seed: number, now: Date): Sitting[] {
  const next = random(seed);
  const sittings: Sitting[] = [];
  for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo--) {
    if (daysAgo > 3 && next() > activity) continue;
    const count = 1 + Math.floor(next() * 2);
    for (let i = 0; i < count; i++) {
      const minutesAgo = daysAgo * 1440 + Math.floor(next() * 1440);
      const toasts = 1 + Math.floor(next() * 3);
      sittings.push({ at: new Date(now.getTime() - minutesAgo * 60_000), toasts });
    }
  }
  return sittings;
}

export async function seed(db: Database, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(user)
      .values(
        SEED_USERS.map((u) => ({
          email: u.email,
          displayName: u.displayName,
          avatarId: u.avatarId,
          locale: u.locale,
          profileVisibility: u.profileVisibility,
          emailVerified: true,
        })),
      )
      .onConflictDoNothing({ target: user.email });
    const users = await tx
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(
        inArray(
          user.email,
          SEED_USERS.map((u) => u.email),
        ),
      );
    const idOf = new Map(users.map((u) => [u.email, u.id]));

    let [seedClan] = await tx
      .select({ id: clan.id })
      .from(clan)
      .where(and(sql`lower(${clan.name}) = lower(${SEED_CLAN.name})`, isNull(clan.deletedAt)));
    seedClan ??= (await tx.insert(clan).values(SEED_CLAN).returning({ id: clan.id }))[0];
    if (!seedClan) throw new Error('Could not create the seed clan');
    const clanId = seedClan.id;

    const members = SEED_USERS.flatMap(({ email, clanRole }) => {
      const userId = idOf.get(email);
      return userId && clanRole ? [{ userId, clanId, role: clanRole }] : [];
    });
    await tx.insert(clanMembership).values(members).onConflictDoNothing();

    for (const [index, seedUser] of SEED_USERS.entries()) {
      const userId = idOf.get(seedUser.email);
      if (!userId) continue;
      const [existing] = await tx
        .select({ n: count() })
        .from(toast)
        .where(eq(toast.userId, userId));
      if (existing && existing.n > 0) continue;

      const sittings = sampleSittings(seedUser.activity, index + 1, now);
      if (sittings.length === 0) continue;
      const sessions = await tx
        .insert(toastSession)
        .values(sittings.map(({ at }) => ({ userId, createdAt: at })))
        .returning({ id: toastSession.id, createdAt: toastSession.createdAt });
      const rows = sessions.flatMap((session, i) =>
        Array.from({ length: sittings[i]?.toasts ?? 0 }, () => ({
          userId,
          sessionId: session.id,
          clanId: seedUser.clanRole ? clanId : null,
          eatenAt: session.createdAt,
        })),
      );
      await tx.insert(toast).values(rows);
    }
  });
}

if (require.main === module) {
  const env = parseEnv(process.env);
  if (env.NODE_ENV === 'production') {
    console.error('Refusing to seed a production database');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  seed(createDatabase(pool))
    .then(
      () => {
        console.log('Dev seed applied');
      },
      (error: unknown) => {
        console.error(error);
        process.exitCode = 1;
      },
    )
    .finally(() => void pool.end());
}
