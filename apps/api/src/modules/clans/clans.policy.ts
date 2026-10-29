import { ClanRole } from '@toasthub/shared';

import { AppError } from '../../common/errors/app-error';

// The clan role rules of SPEC §3 and §4.8, without the database.

/** Actions on the clan itself. */
export const ClanAction = {
  edit: 'edit',
  delete: 'delete',
  viewRequests: 'viewRequests',
  decideRequest: 'decideRequest',
  viewFeed: 'viewFeed',
  leave: 'leave',
} as const;
export type ClanAction = (typeof ClanAction)[keyof typeof ClanAction];

/** Actions on another member of the same clan. */
export const MemberAction = {
  kick: 'kick',
  changeRole: 'changeRole',
  transferOwnership: 'transferOwnership',
} as const;
export type MemberAction = (typeof MemberAction)[keyof typeof MemberAction];

const { owner, officer, member } = ClanRole;

const clanActionRoles: Record<ClanAction, readonly ClanRole[]> = {
  edit: [owner],
  delete: [owner],
  viewRequests: [owner, officer],
  decideRequest: [owner, officer],
  viewFeed: [owner, officer, member],
  // The Owner has to transfer ownership or delete the clan first (BR-CLAN-4).
  leave: [officer, member],
};

// Which target roles each actor role may act on.
const memberActionTargets: Record<MemberAction, Partial<Record<ClanRole, readonly ClanRole[]>>> = {
  kick: { owner: [officer, member], officer: [member] },
  changeRole: { owner: [officer, member] },
  transferOwnership: { owner: [officer, member] },
};

/** `role` is the actor's role in the clan, null when not a member. */
export function canActOnClan(role: ClanRole | null, action: ClanAction): boolean {
  return role !== null && clanActionRoles[action].includes(role);
}

/** Never on oneself: leaving is the own way out, and the Owner hands over by a transfer. */
export function canActOnMember(
  actor: ClanRole | null,
  action: MemberAction,
  target: ClanRole,
  self: boolean,
): boolean {
  if (actor === null || self) return false;
  return memberActionTargets[action][actor]?.includes(target) ?? false;
}

/** 403 for a non-member or a role that may not do it; 409 for an Owner who tries to leave. */
export function assertCanActOnClan(role: ClanRole | null, action: ClanAction): void {
  if (role === null) throw new AppError('FORBIDDEN', 'You are not a member of this clan');
  if (action === ClanAction.leave && role === owner) {
    throw new AppError(
      'CONFLICT',
      'The owner must transfer ownership or delete the clan before leaving',
    );
  }
  if (!canActOnClan(role, action)) {
    throw new AppError('FORBIDDEN', 'Your clan role does not allow this');
  }
}

/**
 * 403 for a non-member or a role that may not do `action` to anyone. Checked before the target is looked
 * up, so a Member gets a 403 rather than learning who else is in the clan.
 */
export function assertMayActOnMembers(actor: ClanRole | null, action: MemberAction): void {
  if (actor === null) throw new AppError('FORBIDDEN', 'You are not a member of this clan');
  if (memberActionTargets[action][actor] === undefined) {
    throw new AppError('FORBIDDEN', 'Your clan role does not allow this');
  }
}

/** 403 when the actor may not do `action` to this member, or to themselves. */
export function assertCanActOnMember(
  actor: ClanRole | null,
  action: MemberAction,
  target: ClanRole,
  self: boolean,
): void {
  if (!canActOnMember(actor, action, target, self)) {
    throw new AppError(
      'FORBIDDEN',
      self ? 'You cannot do this to yourself' : 'Your clan role does not allow this',
    );
  }
}

/** 409 when the clan has no room for another member (BR-CLAN-3). */
export function assertHasRoom(memberCount: number, maxMembers: number): void {
  if (memberCount >= maxMembers) throw new AppError('CONFLICT', 'This clan is full');
}
