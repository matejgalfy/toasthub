import { type ClanRole } from '@toasthub/shared';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../common/errors/app-error';
import {
  assertCanActOnClan,
  assertHasRoom,
  ClanAction,
  canActOnClan,
  canActOnMember,
  MemberAction,
} from './clans.policy';

const ROLES = ['owner', 'officer', 'member', null] as const satisfies readonly (ClanRole | null)[];
const TARGETS = ['owner', 'officer', 'member'] as const satisfies readonly ClanRole[];

/** The error code `assert(...args)` throws, or null when it passes. */
function codeOf<A extends unknown[]>(assert: (...args: A) => void, ...args: A): string | null {
  try {
    assert(...args);
    return null;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
}

describe('canActOnClan', () => {
  // Columns: owner, officer, member, not a member.
  const matrix: Record<ClanAction, readonly boolean[]> = {
    edit: [true, false, false, false],
    delete: [true, false, false, false],
    viewRequests: [true, true, false, false],
    decideRequest: [true, true, false, false],
    viewFeed: [true, true, true, false],
    leave: [false, true, true, false],
  };

  for (const [action, allowed] of Object.entries(matrix)) {
    it.each(ROLES.map((role, i) => [role, allowed[i]] as const))(
      `${action}: %s → %s`,
      (role, expected) => {
        expect(canActOnClan(role, action as ClanAction)).toBe(expected);
      },
    );
  }
});

describe('canActOnMember', () => {
  // Rows: actor; columns: target owner, officer, member.
  const matrix: Record<MemberAction, Record<string, readonly boolean[]>> = {
    kick: {
      owner: [false, true, true],
      officer: [false, false, true],
      member: [false, false, false],
      null: [false, false, false],
    },
    changeRole: {
      owner: [false, true, true],
      officer: [false, false, false],
      member: [false, false, false],
      null: [false, false, false],
    },
    transferOwnership: {
      owner: [false, true, true],
      officer: [false, false, false],
      member: [false, false, false],
      null: [false, false, false],
    },
  };

  for (const [action, rows] of Object.entries(matrix)) {
    for (const actor of ROLES) {
      it.each(TARGETS.map((target, i) => [target, rows[String(actor)]?.[i]] as const))(
        `${action}: ${String(actor)} on %s → %s`,
        (target, expected) => {
          expect(canActOnMember(actor, action as MemberAction, target, false)).toBe(expected);
        },
      );
    }
  }

  it.each(Object.values(MemberAction))('never allows %s on oneself', (action) => {
    for (const role of TARGETS) expect(canActOnMember(role, action, role, true)).toBe(false);
  });
});

describe('assertCanActOnClan', () => {
  it('is a 403 for a non-member', () => {
    expect(codeOf(assertCanActOnClan, null, ClanAction.viewFeed)).toBe('FORBIDDEN');
  });

  it('is a 409 for an owner who leaves (BR-CLAN-4)', () => {
    expect(codeOf(assertCanActOnClan, 'owner', ClanAction.leave)).toBe('CONFLICT');
  });

  it('is a 403 for a role that may not act', () => {
    expect(codeOf(assertCanActOnClan, 'officer', ClanAction.edit)).toBe('FORBIDDEN');
    expect(codeOf(assertCanActOnClan, 'member', ClanAction.decideRequest)).toBe('FORBIDDEN');
  });

  it('passes an allowed action', () => {
    expect(codeOf(assertCanActOnClan, 'officer', ClanAction.decideRequest)).toBeNull();
    expect(codeOf(assertCanActOnClan, 'member', ClanAction.leave)).toBeNull();
  });
});

describe('assertHasRoom', () => {
  it.each([
    [9, 10, null],
    [10, 10, 'CONFLICT'],
    [11, 10, 'CONFLICT'],
    [0, 1, null],
  ])('%i of %i members → %s', (count, max, code) => {
    expect(codeOf(assertHasRoom, count, max)).toBe(code);
  });
});
