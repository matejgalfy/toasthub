import { describe, expect, it } from 'vitest';

import { AppError } from '../../common/errors/app-error';
import { assertCanLike, assertCanReport, type ReactionFacts } from './toasts.policy';

function facts(overrides: Partial<ReactionFacts> = {}): ReactionFacts {
  return { hasPhoto: true, hidden: false, removed: false, isLead: true, ...overrides };
}

function codeOf(assert: (toast: ReactionFacts) => void, toast: ReactionFacts): string | null {
  try {
    assert(toast);
    return null;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
}

describe('assertCanLike', () => {
  it.each([
    ['any user’s session', facts(), null],
    ['a session without a photo', facts({ hasPhoto: false }), null],
    ['a session whose photo is hidden', facts({ hidden: true }), null],
    ['a removed toast', facts({ removed: true }), 'NOT_FOUND'],
    ['a toast that is not the lead', facts({ isLead: false }), 'NOT_FOUND'],
  ] as const)('%s → %s', (_, toast, code) => {
    expect(codeOf(assertCanLike, toast)).toBe(code);
  });
});

describe('assertCanReport', () => {
  it.each([
    ['a visible photo', facts(), null],
    ['a removed toast', facts({ removed: true }), 'NOT_FOUND'],
    ['a toast without a photo', facts({ hasPhoto: false }), 'CONFLICT'],
    ['a hidden photo', facts({ hidden: true }), 'CONFLICT'],
    // A photo is only ever on the lead toast, so this one has none.
    ['a toast that is not the lead', facts({ isLead: false, hasPhoto: false }), 'CONFLICT'],
  ] as const)('%s → %s', (_, toast, code) => {
    expect(codeOf(assertCanReport, toast)).toBe(code);
  });
});
