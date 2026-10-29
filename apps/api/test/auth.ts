import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import { magicLinkFor } from './mailpit';

// Matches WEB_ORIGIN in setup-int.ts.
export const WEB_ORIGIN = 'http://localhost:5173';
export const CALLBACK_URL = `${WEB_ORIGIN}/auth/callback`;

type InjectResponse = Awaited<ReturnType<NestFastifyApplication['inject']>>;

export function requestMagicLink(
  app: NestFastifyApplication,
  email: string,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in/magic-link',
    headers,
    payload: { email, ...body },
  });
}

/** Opens a magic link the way the browser would: path and query against our app. */
export function openLink(app: NestFastifyApplication, link: URL) {
  return app.inject({ method: 'GET', url: `${link.pathname}${link.search}` });
}

/** `name=value` of the session cookie a response sets, ready for a `cookie` request header. */
export function sessionCookie(res: InjectResponse): string {
  const header = res.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = cookies.find((c) => /^(__Secure-)?toasthub\.session_token=/.test(c));
  if (!cookie) throw new Error('No session cookie in the response');
  return cookie.split(';')[0] ?? '';
}

export interface SignedIn {
  userId: string;
  /** For a `cookie` header. Mutations with it also need `origin: WEB_ORIGIN`. */
  cookie: string;
}

/** Signs `email` in through the real magic-link flow (Mailpit included). Creates the user if needed. */
export async function signIn(app: NestFastifyApplication, email: string): Promise<SignedIn> {
  const requested = await requestMagicLink(app, email, { callbackURL: CALLBACK_URL });
  if (requested.statusCode !== 200) throw new Error(`Sign-in failed: ${requested.body}`);
  const cookie = sessionCookie(await openLink(app, await magicLinkFor(email)));
  const me = await app.inject({ url: '/api/v1/me', headers: { cookie } });
  const { user } = me.json<{ user: { id: string } }>();
  return { userId: user.id, cookie };
}
