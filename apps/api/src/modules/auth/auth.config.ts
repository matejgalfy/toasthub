import { Locale, ProfileVisibility, UserRole, UserStatus } from '@toasthub/shared';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { bearer } from 'better-auth/plugins/bearer';
import { magicLink } from 'better-auth/plugins/magic-link';
import { eq } from 'drizzle-orm';

import type { Env } from '../../config/env';
import type { Database } from '../../db/db.module';
import * as authSchema from '../../db/schema/auth';
import type { MagicLinkMessage } from '../mail/mail.service';
import { localeFromAcceptLanguage, MAGIC_LINK_TTL_MINUTES } from '../mail/magic-link-email';
import { consumeRateLimit, emailRateLimitKey } from './email-rate-limit';

// Must match API_PREFIX in app.setup.ts (not imported, so the Better Auth CLI can load this file).
export const AUTH_BASE_PATH = '/api/v1/auth';

/**
 * Set by our Fastify route from `request.ip` and overwritten on every request, so the per-IP limit can't
 * be dodged by sending a fake `X-Forwarded-For`. Which proxies Fastify trusts decides `request.ip`.
 */
export const CLIENT_IP_HEADER = 'x-toasthub-client-ip';

const DAY_SECONDS = 24 * 60 * 60;
const HOUR_SECONDS = 60 * 60;

// BR-AUTH-5. The per-IP limit is Better Auth's own; Better Auth has no per-email key, so that one is ours.
export const MAGIC_LINK_IP_LIMIT = { window: HOUR_SECONDS, max: 20 };
export const MAGIC_LINK_EMAIL_LIMIT = { window: HOUR_SECONDS, max: 5 };

export interface AuthLogger {
  debug(message: string, ...args: unknown[]): void;
  log(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface AuthDeps {
  db: Database;
  env: Pick<Env, 'NODE_ENV' | 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL' | 'WEB_ORIGIN'>;
  sendMagicLink: (message: MagicLinkMessage) => Promise<void>;
  logger: AuthLogger;
}

async function findUserByEmail(db: Database, email: string) {
  // `email` is citext, so this matches regardless of case.
  const [row] = await db
    .select({ status: authSchema.user.status, locale: authSchema.user.locale })
    .from(authSchema.user)
    .where(eq(authSchema.user.email, email))
    .limit(1);
  return row;
}

async function isActiveUser(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: authSchema.user.status })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId))
    .limit(1);
  return row?.status === UserStatus.active;
}

export function createAuth({ db, env, sendMagicLink, logger }: AuthDeps) {
  const secureCookies = env.NODE_ENV === 'production' || env.BETTER_AUTH_URL.startsWith('https:');

  return betterAuth({
    appName: 'Toasthub',
    baseURL: env.BETTER_AUTH_URL,
    basePath: AUTH_BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
    telemetry: { enabled: false },
    logger: {
      log: (level, message, ...args: unknown[]) => {
        logger[level === 'info' ? 'log' : level](message, ...args);
      },
    },

    user: {
      // SPEC §7 User: Better Auth's `name` is our `display_name` column.
      fields: { name: 'displayName' },
      // Nothing here is writable through Better Auth: profile fields change only through PATCH /me, role
      // and status only through admin.
      additionalFields: {
        avatarId: { type: 'number', required: false, input: false },
        locale: {
          type: Object.values(Locale),
          required: false,
          defaultValue: Locale.en,
          input: false,
        },
        profileVisibility: {
          type: Object.values(ProfileVisibility),
          required: false,
          defaultValue: ProfileVisibility.public,
          input: false,
        },
        role: {
          type: Object.values(UserRole),
          required: false,
          defaultValue: UserRole.user,
          input: false,
        },
        status: {
          type: Object.values(UserStatus),
          required: false,
          defaultValue: UserStatus.active,
          input: false,
        },
      },
    },

    // BR-AUTH-4: 30 days, sliding, refreshed at most once a day. No cookie cache, so a revoked session
    // stops working on the next request.
    session: { expiresIn: 30 * DAY_SECONDS, updateAge: DAY_SECONDS },

    rateLimit: {
      // Better Auth only enables it in production by default.
      enabled: true,
      storage: 'database',
      customRules: { '/sign-in/magic-link': MAGIC_LINK_IP_LIMIT },
    },

    advanced: {
      // Explicit, because Better Auth skips its origin and callback-URL checks under NODE_ENV=test by
      // default, and tests should see production behaviour.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      cookiePrefix: 'toasthub',
      useSecureCookies: secureCookies,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: secureCookies },
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      // Postgres generates the IDs (`uuidv7()` column defaults).
      database: { generateId: 'uuid' },
    },

    databaseHooks: {
      user: {
        create: {
          // The sign-in body may carry a `name`; ignore it so the display name is only ever set (and
          // validated) by onboarding. An empty name means "not onboarded".
          before: (user) => Promise.resolve({ data: { ...user, name: '' } }),
        },
      },
      session: {
        create: {
          // Banned users can't log in: no session is created, and verify redirects with an error.
          before: (session) => isActiveUser(db, session.userId),
        },
      },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/magic-link') return;
        const email: unknown = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email !== 'string') return;
        const result = await consumeRateLimit(db, emailRateLimitKey(email), MAGIC_LINK_EMAIL_LIMIT);
        if (!result.allowed) {
          throw new APIError(
            'TOO_MANY_REQUESTS',
            { message: 'Too many requests. Please try again later.' },
            { 'X-Retry-After': String(result.retryAfter) },
          );
        }
      }),
    },

    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_MINUTES * 60,
        // BR-AUTH-2: only a hash of the token is stored; the plugin consumes it on first use.
        storeToken: 'hashed',
        sendMagicLink: async ({ email, url }, ctx) => {
          const existing = await findUserByEmail(db, email);
          // Same response as for everyone else (BR-AUTH-1), but a banned user gets no link.
          if (existing?.status === UserStatus.banned) return;
          const locale =
            existing?.locale ??
            localeFromAcceptLanguage(ctx?.request?.headers.get('accept-language'));
          await sendMagicLink({ to: email, url, locale });
        },
      }),
      bearer(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session'];
export type AuthUser = AuthSession['user'];
