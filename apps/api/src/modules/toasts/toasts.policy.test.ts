import { describe, expect, it } from 'vitest';

import { AppError } from '../../common/errors/app-error';
import type { Viewer } from '../users/users.policy';
import { assertCanLike, assertCanReport, type ReactionFacts } from './toasts.policy';

const CLAN = 'clan-a';
const stranger: Viewer = { userId: 'viewer', clanId: null };
const clanmate: Viewer = { userId: 'viewer', clanId: CLAN };

function facts(overrides: Partial<ReactionFacts> = {}): ReactionFacts {
  return {
    owner: { userId: 'owner', profileVisibility: 'clan', clanId: CLAN },
    hasPhoto: true,
    hidden: false,
    removed: false,
    wonToastOfTheWeek: false,
    isLead: true,
    ...overrides,
  };
}

function codeOf(
  assert: (viewer: Viewer, toast: ReactionFacts) => void,
  viewer: Viewer,
  toast: ReactionFacts,
): string | null {
  try {
    assert(viewer, toast);
    return null;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
}

describe('assertCanLike', () => {
  it.each([
    ['a clanmate', clanmate, facts(), null],
    ['a session without a photo', clanmate, facts({ hasPhoto: false }), null],
    ['a session whose photo is hidden', clanmate, facts({ hidden: true }), null],
    [
      'a public profile',
      stranger,
      facts({ owner: { ...facts().owner, profileVisibility: 'public' } }),
      null,
    ],
    ['the own toast', { userId: 'owner', clanId: null }, facts(), null],
    ['a Toast of the week winner', stranger, facts({ wonToastOfTheWeek: true }), null],
    ['a clan-only profile from outside', stranger, facts(), 'FORBIDDEN'],
    ['a removed toast', clanmate, facts({ removed: true }), 'NOT_FOUND'],
    ['a toast that is not the lead', clanmate, facts({ isLead: false }), 'NOT_FOUND'],
  ] as const)('%s → %s', (_, viewer, toast, code) => {
    expect(codeOf(assertCanLike, viewer, toast)).toBe(code);
  });
});

describe('assertCanReport', () => {
  it.each([
    ['a visible photo', clanmate, facts(), null],
    ['a Toast of the week winner', stranger, facts({ wonToastOfTheWeek: true }), null],
    ['a clan-only profile from outside', stranger, facts(), 'FORBIDDEN'],
    ['a removed toast', clanmate, facts({ removed: true }), 'NOT_FOUND'],
    ['a toast without a photo', clanmate, facts({ hasPhoto: false }), 'CONFLICT'],
    ['a hidden photo', clanmate, facts({ hidden: true }), 'CONFLICT'],
    // A photo is only ever on the lead toast, so this one has none.
    [
      'a toast that is not the lead',
      clanmate,
      facts({ isLead: false, hasPhoto: false }),
      'CONFLICT',
    ],
  ] as const)('%s → %s', (_, viewer, toast, code) => {
    expect(codeOf(assertCanReport, viewer, toast)).toBe(code);
  });
});
