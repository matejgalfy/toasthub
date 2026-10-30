import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminUser,
  AdminUserListQuery,
  AdminUserPage,
  AdminUserResponse,
  UserStatus,
} from '@toasthub/shared';
import { and, desc, eq, ilike, isNull, lt, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error';
import { containsPattern } from '../../common/like-pattern';
import { decodeCursor, toPage } from '../../common/pagination';
import { type Database, DB } from '../../db/db.module';
import { clan, clanMembership, user } from '../../db/schema';
import { AuthService } from '../auth/auth.service';

const keysetSchema = z.object({ id: z.uuid() });

/** Users as admins see them (SPEC §4.13): with the email, for telling apart users of the same name. */
@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly auth: AuthService,
  ) {}

  /** Newest first; `search` matches part of the email or display name. */
  async list({ search, cursor, limit }: AdminUserListQuery): Promise<AdminUserPage> {
    const after = cursor === undefined ? null : decodeCursor(cursor, keysetSchema);
    const pattern = search === undefined ? null : containsPattern(search);
    const rows = await this.rows(
      and(
        pattern === null
          ? undefined
          : or(ilike(user.email, pattern), ilike(user.displayName, pattern)),
        after ? lt(user.id, after.id) : undefined,
      ),
      limit + 1,
    );
    const page = toPage(rows, limit, (row) => ({ id: row.id }));
    return { items: page.items, nextCursor: page.nextCursor };
  }

  /**
   * Bans or unbans a user. A ban revokes every session, so the user is signed out at once; memberships
   * stay, as banned toasts already leave every count (SPEC §12 D52). 409 for the own account.
   */
  async setStatus(adminId: string, userId: string, status: UserStatus): Promise<AdminUserResponse> {
    if (userId === adminId) throw new AppError('CONFLICT', 'You cannot change your own status');
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, userId))
        .for('update');
      if (!row) throw new AppError('NOT_FOUND', 'User not found');
      await this.auth.setStatus(userId, status, tx);
    });
    const [dto] = await this.rows(eq(user.id, userId), 1);
    if (!dto) throw new Error('User disappeared after a status change');
    return { user: dto };
  }

  private async rows(where: SQL | undefined, limit: number): Promise<AdminUser[]> {
    const rows = await this.db
      .select({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarId: user.avatarId,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        clan: { id: clan.id, name: clan.name },
      })
      .from(user)
      .leftJoin(clanMembership, eq(clanMembership.userId, user.id))
      // Deleting a clan removes its memberships; the condition only keeps a stray one out.
      .leftJoin(clan, and(eq(clan.id, clanMembership.clanId), isNull(clan.deletedAt)))
      .where(where)
      // UUID v7: newest first.
      .orderBy(desc(user.id))
      .limit(limit);
    return rows.map((row) => ({
      ...row,
      // '' until onboarding (the auth schema can't store null).
      displayName: row.displayName || null,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
