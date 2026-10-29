import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn, WEB_ORIGIN } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';

let app: NestFastifyApplication;
let ann: SignedIn;

beforeEach(async () => {
  app = await createTestApp();
  ann = await signIn(app, 'ann@example.com');
});

afterEach(async () => {
  await app.close();
});

function patchMe(payload: Record<string, unknown>) {
  return app.inject({
    method: 'PATCH',
    url: '/api/v1/me',
    headers: { cookie: ann.cookie, origin: WEB_ORIGIN },
    payload,
  });
}

describe('GET /me', () => {
  it('requires a session', async () => {
    const res = await app.inject({ url: '/api/v1/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the own profile', async () => {
    const res = await app.inject({ url: '/api/v1/me', headers: { cookie: ann.cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      user: { id: ann.userId, email: 'ann@example.com', onboarded: false, clanId: null },
    });
  });

  it('names the clan the user is in', async () => {
    await patchMe({ displayName: 'Ann' });
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/clans',
      headers: { cookie: ann.cookie, origin: WEB_ORIGIN },
      payload: { name: 'Crumbs' },
    });
    const { clan } = created.json<{ clan: { id: string } }>();

    const res = await app.inject({ url: '/api/v1/me', headers: { cookie: ann.cookie } });
    expect(res.json()).toMatchObject({ user: { clanId: clan.id } });
    // PATCH answers with the same shape.
    expect((await patchMe({ locale: 'sk' })).json()).toMatchObject({ user: { clanId: clan.id } });
  });

  it('uses UUID v7 ids', () => {
    expect(ann.userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('PATCH /me', () => {
  it('completes onboarding', async () => {
    const res = await patchMe({ displayName: '  Ann  ', avatarId: 3, profileVisibility: 'clan' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      user: {
        displayName: 'Ann',
        avatarId: 3,
        profileVisibility: 'clan',
        locale: 'en',
        onboarded: true,
      },
    });

    const me = await app.inject({ url: '/api/v1/me', headers: { cookie: ann.cookie } });
    expect(me.json()).toEqual(res.json());
  });

  it('changes single fields and clears the avatar', async () => {
    await patchMe({ displayName: 'Ann', avatarId: 2 });
    const res = await patchMe({ locale: 'sk', avatarId: null });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      user: { displayName: 'Ann', avatarId: null, locale: 'sk', onboarded: true },
    });
  });

  it('accepts an empty patch', async () => {
    const res = await patchMe({});
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ user: { id: ann.userId } });
  });

  it.each([
    [{ displayName: 'A' }, 'displayName'],
    [{ displayName: 'x'.repeat(31) }, 'displayName'],
    [{ avatarId: 7 }, 'avatarId'],
    [{ locale: 'de' }, 'locale'],
    [{ profileVisibility: 'private' }, 'profileVisibility'],
  ])('rejects %j', async (payload, field) => {
    const res = await patchMe(payload);
    expect(res.statusCode).toBe(400);
    const { error } = res.json<{ error: { code: string; fields: Record<string, string> } }>();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(error.fields)).toEqual([field]);
  });

  it('cannot change role, status or email', async () => {
    for (const payload of [{ role: 'admin' }, { status: 'banned' }, { email: 'x@example.com' }]) {
      expect((await patchMe(payload)).statusCode).toBe(400);
    }
    const me = await app.inject({ url: '/api/v1/me', headers: { cookie: ann.cookie } });
    expect(me.json()).toMatchObject({ user: { role: 'user', email: 'ann@example.com' } });
  });
});
