import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestMagicLink, safeNext, signOut } from './auth-api';

function stubFetch(status: number, body: unknown = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safeNext', () => {
  it.each([
    ['/u/1?tab=stats', '/u/1?tab=stats'],
    [null, '/home'],
    ['', '/home'],
    ['https://evil.example', '/home'],
    ['//evil.example', '/home'],
    ['/\\evil.example', '/home'],
    ['home', '/home'],
  ])('%j → %s', (next, expected) => {
    expect(safeNext(next)).toBe(expected);
  });
});

describe('requestMagicLink', () => {
  it('asks for a link back to /auth/callback, in the UI language', async () => {
    const fetch = stubFetch(200, { status: true });
    await requestMagicLink('ann@example.com', { locale: 'sk', next: '/u/1' });

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/auth/sign-in/magic-link');
    expect(new Headers(init?.headers).get('accept-language')).toBe('sk');
    expect(JSON.parse(init?.body as string)).toEqual({
      email: 'ann@example.com',
      callbackURL: `${window.location.origin}/auth/callback?next=%2Fu%2F1`,
      errorCallbackURL: `${window.location.origin}/auth/callback`,
    });
  });

  it('throws the §8 error', async () => {
    stubFetch(429, { error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
    await expect(requestMagicLink('ann@example.com', { locale: 'en' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });
  });
});

describe('signOut', () => {
  it('treats an already ended session as signed out', async () => {
    stubFetch(401, { error: { code: 'UNAUTHENTICATED', message: 'No session' } });
    await expect(signOut()).resolves.toBeUndefined();
  });

  it('reports other failures', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(signOut()).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
