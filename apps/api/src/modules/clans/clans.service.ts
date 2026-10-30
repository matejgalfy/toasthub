import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AchievementCode,
  AchievementTrigger,
  type AdminUpdateClan,
  type Clan,
  type ClanDetail,
  type ClanJoinRequest,
  type ClanJoinRequestList,
  type ClanJoinRequestResponse,
  type ClanListQuery,
  type ClanMember,
  type ClanMembership,
  type ClanMembershipResponse,
  type ClanPage,
  type ClanResponse,
  ClanRole,
  type ClanTransferResponse,
  type CreateClan,
  type CreateClanResponse,
  JoinRequestStatus,
  type UpdateClan,
  type UpdateClanMember,
  type UserSummary,
} from '@toasthub/shared';
import { and, asc, eq, ilike, isNull, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error';
import { containsPattern } from '../../common/like-pattern';
import { decodeCursor, toPage } from '../../common/pagination';
import { type Database, DB, type DbExecutor } from '../../db/db.module';
import { uniqueViolation } from '../../db/pg-error';
import { clan, clanJoinRequest, clanMembership, user } from '../../db/schema';
import { AchievementsService } from '../achievements/achievements.service';
import { SettingsService } from '../settings/settings.service';
import { StreaksService } from '../streaks/streaks.service';
import {
  assertCanActOnClan,
  assertCanActOnMember,
  assertHasRoom,
  assertMayActOnMembers,
  ClanAction,
  MemberAction,
} from './clans.policy';

type ClanRow = typeof clan.$inferSelect;
type LockMode = 'update' | 'share';

const memberCountOf = sql<number>`(
  SELECT count(*)::int FROM ${clanMembership} WHERE ${clanMembership.clanId} = ${clan.id}
)`;
const sortName = sql<string>`lower(${clan.name})`;
const keysetSchema = z.object({ name: z.string(), id: z.uuid() });

const userSummaryColumns = {
  id: user.id,
  displayName: user.displayName,
  avatarId: user.avatarId,
};

const requestColumns = {
  id: clanJoinRequest.id,
  clanId: clanJoinRequest.clanId,
  status: clanJoinRequest.status,
  createdAt: clanJoinRequest.createdAt,
  user: userSummaryColumns,
};
interface RequestRow {
  id: string;
  clanId: string;
  status: JoinRequestStatus;
  createdAt: Date;
  user: UserSummary;
}

const ALREADY_IN_A_CLAN = 'You are already in a clan';
const NAME_TAKEN = 'A clan with this name already exists';

function toClan(row: ClanRow, memberCount: number): Clan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    avatarId: row.avatarId,
    memberCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRequest(row: RequestRow): ClanJoinRequest {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

// An empty description is stored as none.
function descriptionValue(description: string | null | undefined): string | null | undefined {
  return description === '' ? null : description;
}

/** Clans, their members and join requests (SPEC §4.8). */
@Injectable()
export class ClansService {
  private readonly logger = new Logger(ClansService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
    private readonly settings: SettingsService,
    private readonly streaks: StreaksService,
  ) {}

  /** Clans by name, A–Z, optionally only those whose name contains `search`. */
  async list({ search, cursor, limit }: ClanListQuery): Promise<ClanPage> {
    const after = cursor === undefined ? null : decodeCursor(cursor, keysetSchema);
    const rows = await this.db
      .select({ clan, memberCount: memberCountOf, sortName })
      .from(clan)
      .where(
        and(
          isNull(clan.deletedAt),
          search === undefined ? undefined : ilike(clan.name, containsPattern(search)),
          after ? sql`(${sortName}, ${clan.id}) > (${after.name}, ${after.id}::uuid)` : undefined,
        ),
      )
      .orderBy(sortName, asc(clan.id))
      .limit(limit + 1);
    const page = toPage(rows, limit, (row) => ({ name: row.sortName, id: row.clan.id }));
    return {
      items: page.items.map((row) => toClan(row.clan, row.memberCount)),
      nextCursor: page.nextCursor,
    };
  }

  /** Creates a clan with the caller as its Owner and cancels the caller's pending join request. */
  async create(userId: string, body: CreateClan): Promise<CreateClanResponse> {
    let row: ClanRow;
    try {
      row = await this.db.transaction(async (tx) => {
        await this.assertOnboarded(tx, userId);
        if (await this.membershipOf(tx, userId)) throw new AppError('CONFLICT', ALREADY_IN_A_CLAN);
        const [created] = await tx
          .insert(clan)
          .values({
            name: body.name,
            description: descriptionValue(body.description) ?? null,
            avatarId: body.avatarId ?? null,
          })
          .returning();
        if (!created) throw new Error('Clan insert returned no row');
        await tx
          .insert(clanMembership)
          .values({ userId, clanId: created.id, role: ClanRole.owner });
        await this.cancelPendingRequests(tx, eq(clanJoinRequest.userId, userId), userId);
        return created;
      });
    } catch (error) {
      throw this.mapConflict(error, ALREADY_IN_A_CLAN);
    }
    return { clan: toClan(row, 1), newAchievements: await this.evaluateJoined(userId) };
  }

  /** Any signed-in user may look at a clan; the caller's role and pending request come with it. */
  async get(viewerId: string, clanId: string): Promise<ClanDetail> {
    const row = await this.loadClan(this.db, clanId);
    const [members, [myRequest], streak] = await Promise.all([
      this.db
        .select({
          user: userSummaryColumns,
          role: clanMembership.role,
          joinedAt: clanMembership.joinedAt,
        })
        .from(clanMembership)
        .innerJoin(user, eq(user.id, clanMembership.userId))
        .where(eq(clanMembership.clanId, clanId))
        // The enum is declared owner, officer, member.
        .orderBy(clanMembership.role, clanMembership.joinedAt, user.id),
      this.requests(
        this.db,
        and(
          eq(clanJoinRequest.clanId, clanId),
          eq(clanJoinRequest.userId, viewerId),
          eq(clanJoinRequest.status, JoinRequestStatus.pending),
        ),
      ),
      this.streaks.forClan(clanId),
    ]);
    const memberDtos: ClanMember[] = members.map((m) => ({
      ...m,
      joinedAt: m.joinedAt.toISOString(),
    }));
    return {
      clan: toClan(row, members.length),
      streak,
      members: memberDtos,
      myRole: members.find((m) => m.user.id === viewerId)?.role ?? null,
      myRequest: myRequest ? toRequest(myRequest) : null,
    };
  }

  /** Owner only. 409 when the new name is taken. */
  async update(userId: string, clanId: string, patch: UpdateClan): Promise<ClanResponse> {
    return this.edit(clanId, patch, async (tx) => {
      assertCanActOnClan(await this.roleIn(tx, clanId, userId), ClanAction.edit);
    });
  }

  /**
   * An admin's edit of any clan (SPEC §4.13), which can also hand it to another current member (404 for
   * anyone else). The former Owner stays as an Officer, as after a transfer.
   */
  async adminUpdate(clanId: string, { ownerId, ...patch }: AdminUpdateClan): Promise<ClanResponse> {
    return this.edit(clanId, patch, async (tx) => {
      if (ownerId === undefined) return;
      const target = await this.roleIn(tx, clanId, ownerId, true);
      if (target === null) throw new AppError('NOT_FOUND', 'Member not found');
      if (target !== ClanRole.owner) await this.handOver(tx, clanId, ownerId);
    });
  }

  /**
   * Owner only. A soft delete that frees the name, removes every membership and cancels the pending
   * requests. Toasts keep their `clan_id` (SPEC §12 D9).
   */
  async delete(userId: string, clanId: string): Promise<void> {
    await this.remove(clanId, userId, async (tx) => {
      assertCanActOnClan(await this.roleIn(tx, clanId, userId), ClanAction.delete);
    });
  }

  /** An admin's delete of any clan; the admin is recorded as who cancelled its pending requests. */
  async adminDelete(adminId: string, clanId: string): Promise<void> {
    await this.remove(clanId, adminId, async () => {});
  }

  /** Asks to join (BR-CLAN-2). 409 when in a clan, with a pending request anywhere, or the clan is full. */
  async join(userId: string, clanId: string): Promise<ClanJoinRequestResponse> {
    let requestId: string;
    try {
      requestId = await this.db.transaction(async (tx) => {
        await this.assertOnboarded(tx, userId);
        // Shared, so a delete waits for this request and then cancels it.
        await this.loadClan(tx, clanId, 'share');
        if (await this.membershipOf(tx, userId)) throw new AppError('CONFLICT', ALREADY_IN_A_CLAN);
        const [pending] = await tx
          .select({ id: clanJoinRequest.id })
          .from(clanJoinRequest)
          .where(
            and(
              eq(clanJoinRequest.userId, userId),
              eq(clanJoinRequest.status, JoinRequestStatus.pending),
            ),
          );
        if (pending) throw this.pendingConflict();
        assertHasRoom(await this.memberCount(tx, clanId), await this.maxMembers(tx));
        const [created] = await tx
          .insert(clanJoinRequest)
          .values({ clanId, userId })
          .returning({ id: clanJoinRequest.id });
        if (!created) throw new Error('Join request insert returned no row');
        return created.id;
      });
    } catch (error) {
      throw this.mapConflict(error, ALREADY_IN_A_CLAN);
    }
    const [row] = await this.requests(this.db, eq(clanJoinRequest.id, requestId));
    if (!row) throw new Error('Join request disappeared');
    return { request: toRequest(row) };
  }

  /** Pending requests, oldest first. Officers and the Owner only. */
  async listRequests(userId: string, clanId: string): Promise<ClanJoinRequestList> {
    await this.authorize(userId, clanId, ClanAction.viewRequests);
    const rows = await this.requests(
      this.db,
      and(
        eq(clanJoinRequest.clanId, clanId),
        eq(clanJoinRequest.status, JoinRequestStatus.pending),
      ),
    );
    return { items: rows.map(toRequest) };
  }

  /**
   * Makes the requester a Member. The clan row is locked, so concurrent approvals see each other's members
   * and never overfill the clan (BR-CLAN-3).
   */
  async approve(
    actorId: string,
    clanId: string,
    requestId: string,
  ): Promise<ClanMembershipResponse> {
    let joinedId: string;
    try {
      joinedId = await this.db.transaction(async (tx) => {
        await this.loadClan(tx, clanId, 'update');
        assertCanActOnClan(await this.roleIn(tx, clanId, actorId), ClanAction.decideRequest);
        const request = await this.loadPendingRequest(tx, clanId, requestId);
        // Creating a clan cancels the own request, so this only guards against a bug elsewhere.
        if (await this.membershipOf(tx, request.userId)) {
          throw new AppError('CONFLICT', 'This user is already in a clan');
        }
        assertHasRoom(await this.memberCount(tx, clanId), await this.maxMembers(tx));
        await tx
          .insert(clanMembership)
          .values({ userId: request.userId, clanId, role: ClanRole.member });
        // The one-pending index makes this the user's only pending request (BR-CLAN-5).
        await this.decide(tx, requestId, JoinRequestStatus.approved, actorId);
        return request.userId;
      });
    } catch (error) {
      throw this.mapConflict(error, 'This user is already in a clan');
    }
    // The approver gets no achievement list; the new member sees the badge on their profile.
    await this.evaluateJoined(joinedId);
    return { membership: await this.membership(this.db, clanId, joinedId) };
  }

  /** Officers and the Owner only. */
  async reject(actorId: string, clanId: string, requestId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.loadClan(tx, clanId, 'share');
      assertCanActOnClan(await this.roleIn(tx, clanId, actorId), ClanAction.decideRequest);
      await this.loadPendingRequest(tx, clanId, requestId);
      await this.decide(tx, requestId, JoinRequestStatus.rejected, actorId);
    });
  }

  /** Cancels the caller's pending request, if there is one (BR-CLAN-5). */
  async cancelMyRequest(userId: string): Promise<void> {
    await this.cancelPendingRequests(this.db, eq(clanJoinRequest.userId, userId), userId);
  }

  /** Promotes a Member to Officer or demotes an Officer. Owner only. */
  async updateMember(
    actorId: string,
    clanId: string,
    targetId: string,
    role: UpdateClanMember['role'],
  ): Promise<ClanMembershipResponse> {
    await this.db.transaction(async (tx) => {
      const current = await this.lockTarget(tx, clanId, actorId, targetId, MemberAction.changeRole);
      if (current === role) return;
      await tx.update(clanMembership).set({ role }).where(eq(clanMembership.userId, targetId));
    });
    return { membership: await this.membership(this.db, clanId, targetId) };
  }

  /** Removes a member. The Owner may kick Officers and Members, an Officer only Members. */
  async kick(actorId: string, clanId: string, targetId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockTarget(tx, clanId, actorId, targetId, MemberAction.kick);
      await tx.delete(clanMembership).where(eq(clanMembership.userId, targetId));
    });
  }

  /** Hands the clan to another member; the former Owner stays as an Officer. */
  async transfer(actorId: string, clanId: string, targetId: string): Promise<ClanTransferResponse> {
    try {
      await this.db.transaction(async (tx) => {
        await this.lockTarget(tx, clanId, actorId, targetId, MemberAction.transferOwnership);
        await this.handOver(tx, clanId, targetId);
      });
    } catch (error) {
      throw this.mapConflict(error);
    }
    const [owner, previousOwner] = await Promise.all([
      this.membership(this.db, clanId, targetId),
      this.membership(this.db, clanId, actorId),
    ]);
    return { owner, previousOwner };
  }

  /** 404 for an unknown or deleted clan. */
  async assertExists(clanId: string): Promise<void> {
    await this.loadClan(this.db, clanId);
  }

  /** 404 for an unknown or deleted clan, 403 unless the user's role allows `action`. */
  async authorize(userId: string, clanId: string, action: ClanAction): Promise<void> {
    await this.loadClan(this.db, clanId);
    assertCanActOnClan(await this.roleIn(this.db, clanId, userId), action);
  }

  /** Members and Officers only; the Owner gets a 409 (BR-CLAN-4). Toasts stay with the clan (D9). */
  async leave(userId: string, clanId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.loadClan(tx, clanId, 'share');
      assertCanActOnClan(await this.roleIn(tx, clanId, userId, true), ClanAction.leave);
      await tx.delete(clanMembership).where(eq(clanMembership.userId, userId));
    });
  }

  /** Locks the clan, runs `authorize` and applies the patch. 409 when the new name is taken. */
  private async edit(
    clanId: string,
    patch: UpdateClan,
    authorize: (tx: DbExecutor) => Promise<void>,
  ): Promise<ClanResponse> {
    let row: ClanRow;
    try {
      row = await this.db.transaction(async (tx) => {
        const current = await this.loadClan(tx, clanId, 'update');
        await authorize(tx);
        const changes = {
          name: patch.name,
          description: descriptionValue(patch.description),
          avatarId: patch.avatarId,
        };
        if (Object.values(changes).every((value) => value === undefined)) return current;
        const [updated] = await tx.update(clan).set(changes).where(eq(clan.id, clanId)).returning();
        if (!updated) throw new Error('Clan update returned no row');
        return updated;
      });
    } catch (error) {
      throw this.mapConflict(error);
    }
    return { clan: toClan(row, await this.memberCount(this.db, clanId)) };
  }

  /** Locks the clan, runs `authorize` and deletes it; `deciderId` cancels its pending requests. */
  private async remove(
    clanId: string,
    deciderId: string,
    authorize: (tx: DbExecutor) => Promise<void>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.loadClan(tx, clanId, 'update');
      await authorize(tx);
      await tx
        .update(clan)
        .set({ deletedAt: sql`now()` })
        .where(eq(clan.id, clanId));
      await tx.delete(clanMembership).where(eq(clanMembership.clanId, clanId));
      await this.cancelPendingRequests(tx, eq(clanJoinRequest.clanId, clanId), deciderId);
    });
  }

  /**
   * Makes a member the Owner (the caller holds the clan lock). The current Owner is demoted to Officer
   * first, so the one-owner index holds after each statement.
   */
  private async handOver(tx: DbExecutor, clanId: string, targetId: string): Promise<void> {
    await tx
      .update(clanMembership)
      .set({ role: ClanRole.officer })
      .where(and(eq(clanMembership.clanId, clanId), eq(clanMembership.role, ClanRole.owner)));
    await tx
      .update(clanMembership)
      .set({ role: ClanRole.owner })
      .where(eq(clanMembership.userId, targetId));
  }

  /** 404 for an unknown or deleted clan. */
  private async loadClan(db: DbExecutor, clanId: string, lock?: LockMode): Promise<ClanRow> {
    const query = db
      .select()
      .from(clan)
      .where(and(eq(clan.id, clanId), isNull(clan.deletedAt)));
    const [row] = lock ? await query.for(lock) : await query;
    if (!row) throw new AppError('NOT_FOUND', 'Clan not found');
    return row;
  }

  /** The user's role in this clan, null when not a member of it. */
  private async roleIn(
    db: DbExecutor,
    clanId: string,
    userId: string,
    lock = false,
  ): Promise<ClanRole | null> {
    const query = db
      .select({ role: clanMembership.role })
      .from(clanMembership)
      .where(and(eq(clanMembership.userId, userId), eq(clanMembership.clanId, clanId)));
    const [row] = lock ? await query.for('update') : await query;
    return row?.role ?? null;
  }

  /**
   * Locks the clan and the target's membership and returns the target's role. Checks run 404 (clan) → 403
   * (the actor's role can't do this to anyone) → 404 (not a member here) → 403 (not to this member).
   */
  private async lockTarget(
    tx: DbExecutor,
    clanId: string,
    actorId: string,
    targetId: string,
    action: MemberAction,
  ): Promise<ClanRole> {
    await this.loadClan(tx, clanId, 'update');
    const actor = await this.roleIn(tx, clanId, actorId);
    assertMayActOnMembers(actor, action);
    const target = await this.roleIn(tx, clanId, targetId, true);
    if (target === null) throw new AppError('NOT_FOUND', 'Member not found');
    assertCanActOnMember(actor, action, target, actorId === targetId);
    return target;
  }

  private async membership(
    db: DbExecutor,
    clanId: string,
    userId: string,
  ): Promise<ClanMembership> {
    const [row] = await db
      .select({
        user: userSummaryColumns,
        role: clanMembership.role,
        joinedAt: clanMembership.joinedAt,
      })
      .from(clanMembership)
      .innerJoin(user, eq(user.id, clanMembership.userId))
      .where(and(eq(clanMembership.userId, userId), eq(clanMembership.clanId, clanId)));
    if (!row) throw new Error('Membership disappeared after a change');
    return { clanId, ...row, joinedAt: row.joinedAt.toISOString() };
  }

  private async membershipOf(db: DbExecutor, userId: string): Promise<{ clanId: string } | null> {
    const [row] = await db
      .select({ clanId: clanMembership.clanId })
      .from(clanMembership)
      .where(eq(clanMembership.userId, userId));
    return row ?? null;
  }

  private async memberCount(db: DbExecutor, clanId: string): Promise<number> {
    return db.$count(clanMembership, eq(clanMembership.clanId, clanId));
  }

  private maxMembers(db: DbExecutor): Promise<number> {
    return this.settings.get('clanMaxMembers', db);
  }

  /** A display name is what members and requests show, so the user must have finished onboarding. */
  private async assertOnboarded(db: DbExecutor, userId: string): Promise<void> {
    const [row] = await db
      .select({ displayName: user.displayName })
      .from(user)
      .where(eq(user.id, userId));
    if (!row || row.displayName === '') {
      throw new AppError('FORBIDDEN', 'Finish onboarding before joining a clan');
    }
  }

  private requests(db: DbExecutor, where: SQL | undefined): Promise<RequestRow[]> {
    return db
      .select(requestColumns)
      .from(clanJoinRequest)
      .innerJoin(user, eq(user.id, clanJoinRequest.userId))
      .where(where)
      .orderBy(clanJoinRequest.id);
  }

  /** 404 unless the request belongs to this clan; 409 once it was decided or cancelled. */
  private async loadPendingRequest(
    tx: DbExecutor,
    clanId: string,
    requestId: string,
  ): Promise<{ userId: string }> {
    const [row] = await tx
      .select({ userId: clanJoinRequest.userId, status: clanJoinRequest.status })
      .from(clanJoinRequest)
      .where(and(eq(clanJoinRequest.id, requestId), eq(clanJoinRequest.clanId, clanId)))
      .for('update');
    if (!row) throw new AppError('NOT_FOUND', 'Join request not found');
    if (row.status !== JoinRequestStatus.pending) {
      throw new AppError('CONFLICT', 'This join request was already decided or cancelled');
    }
    return row;
  }

  private async decide(
    tx: DbExecutor,
    requestId: string,
    status: JoinRequestStatus,
    deciderId: string,
  ): Promise<void> {
    await tx
      .update(clanJoinRequest)
      .set({ status, decidedBy: deciderId, decidedAt: sql`now()` })
      .where(eq(clanJoinRequest.id, requestId));
  }

  private async cancelPendingRequests(
    db: DbExecutor,
    where: SQL,
    deciderId: string,
  ): Promise<void> {
    await db
      .update(clanJoinRequest)
      .set({
        status: JoinRequestStatus.cancelled,
        decidedBy: deciderId,
        decidedAt: sql`now()`,
      })
      .where(and(where, eq(clanJoinRequest.status, JoinRequestStatus.pending)));
  }

  private pendingConflict(): AppError {
    return new AppError('CONFLICT', 'You already have a pending join request');
  }

  /** Turns a unique violation that lost a race into the 409 the up-front checks would have given. */
  private mapConflict(error: unknown, membershipMessage = ALREADY_IN_A_CLAN): unknown {
    switch (uniqueViolation(error)) {
      case 'clan_name_unique':
        return new AppError('CONFLICT', NAME_TAKEN);
      case 'clan_membership_pkey':
        return new AppError('CONFLICT', membershipMessage);
      case 'clan_join_request_one_pending':
        return this.pendingConflict();
      // The clan lock serializes transfers, so only a change outside this service can get here.
      case 'clan_membership_one_owner':
        return new AppError('CONFLICT', 'This clan already has an owner');
      default:
        return error;
    }
  }

  /**
   * Awards `clansman` after the membership is committed. A failure is logged, not thrown: the membership
   * is saved, and a 5xx would make the client retry into a 409.
   */
  private async evaluateJoined(userId: string): Promise<AchievementCode[]> {
    try {
      return await this.achievements.evaluate(userId, { trigger: AchievementTrigger.clan_joined });
    } catch (error) {
      this.logger.error({ err: error, userId }, 'Could not evaluate achievements');
      return [];
    }
  }
}
