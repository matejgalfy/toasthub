import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  addDays,
  type ClanDetail,
  type ClanJoinRequestList,
  type ClanJoinRequestResponse,
  type ClanMembershipResponse,
  type ClanPage,
  type ClanResponse,
  type ClanRole,
  type CreateClanResponse,
  localDate,
} from '@toasthub/shared';
import { and, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn, WEB_ORIGIN } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { insertToasts } from '../../../test/toasts';
import { type Database, DB } from '../../db/db.module';
import { clan, clanJoinRequest, clanMembership, user, userAchievement } from '../../db/schema';
import { SettingsService } from '../settings/settings.service';

let app: NestFastifyApplication;
let db: Database;
let ann: SignedIn;
let bob: SignedIn;
let cyril: SignedIn;

const UNKNOWN_ID = '01890a5d-ac96-774b-bcce-b302099a8057';

beforeEach(async () => {
  app = await createTestApp();
  db = app.get<Database>(DB);
  ann = await signUp('ann@example.com', 'Ann');
  bob = await signUp('bob@example.com', 'Bob');
  cyril = await signUp('cyril@example.com', 'Cyril');
});

afterEach(async () => {
  await app.close();
});

async function signUp(email: string, displayName: string): Promise<SignedIn> {
  const who = await signIn(app, email);
  await db.update(user).set({ displayName }).where(eq(user.id, who.userId));
  return who;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function call(as: SignedIn | null, method: Method, url: string, payload?: object) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    headers: as ? { cookie: as.cookie, origin: WEB_ORIGIN } : {},
    ...(payload ? { payload } : {}),
  });
}

async function ok<T>(as: SignedIn, method: Method, url: string, status: number, payload?: object) {
  const res = await call(as, method, url, payload);
  expect(res.statusCode, res.body).toBe(status);
  return res.json<T>();
}

function expectError(res: Awaited<ReturnType<typeof call>>, status: number, code: string): void {
  expect(res.statusCode, res.body).toBe(status);
  expect(res.json<{ error: { code: string } }>().error.code).toBe(code);
}

async function createClan(owner: SignedIn, name = 'Crumbs', description?: string) {
  const body = await ok<CreateClanResponse>(owner, 'POST', '/clans', 201, { name, description });
  return body.clan.id;
}

/** Puts users straight into a clan, bypassing requests. */
async function addMembers(clanId: string, members: { userId: string; role?: ClanRole }[]) {
  await db
    .insert(clanMembership)
    .values(members.map((m) => ({ userId: m.userId, clanId, role: m.role ?? 'member' })));
}

/** Onboarded users without a session, to fill clans. */
async function extraUsers(count: number): Promise<string[]> {
  const rows = await db
    .insert(user)
    .values(
      Array.from({ length: count }, (_, i) => ({
        email: `extra${String(i)}@example.com`,
        displayName: `Extra ${String(i)}`,
      })),
    )
    .returning({ id: user.id });
  return rows.map((row) => row.id);
}

async function requestToJoin(who: SignedIn, clanId: string): Promise<string> {
  const body = await ok<ClanJoinRequestResponse>(who, 'POST', `/clans/${clanId}/join`, 202);
  return body.request.id;
}

async function requestStatus(requestId: string) {
  const [row] = await db
    .select({ status: clanJoinRequest.status, decidedBy: clanJoinRequest.decidedBy })
    .from(clanJoinRequest)
    .where(eq(clanJoinRequest.id, requestId));
  return row;
}

async function roleOf(userId: string) {
  const [row] = await db
    .select({ clanId: clanMembership.clanId, role: clanMembership.role })
    .from(clanMembership)
    .where(eq(clanMembership.userId, userId));
  return row ?? null;
}

/**
 * Opens the pool's connections. Otherwise the first of several parallel requests commits while the others
 * are still connecting, and a race between them never happens.
 */
async function warmPool() {
  await Promise.all(Array.from({ length: 10 }, () => db.execute(sql`SELECT pg_sleep(0.05)`)));
}

async function setMaxMembers(clanMaxMembers: number) {
  await app.get(SettingsService).set({ clanMaxMembers });
}

describe('auth', () => {
  it.each([
    ['GET', '/clans'],
    ['POST', '/clans'],
    ['GET', `/clans/${UNKNOWN_ID}`],
    ['POST', `/clans/${UNKNOWN_ID}/join`],
    ['DELETE', '/me/clan-request'],
  ] as const)('%s %s requires a session', async (method, url) => {
    expectError(await call(null, method, url), 401, 'UNAUTHENTICATED');
  });
});

describe('POST /clans', () => {
  it('makes the creator the Owner and awards clansman', async () => {
    const body = await ok<CreateClanResponse>(ann, 'POST', '/clans', 201, {
      name: '  Crumbs  ',
      description: 'We toast.',
    });
    expect(body.clan).toMatchObject({ name: 'Crumbs', description: 'We toast.', memberCount: 1 });
    expect(body.newAchievements).toEqual(['clansman']);
    expect(await roleOf(ann.userId)).toEqual({ clanId: body.clan.id, role: 'owner' });
  });

  it('stores an empty description as none', async () => {
    const body = await ok<CreateClanResponse>(ann, 'POST', '/clans', 201, {
      name: 'Crumbs',
      description: '',
    });
    expect(body.clan.description).toBeNull();
  });

  it('is a 409 for a user already in a clan (BR-CLAN-1)', async () => {
    await createClan(ann);
    expectError(await call(ann, 'POST', '/clans', { name: 'Other' }), 409, 'CONFLICT');
  });

  it('is a 409 for a taken name, in any case (BR-CLAN-2)', async () => {
    await createClan(ann, 'Crumbs');
    expectError(await call(bob, 'POST', '/clans', { name: 'cRUMBS' }), 409, 'CONFLICT');
    expect(await roleOf(bob.userId)).toBeNull();
  });

  it.each([
    [{ name: 'ab' }, 'name'],
    [{ name: 'x'.repeat(41) }, 'name'],
    [{ name: 'Crumbs', description: 'x'.repeat(281) }, 'description'],
    [{ name: 'Crumbs', ownerId: UNKNOWN_ID }, '_'],
  ])('rejects %j', async (payload, field) => {
    const res = await call(ann, 'POST', '/clans', payload);
    expectError(res, 400, 'VALIDATION_ERROR');
    expect(Object.keys(res.json<{ error: { fields: object } }>().error.fields)).toContain(field);
  });

  it('cancels the creator’s pending join request (BR-CLAN-5)', async () => {
    const clanId = await createClan(ann);
    const requestId = await requestToJoin(bob, clanId);
    await createClan(bob, 'Bob’s');
    expect(await requestStatus(requestId)).toEqual({ status: 'cancelled', decidedBy: bob.userId });
  });

  it('is a 403 before onboarding', async () => {
    const dana = await signIn(app, 'dana@example.com');
    expectError(await call(dana, 'POST', '/clans', { name: 'Crumbs' }), 403, 'FORBIDDEN');
  });
});

describe('GET /clans', () => {
  it('lists clans by name with member counts, without deleted ones', async () => {
    const crumbs = await createClan(ann, 'crumbs');
    await addMembers(crumbs, [{ userId: cyril.userId }]);
    const butter = await createClan(bob, 'Butter');
    await db.insert(clan).values({ name: 'Gone', deletedAt: new Date() });

    const page = await ok<ClanPage>(ann, 'GET', '/clans', 200);
    expect(page.items.map((c) => [c.id, c.memberCount])).toEqual([
      [butter, 1],
      [crumbs, 2],
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('searches part of the name, case-insensitively and literally', async () => {
    await createClan(ann, 'Toast Club');
    await createClan(bob, '100% Rye');
    await createClan(cyril, 'Butter');

    const club = await ok<ClanPage>(ann, 'GET', '/clans?search=%20CLUB%20', 200);
    expect(club.items.map((c) => c.name)).toEqual(['Toast Club']);
    const percent = await ok<ClanPage>(ann, 'GET', '/clans?search=%25', 200);
    expect(percent.items.map((c) => c.name)).toEqual(['100% Rye']);
    const all = await ok<ClanPage>(ann, 'GET', '/clans?search=', 200);
    expect(all.items).toHaveLength(3);
  });

  it('pages with a cursor', async () => {
    await db.insert(clan).values(['Delta', 'alpha', 'Charlie', 'bravo'].map((name) => ({ name })));
    const first = await ok<ClanPage>(ann, 'GET', '/clans?limit=3', 200);
    expect(first.items.map((c) => c.name)).toEqual(['alpha', 'bravo', 'Charlie']);
    expect(first.nextCursor).not.toBeNull();
    const second = await ok<ClanPage>(
      ann,
      'GET',
      `/clans?limit=3&cursor=${String(first.nextCursor)}`,
      200,
    );
    expect(second.items.map((c) => c.name)).toEqual(['Delta']);
    expect(second.nextCursor).toBeNull();
  });
});

describe('GET /clans/:id', () => {
  it('shows members by role, the clan streak and the caller’s role', async () => {
    const clanId = await createClan(ann);
    await addMembers(clanId, [{ userId: bob.userId }, { userId: cyril.userId, role: 'officer' }]);
    const today = localDate(new Date());
    // Two days in a row, credited to the clan when logged (D9).
    await insertToasts(
      db,
      [1, 2].map((daysAgo) => ({
        userId: bob.userId,
        clanId,
        eatenAt: new Date(`${addDays(today, -daysAgo)}T10:00:00Z`),
      })),
    );

    const detail = await ok<ClanDetail>(bob, 'GET', `/clans/${clanId}`, 200);
    expect(detail.clan.memberCount).toBe(3);
    expect(detail.members.map((m) => [m.user.displayName, m.role])).toEqual([
      ['Ann', 'owner'],
      ['Cyril', 'officer'],
      ['Bob', 'member'],
    ]);
    expect(detail.streak).toEqual({ current: 2, longest: 2 });
    expect(detail.myRole).toBe('member');
    expect(detail.myRequest).toBeNull();
    expect(JSON.stringify(detail)).not.toContain('@example.com');
  });

  it('shows a non-member their pending request', async () => {
    const clanId = await createClan(ann);
    const requestId = await requestToJoin(bob, clanId);
    const detail = await ok<ClanDetail>(bob, 'GET', `/clans/${clanId}`, 200);
    expect(detail.myRole).toBeNull();
    expect(detail.myRequest).toMatchObject({ id: requestId, status: 'pending' });
  });

  it('is a 404 for an unknown or deleted clan', async () => {
    const [gone] = await db
      .insert(clan)
      .values({ name: 'Gone', deletedAt: new Date() })
      .returning();
    expectError(await call(ann, 'GET', `/clans/${UNKNOWN_ID}`), 404, 'NOT_FOUND');
    expectError(await call(ann, 'GET', `/clans/${String(gone?.id)}`), 404, 'NOT_FOUND');
  });
});

describe('PATCH /clans/:id', () => {
  it('lets the Owner rename and clear the description', async () => {
    const clanId = await createClan(ann, 'Crumbs', 'Old');
    const body = await ok<ClanResponse>(ann, 'PATCH', `/clans/${clanId}`, 200, {
      name: 'Rye',
      description: '',
    });
    expect(body.clan).toMatchObject({ id: clanId, name: 'Rye', description: null, memberCount: 1 });
  });

  it('is a 403 for an Officer and a non-member', async () => {
    const clanId = await createClan(ann);
    await addMembers(clanId, [{ userId: bob.userId, role: 'officer' }]);
    for (const who of [bob, cyril]) {
      expectError(await call(who, 'PATCH', `/clans/${clanId}`, { name: 'Mine' }), 403, 'FORBIDDEN');
    }
  });

  it('is a 409 for a taken name', async () => {
    const clanId = await createClan(ann, 'Crumbs');
    await createClan(bob, 'Butter');
    expectError(await call(ann, 'PATCH', `/clans/${clanId}`, { name: 'BUTTER' }), 409, 'CONFLICT');
  });
});

describe('DELETE /clans/:id', () => {
  it('soft-deletes, removes memberships, cancels requests and frees the name', async () => {
    const clanId = await createClan(ann, 'Crumbs');
    await addMembers(clanId, [{ userId: bob.userId }]);
    const requestId = await requestToJoin(cyril, clanId);

    expect((await call(ann, 'DELETE', `/clans/${clanId}`)).statusCode).toBe(204);
    const [row] = await db.select().from(clan).where(eq(clan.id, clanId));
    expect(row?.deletedAt).not.toBeNull();
    expect(await db.$count(clanMembership, eq(clanMembership.clanId, clanId))).toBe(0);
    expect(await requestStatus(requestId)).toEqual({ status: 'cancelled', decidedBy: ann.userId });
    expectError(await call(ann, 'GET', `/clans/${clanId}`), 404, 'NOT_FOUND');
    // Ann is free to start again, under the same name.
    await createClan(ann, 'crumbs');
  });

  it('is a 403 for an Officer', async () => {
    const clanId = await createClan(ann);
    await addMembers(clanId, [{ userId: bob.userId, role: 'officer' }]);
    expectError(await call(bob, 'DELETE', `/clans/${clanId}`), 403, 'FORBIDDEN');
  });
});

describe('POST /clans/:id/join', () => {
  it('creates a pending request', async () => {
    const clanId = await createClan(ann);
    const body = await ok<ClanJoinRequestResponse>(bob, 'POST', `/clans/${clanId}/join`, 202);
    expect(body.request).toMatchObject({
      clanId,
      status: 'pending',
      user: { id: bob.userId, displayName: 'Bob' },
    });
    expect(await roleOf(bob.userId)).toBeNull();
  });

  it('is a 409 for a user already in a clan (BR-CLAN-1)', async () => {
    const crumbs = await createClan(ann);
    await createClan(bob, 'Butter');
    expectError(await call(bob, 'POST', `/clans/${crumbs}/join`), 409, 'CONFLICT');
    // Also for the own clan.
    expectError(await call(ann, 'POST', `/clans/${crumbs}/join`), 409, 'CONFLICT');
  });

  it('allows one pending request at a time (BR-CLAN-5)', async () => {
    const crumbs = await createClan(ann);
    const butter = await createClan(bob, 'Butter');
    await requestToJoin(cyril, crumbs);
    expectError(await call(cyril, 'POST', `/clans/${butter}/join`), 409, 'CONFLICT');
    expectError(await call(cyril, 'POST', `/clans/${crumbs}/join`), 409, 'CONFLICT');
  });

  it('allows one pending request under concurrent requests', async () => {
    const crumbs = await createClan(ann);
    const butter = await createClan(bob, 'Butter');
    await warmPool();
    const results = await Promise.all([
      call(cyril, 'POST', `/clans/${crumbs}/join`),
      call(cyril, 'POST', `/clans/${butter}/join`),
    ]);
    expect(results.map((res) => res.statusCode).sort()).toEqual([202, 409]);
  });

  it('is a 409 when the clan is full (BR-CLAN-3)', async () => {
    await setMaxMembers(2);
    const clanId = await createClan(ann);
    await addMembers(clanId, [{ userId: bob.userId }]);
    expectError(await call(cyril, 'POST', `/clans/${clanId}/join`), 409, 'CONFLICT');
  });

  it('is a 404 for an unknown clan', async () => {
    expectError(await call(bob, 'POST', `/clans/${UNKNOWN_ID}/join`), 404, 'NOT_FOUND');
  });
});

describe('join requests', () => {
  let clanId: string;
  let requestId: string;

  beforeEach(async () => {
    clanId = await createClan(ann);
    requestId = await requestToJoin(bob, clanId);
  });

  it('lists pending requests to Officers and the Owner only', async () => {
    const list = await ok<ClanJoinRequestList>(ann, 'GET', `/clans/${clanId}/requests`, 200);
    expect(list.items.map((r) => [r.id, r.user.displayName])).toEqual([[requestId, 'Bob']]);

    await addMembers(clanId, [{ userId: cyril.userId, role: 'officer' }]);
    expect((await call(cyril, 'GET', `/clans/${clanId}/requests`)).statusCode).toBe(200);
    await db
      .update(clanMembership)
      .set({ role: 'member' })
      .where(eq(clanMembership.userId, cyril.userId));
    expectError(await call(cyril, 'GET', `/clans/${clanId}/requests`), 403, 'FORBIDDEN');
  });

  it('approve makes a Member and awards clansman', async () => {
    await addMembers(clanId, [{ userId: cyril.userId, role: 'officer' }]);
    const body = await ok<ClanMembershipResponse>(
      cyril,
      'POST',
      `/clans/${clanId}/requests/${requestId}/approve`,
      200,
    );
    expect(body.membership).toMatchObject({ clanId, role: 'member', user: { id: bob.userId } });
    expect(await roleOf(bob.userId)).toEqual({ clanId, role: 'member' });
    expect(await requestStatus(requestId)).toEqual({ status: 'approved', decidedBy: cyril.userId });
    const badges = await db
      .select()
      .from(userAchievement)
      .where(
        and(
          eq(userAchievement.userId, bob.userId),
          eq(userAchievement.achievementCode, 'clansman'),
        ),
      );
    expect(badges).toHaveLength(1);
    const list = await ok<ClanJoinRequestList>(ann, 'GET', `/clans/${clanId}/requests`, 200);
    expect(list.items).toEqual([]);
  });

  it('approve is a 409 when the clan is full (BR-CLAN-3)', async () => {
    await setMaxMembers(2);
    await addMembers(clanId, [{ userId: cyril.userId }]);
    expectError(
      await call(ann, 'POST', `/clans/${clanId}/requests/${requestId}/approve`),
      409,
      'CONFLICT',
    );
    expect(await roleOf(bob.userId)).toBeNull();
    expect((await requestStatus(requestId))?.status).toBe('pending');
  });

  it('concurrent approvals never overfill the clan', async () => {
    await setMaxMembers(2);
    const others = await db
      .insert(clanJoinRequest)
      .values((await extraUsers(7)).map((userId) => ({ clanId, userId })))
      .returning({ id: clanJoinRequest.id });
    await warmPool();
    // One place left (Ann has the other), eight pending requests.
    const results = await Promise.all(
      [requestId, ...others.map((r) => r.id)].map((rid) =>
        call(ann, 'POST', `/clans/${clanId}/requests/${rid}/approve`),
      ),
    );
    const statuses = results.map((res) => res.statusCode);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(7);
    expect(await db.$count(clanMembership, eq(clanMembership.clanId, clanId))).toBe(2);
  });

  it('approving the same request twice at once succeeds once', async () => {
    await addMembers(clanId, [{ userId: cyril.userId, role: 'officer' }]);
    await warmPool();
    const results = await Promise.all(
      [ann, cyril].map((who) =>
        call(who, 'POST', `/clans/${clanId}/requests/${requestId}/approve`),
      ),
    );
    expect(results.map((res) => res.statusCode).sort()).toEqual([200, 409]);
  });

  it('approve is a 403 for a Member and a non-member', async () => {
    await addMembers(clanId, [{ userId: cyril.userId }]);
    const dana = await signUp('dana@example.com', 'Dana');
    for (const who of [cyril, dana]) {
      expectError(
        await call(who, 'POST', `/clans/${clanId}/requests/${requestId}/approve`),
        403,
        'FORBIDDEN',
      );
    }
  });

  it('is a 404 for a request of another clan', async () => {
    const butter = await createClan(cyril, 'Butter');
    expectError(
      await call(cyril, 'POST', `/clans/${butter}/requests/${requestId}/approve`),
      404,
      'NOT_FOUND',
    );
    expectError(
      await call(cyril, 'POST', `/clans/${butter}/requests/${requestId}/reject`),
      404,
      'NOT_FOUND',
    );
  });

  it('reject closes the request; deciding it again is a 409', async () => {
    expect(
      (await call(ann, 'POST', `/clans/${clanId}/requests/${requestId}/reject`)).statusCode,
    ).toBe(204);
    expect(await requestStatus(requestId)).toEqual({ status: 'rejected', decidedBy: ann.userId });
    expectError(
      await call(ann, 'POST', `/clans/${clanId}/requests/${requestId}/approve`),
      409,
      'CONFLICT',
    );
    // Bob may ask again.
    await requestToJoin(bob, clanId);
  });

  it('DELETE /me/clan-request cancels the own request and is idempotent', async () => {
    expect((await call(bob, 'DELETE', '/me/clan-request')).statusCode).toBe(204);
    expect(await requestStatus(requestId)).toEqual({ status: 'cancelled', decidedBy: bob.userId });
    expect((await call(bob, 'DELETE', '/me/clan-request')).statusCode).toBe(204);
    expectError(
      await call(ann, 'POST', `/clans/${clanId}/requests/${requestId}/approve`),
      409,
      'CONFLICT',
    );
  });
});

describe('POST /clans/:id/leave', () => {
  it('lets a Member leave', async () => {
    const clanId = await createClan(ann);
    await addMembers(clanId, [{ userId: bob.userId }]);
    expect((await call(bob, 'POST', `/clans/${clanId}/leave`)).statusCode).toBe(204);
    expect(await roleOf(bob.userId)).toBeNull();
  });

  it('is a 409 for the Owner (BR-CLAN-4)', async () => {
    const clanId = await createClan(ann);
    expectError(await call(ann, 'POST', `/clans/${clanId}/leave`), 409, 'CONFLICT');
    expect(await roleOf(ann.userId)).toEqual({ clanId, role: 'owner' });
  });

  it('is a 403 for a non-member', async () => {
    const clanId = await createClan(ann);
    await createClan(bob, 'Butter');
    expectError(await call(bob, 'POST', `/clans/${clanId}/leave`), 403, 'FORBIDDEN');
    expect(await roleOf(bob.userId)).not.toBeNull();
  });
});
