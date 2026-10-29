import type { Locale } from '@toasthub/shared';

import { ApiError, toApiError } from '@/api/errors';

// The Better Auth endpoints aren't in openapi.json; plain fetch it is (SPEC §12 D26). Their errors already
// use the §8 shape.
const AUTH_PATH = '/api/v1/auth';
export const CALLBACK_PATH = '/auth/callback';

async function post(path: string, init: RequestInit = {}): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${AUTH_PATH}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      ...init,
    });
  } catch (cause) {
    throw new ApiError('NETWORK', 0, cause instanceof Error ? cause.message : 'Network error');
  }
  if (!response.ok) {
    throw toApiError(response.status, await response.json().catch(() => undefined));
  }
}

/**
 * Asks for a login link (BR-AUTH-1). The link signs in and lands on /auth/callback, which then goes to
 * `next` (a path inside the app); a used or expired link lands there with `?error=`.
 */
export function requestMagicLink(
  email: string,
  { locale, next }: { locale: Locale; next?: string },
) {
  const callback = new URL(CALLBACK_PATH, window.location.origin);
  const errorCallbackURL = callback.href;
  if (next) callback.searchParams.set('next', next);
  return post('/sign-in/magic-link', {
    // A new user's email has no stored locale yet; the API picks the email language from this header.
    headers: { 'content-type': 'application/json', 'accept-language': locale },
    body: JSON.stringify({ email, callbackURL: callback.href, errorCallbackURL }),
  });
}

/** Ends the session. Already signed out (401) counts as done. */
export async function signOut() {
  try {
    await post('/sign-out');
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) throw error;
  }
}

/** Where to go after login: `next` when it is a path in this app, otherwise /home. */
export function safeNext(next: string | null | undefined): string {
  // `//host` and `/\host` are protocol-relative URLs to another site.
  return next && /^\/(?![/\\])/.test(next) ? next : '/home';
}
