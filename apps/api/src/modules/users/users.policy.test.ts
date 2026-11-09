import { describe, expect, it } from 'vitest';

import { canSeePhoto, canSeeToast, type PhotoFacts } from './users.policy';

function photo(facts: Partial<PhotoFacts> = {}): PhotoFacts {
  return { hasPhoto: true, hidden: false, removed: false, ...facts };
}

describe('canSeePhoto', () => {
  it('shows a photo of any user (every profile is public, D67)', () => {
    expect(canSeePhoto(photo())).toBe(true);
  });

  it.each([
    ['no photo', { hasPhoto: false }],
    ['a hidden photo', { hidden: true }],
    ['a removed toast', { removed: true }],
  ] as const)('never shows %s', (_, facts) => {
    expect(canSeePhoto(photo(facts))).toBe(false);
  });
});

describe('canSeeToast', () => {
  it('shows a toast with or without a photo, also one whose photo an admin hid', () => {
    expect(canSeeToast(photo())).toBe(true);
    expect(canSeeToast(photo({ hasPhoto: false }))).toBe(true);
    expect(canSeeToast(photo({ hidden: true }))).toBe(true);
  });

  it('never shows a removed toast', () => {
    expect(canSeeToast(photo({ removed: true }))).toBe(false);
  });
});
