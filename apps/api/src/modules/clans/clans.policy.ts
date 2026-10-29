import {
  ClanAction,
  ClanRole,
  canActOnClan,
  canActOnMember,
  type MemberAction,
  mayActOnMembers,
} from '@toasthub/shared';

import { AppError } from '../../common/errors/app-error';

// The api's side of the clan role rules: the pure tables live in `shared` (`clan-policy.ts`), so the web
// offers the same actions.
export { ClanAction, canActOnClan, canActOnMember, MemberAction } from '@toasthub/shared';

/** 403 for a non-member or a role that may not do it; 409 for an Owner who tries to leave. */
export function assertCanActOnClan(role: ClanRole | null, action: ClanAction): void {
  if (role === null) throw new AppError('FORBIDDEN', 'You are not a member of this clan');
  if (action === ClanAction.leave && role === ClanRole.owner) {
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
  if (!mayActOnMembers(actor, action)) {
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
