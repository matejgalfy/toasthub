import { Inject, Injectable } from '@nestjs/common';
import type { Me, UpdateMe } from '@toasthub/shared';
import { eq } from 'drizzle-orm';

import { AppError } from '../../common/errors/app-error';
import { type Database, DB } from '../../db/db.module';
import { clanMembership, user } from '../../db/schema';

type UserRow = typeof user.$inferSelect;

export function toMe(row: UserRow, clanId: string | null): Me {
  return {
    id: row.id,
    email: row.email,
    // '' until onboarding (Better Auth's `name` can't be null).
    displayName: row.displayName || null,
    avatarId: row.avatarId,
    locale: row.locale,
    profileVisibility: row.profileVisibility,
    role: row.role,
    onboarded: row.displayName !== '',
    clanId,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class MeService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(userId: string): Promise<Me> {
    // One clan per user at most: `user_id` is the membership's primary key.
    const [row] = await this.db
      .select({ user, clanId: clanMembership.clanId })
      .from(user)
      .leftJoin(clanMembership, eq(clanMembership.userId, user.id))
      .where(eq(user.id, userId));
    if (!row) throw new AppError('NOT_FOUND', 'User not found');
    return toMe(row.user, row.clanId);
  }

  async update(userId: string, patch: UpdateMe): Promise<Me> {
    if (Object.keys(patch).length === 0) return this.get(userId);
    const [row] = await this.db
      .update(user)
      .set(patch)
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    if (!row) throw new AppError('NOT_FOUND', 'User not found');
    return this.get(userId);
  }
}
