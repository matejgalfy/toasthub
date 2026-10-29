import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CALLBACK_URL,
  openLink,
  requestMagicLink,
  sessionCookie,
  signIn,
  WEB_ORIGIN,
} from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { latestMessageTo, magicLinkFor, messagesTo } from '../../../test/mailpit';
import { type Database, DB } from '../../db/db.module';
import { session, user, verification } from '../../db/schema';
import { AuthService } from './auth.service';

const ERROR_CALLBACK_URL = `${WEB_ORIGIN}/auth/callback?failed=1`;
const DAY_MS = 24 * 60 * 60 * 1000;

let app: NestFastifyApplication;
let db: Database;

beforeEach(async () => {
  app = await createTestApp();
  db = app.get<Database>(DB);
});

afterEach(async () => {
  await app.close();
});

function getMe(headers: Record<string, string>) {
  return app.inject({ url: '/api/v1/me', headers });
}

async function requestLink(email: string, headers: Record<string, string> = {}): Promise<URL> {
  const res = await requestMagicLink(
    app,
    email,
    { callbackURL: CALLBACK_URL, errorCallbackURL: ERROR_CALLBACK_URL },
    headers,
  );
  expect(res.statusCode).toBe(200);
  return magicLinkFor(email);
}

describe('magic-link sign-in', () => {
  it('logs a new user in and sends them to onboarding', async () => {
    const link = await requestLink('ann@example.com');
    expect(link.origin).toBe('http://localhost:3000');
    expect(link.pathname).toBe('/api/v1/auth/magic-link/verify');

    const verified = await openLink(app, link);
    expect(verified.statusCode).toBe(302);
    expect(verified.headers.location).toBe(CALLBACK_URL);

    const me = await getMe({ cookie: sessionCookie(verified) });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({
      user: {
        id: expect.any(String) as string,
        email: 'ann@example.com',
        displayName: null,
        avatarId: null,
        locale: 'en',
        profileVisibility: 'public',
        role: 'user',
        onboarded: false,
        createdAt: expect.any(String) as string,
      },
    });
  });

  it('sets an httpOnly, SameSite=Lax session cookie valid for 30 days', async () => {
    const verified = await openLink(app, await requestLink('ann@example.com'));
    const cookie = String(verified.headers['set-cookie']);
    expect(cookie).toMatch(/^toasthub\.session_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=2592000/);
    // Plain http in tests; see the HTTPS case below.
    expect(cookie).not.toMatch(/Secure/);
  });

  it('marks the cookie Secure when served over HTTPS', async () => {
    await app.close();
    app = await createTestApp({ BETTER_AUTH_URL: 'https://api.toasthub.test' });
    await requestMagicLink(app, 'ann@example.com', { callbackURL: CALLBACK_URL });
    const verified = await openLink(app, await magicLinkFor('ann@example.com'));
    const cookie = String(verified.headers['set-cookie']);
    expect(cookie).toMatch(/^__Secure-toasthub\.session_token=/);
    expect(cookie).toMatch(/; Secure/i);
  });

  it('ignores a name sent with the sign-in request', async () => {
    const res = await requestMagicLink(app, 'ann@example.com', {
      name: 'x'.repeat(200),
      callbackURL: CALLBACK_URL,
    });
    expect(res.statusCode).toBe(200);
    const verified = await openLink(app, await magicLinkFor('ann@example.com'));
    const me = await getMe({ cookie: sessionCookie(verified) });
    expect(me.json()).toMatchObject({ user: { displayName: null, onboarded: false } });
  });

  it('logs an existing user into the same account, whatever the email case', async () => {
    const first = await signIn(app, 'ann@example.com');
    const second = await signIn(app, 'Ann@Example.COM');
    expect(second.userId).toBe(first.userId);
    expect(await db.$count(user)).toBe(1);
  });

  it('stores only a hash of the token', async () => {
    const link = await requestLink('ann@example.com');
    const token = link.searchParams.get('token') ?? '';
    expect(token).toHaveLength(32);
    const rows = await db.select().from(verification);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('rejects a used link with a redirect to the error URL', async () => {
    const link = await requestLink('ann@example.com');
    expect((await openLink(app, link)).statusCode).toBe(302);

    const again = await openLink(app, link);
    expect(again.statusCode).toBe(302);
    const location = new URL(String(again.headers.location));
    expect(`${location.origin}${location.pathname}`).toBe(`${WEB_ORIGIN}/auth/callback`);
    expect(location.searchParams.get('error')).toBe('INVALID_TOKEN');
    expect(again.headers['set-cookie']).toBeUndefined();
  });

  it('rejects an expired link', async () => {
    const link = await requestLink('ann@example.com');
    await db.update(verification).set({ expiresAt: sql`now() - interval '1 second'` });

    const res = await openLink(app, link);
    expect(res.statusCode).toBe(302);
    expect(new URL(String(res.headers.location)).searchParams.get('error')).toBe('INVALID_TOKEN');
    expect(await db.$count(session)).toBe(0);
  });

  it('makes links valid for 15 minutes', async () => {
    await requestLink('ann@example.com');
    const [row] = await db
      .select({ ttl: sql<number>`extract(epoch from ${verification.expiresAt} - now())` })
      .from(verification);
    expect(Number(row?.ttl)).toBeGreaterThan(14 * 60);
    expect(Number(row?.ttl)).toBeLessThanOrEqual(15 * 60);
  });

  it('answers the same for a known and an unknown email', async () => {
    await signIn(app, 'known@example.com');
    const known = await requestMagicLink(app, 'known@example.com');
    const unknown = await requestMagicLink(app, 'nobody@example.com');
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json()).toEqual(known.json());
    expect(unknown.json()).toEqual({ status: true });
  });

  it('rejects an invalid email in the SPEC error format', async () => {
    const res = await requestMagicLink(app, 'not-an-email');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('refuses a callback URL on another origin', async () => {
    const res = await requestMagicLink(app, 'ann@example.com', {
      callbackURL: 'https://evil.example/steal',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(await messagesTo('ann@example.com')).toHaveLength(0);
  });

  it('refuses a link whose callback URL was changed to another origin', async () => {
    const link = await requestLink('ann@example.com');
    link.searchParams.set('callbackURL', 'https://evil.example/steal');

    const res = await openLink(app, link);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await db.$count(session)).toBe(0);
  });

  it.each([
    ['en-US,en;q=0.9', 'Your Toasthub sign-in link'],
    ['sk-SK,sk;q=0.9', 'Tvoj prihlasovací odkaz do Toasthubu'],
  ])('writes a new user an email in the Accept-Language %s', async (acceptLanguage, subject) => {
    await requestMagicLink(app, 'ann@example.com', {}, { 'accept-language': acceptLanguage });
    expect((await latestMessageTo('ann@example.com')).Subject).toBe(subject);
  });

  it('writes an existing user in their saved locale', async () => {
    const { userId } = await signIn(app, 'ann@example.com');
    await db.update(user).set({ locale: 'sk' }).where(eq(user.id, userId));
    await requestMagicLink(app, 'ann@example.com', {}, { 'accept-language': 'en' });
    expect((await latestMessageTo('ann@example.com')).Subject).toBe(
      'Tvoj prihlasovací odkaz do Toasthubu',
    );
  });
});

describe('rate limits (BR-AUTH-5)', () => {
  it('allows 5 links per email per hour, case-insensitively', async () => {
    for (let i = 0; i < 5; i++) {
      const email = i % 2 ? 'ANN@example.com' : 'ann@example.com';
      expect((await requestMagicLink(app, email)).statusCode).toBe(200);
    }
    // From another IP, so only the per-email limit can apply.
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in/magic-link',
      remoteAddress: '10.9.9.9',
      payload: { email: 'ann@example.com' },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    });
    expect(Number(blocked.headers['x-retry-after'])).toBeGreaterThan(3500);
    expect(await messagesTo('ann@example.com')).toHaveLength(5);
  });

  it('allows 20 requests per IP per hour, and a spoofed forwarding header does not reset it', async () => {
    const fromIp = (email: string, headers: Record<string, string> = {}) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/sign-in/magic-link',
        remoteAddress: '203.0.113.7',
        headers,
        payload: { email },
      });

    for (let i = 0; i < 20; i++) {
      expect((await fromIp(`user${String(i)}@example.com`)).statusCode).toBe(200);
    }
    expect((await fromIp('user20@example.com')).statusCode).toBe(429);
    const spoofed = await fromIp('user21@example.com', {
      'x-forwarded-for': '198.51.100.1',
      'x-toasthub-client-ip': '198.51.100.2',
    });
    expect(spoofed.statusCode).toBe(429);

    const otherIp = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in/magic-link',
      remoteAddress: '203.0.113.8',
      payload: { email: 'user22@example.com' },
    });
    expect(otherIp.statusCode).toBe(200);
  });
});

describe('sessions', () => {
  it('accepts the bearer token from a link verified without a callback URL', async () => {
    // A native app would catch the link and call verify itself, getting JSON instead of a redirect.
    await requestMagicLink(app, 'ann@example.com');
    const link = await magicLinkFor('ann@example.com');
    link.searchParams.delete('callbackURL');
    const verified = await openLink(app, link);
    expect(verified.statusCode).toBe(200);
    const token = verified.headers['set-auth-token'];
    expect(typeof token).toBe('string');

    const me = await getMe({ authorization: `Bearer ${String(token)}` });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { email: 'ann@example.com' } });

    // Bearer clients (mobile) send no Origin.
    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${String(token)}` },
      payload: { displayName: 'Ann' },
    });
    expect(patched.statusCode).toBe(200);
  });

  it('rejects a missing or bogus session', async () => {
    const attempts: Record<string, string>[] = [
      {},
      { authorization: 'Bearer nope' },
      { cookie: 'toasthub.session_token=x.y' },
    ];
    for (const headers of attempts) {
      const res = await getMe(headers);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
    }
  });

  it('refreshes a session older than a day and moves the cookie expiry', async () => {
    const { userId, cookie } = await signIn(app, 'ann@example.com');
    const expiresIn28Days = new Date(Date.now() + 28 * DAY_MS);
    await db.update(session).set({ expiresAt: expiresIn28Days }).where(eq(session.userId, userId));

    const me = await getMe({ cookie });
    expect(me.statusCode).toBe(200);
    expect(String(me.headers['set-cookie'])).toMatch(/toasthub\.session_token=.*Max-Age=2592000/);
    const [row] = await db.select().from(session).where(eq(session.userId, userId));
    expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY_MS);
  });

  it('does not refresh a session used again within a day', async () => {
    const { cookie } = await signIn(app, 'ann@example.com');
    const me = await getMe({ cookie });
    expect(me.statusCode).toBe(200);
    expect(me.headers['set-cookie']).toBeUndefined();
  });

  it('signs out', async () => {
    const { cookie } = await signIn(app, 'ann@example.com');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-out',
      headers: { cookie, origin: WEB_ORIGIN },
    });
    expect(res.statusCode).toBe(200);
    expect(await db.$count(session)).toBe(0);
    expect((await getMe({ cookie })).statusCode).toBe(401);
  });

  it('reports the session through get-session', async () => {
    const { cookie } = await signIn(app, 'ann@example.com');
    const res = await app.inject({ url: '/api/v1/auth/get-session', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ user: { email: 'ann@example.com' } });
  });
});

describe('banned users', () => {
  it('lose their sessions and can no longer sign in', async () => {
    const { userId, cookie } = await signIn(app, 'ann@example.com');
    const pendingLink = await requestLink('ann@example.com');

    await app.get(AuthService).setStatus(userId, 'banned');
    expect(await db.$count(session)).toBe(0);
    expect((await getMe({ cookie })).statusCode).toBe(401);

    // A link sent before the ban no longer creates a session.
    const verified = await openLink(app, pendingLink);
    expect(verified.statusCode).toBe(302);
    expect(new URL(String(verified.headers.location)).searchParams.get('error')).toBeTruthy();
    expect(await db.$count(session)).toBe(0);

    // Asking for a new link looks the same as for anyone, but no email goes out.
    const before = (await messagesTo('ann@example.com')).length;
    expect((await requestMagicLink(app, 'ann@example.com')).statusCode).toBe(200);
    expect(await messagesTo('ann@example.com')).toHaveLength(before);
  });

  it('are rejected even if a session survived the ban', async () => {
    const { userId, cookie } = await signIn(app, 'ann@example.com');
    await db.update(user).set({ status: 'banned' }).where(eq(user.id, userId));
    expect((await getMe({ cookie })).statusCode).toBe(401);
  });

  it('can sign in again once unbanned', async () => {
    const { userId } = await signIn(app, 'ann@example.com');
    const auth = app.get(AuthService);
    await auth.setStatus(userId, 'banned');
    await auth.setStatus(userId, 'active');
    expect((await signIn(app, 'ann@example.com')).userId).toBe(userId);
  });
});

describe('browser protections', () => {
  it('refuses cookie mutations from another origin or without one', async () => {
    const { cookie } = await signIn(app, 'ann@example.com');
    for (const headers of [{ cookie, origin: 'https://evil.example' }, { cookie }]) {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/me',
        headers,
        payload: { displayName: 'Ann' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: { code: 'FORBIDDEN', message: 'Origin not allowed' } });
    }
  });

  it('allows CORS for the web origin only, with credentials', async () => {
    const preflight = (origin: string) =>
      app.inject({
        method: 'OPTIONS',
        url: '/api/v1/me',
        headers: { origin, 'access-control-request-method': 'PATCH' },
      });
    const ok = await preflight(WEB_ORIGIN);
    expect(ok.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const evil = await preflight('https://evil.example');
    expect(evil.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });

  it.each([
    ['POST', '/api/v1/auth/update-user'],
    ['POST', '/api/v1/auth/sign-up/email'],
    ['GET', '/api/v1/auth/list-sessions'],
    ['GET', '/api/v1/auth/sign-out'],
  ] as const)('does not expose %s %s', async (method, url) => {
    const res = await app.inject({ method, url, payload: method === 'POST' ? {} : undefined });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
