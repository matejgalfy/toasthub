import type { IncomingHttpHeaders } from 'node:http';

import { Inject, Injectable } from '@nestjs/common';
import { UserStatus } from '@toasthub/shared';
import { eq } from 'drizzle-orm';

import { type Database, DB, type DbExecutor } from '../../db/db.module';
import { session, user } from '../../db/schema';
import type { Auth, AuthSession } from './auth.config';
import { toWebHeaders } from './auth.handler';

export const AUTH = Symbol('AUTH');

export interface ResolvedSession extends AuthSession {
  /** Set when Better Auth slid the session forward; forward it so the cookie expiry moves too. */
  setCookie: string[];
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DB) private readonly db: Database,
  ) {}

  /** The session behind a cookie or `Authorization: Bearer` header, or null. Status is not checked here. */
  async getSession(headers: IncomingHttpHeaders): Promise<ResolvedSession | null> {
    const { headers: responseHeaders, response } = await this.auth.api.getSession({
      headers: toWebHeaders(headers),
      returnHeaders: true,
    });
    return response ? { ...response, setCookie: responseHeaders.getSetCookie() } : null;
  }

  /** Signs the user out everywhere. */
  async revokeSessions(userId: string, db: DbExecutor = this.db): Promise<void> {
    await db.delete(session).where(eq(session.userId, userId));
  }

  /**
   * Bans or unbans a user. A ban also revokes every session; together with the session-create hook and
   * the guard's status check, a banned user is locked out at once. Pass a transaction to combine it with
   * other admin changes.
   */
  async setStatus(userId: string, status: UserStatus, db: DbExecutor = this.db): Promise<void> {
    await db.update(user).set({ status }).where(eq(user.id, userId));
    if (status === UserStatus.banned) await this.revokeSessions(userId, db);
  }
}
