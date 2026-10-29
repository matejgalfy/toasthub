import { ClanRole } from './clan.js';

// The clan role rules of SPEC §3 and §4.8, shared so the web offers only what the api allows.

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

/** Whether `actor` may do `action` to at least one role, before a target is known. */
export function mayActOnMembers(actor: ClanRole | null, action: MemberAction): boolean {
  return actor !== null && memberActionTargets[action][actor] !== undefined;
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
