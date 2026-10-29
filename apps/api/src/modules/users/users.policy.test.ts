import { describe, expect, it } from 'vitest';

import {
  canSeePhoto,
  canSeeToast,
  type PhotoFacts,
  type ProfileOwner,
  profileAccess,
  type Viewer,
} from './users.policy';

const CLAN = 'clan-a';
const OTHER_CLAN = 'clan-b';

const viewer = (clanId: string | null = null): Viewer => ({ userId: 'viewer', clanId });

const owner = (
  profileVisibility: ProfileOwner['profileVisibility'],
  clanId: string | null = null,
): ProfileOwner => ({ userId: 'owner', profileVisibility, clanId });

function photo(of: ProfileOwner, facts: Partial<Omit<PhotoFacts, 'owner'>> = {}): PhotoFacts {
  return {
    owner: of,
    hasPhoto: true,
    hidden: false,
    removed: false,
    wonToastOfTheWeek: false,
    ...facts,
  };
}

describe('profileAccess', () => {
  it.each([
    ['public, stranger', viewer(), owner('public'), 'full'],
    ['public, other clan', viewer(OTHER_CLAN), owner('public', CLAN), 'full'],
    ['clan, clanmate', viewer(CLAN), owner('clan', CLAN), 'full'],
    ['clan, stranger', viewer(), owner('clan', CLAN), 'reduced'],
    ['clan, other clan', viewer(OTHER_CLAN), owner('clan', CLAN), 'reduced'],
    // Two users without a clan are not clanmates.
    ['clan, both without a clan', viewer(), owner('clan'), 'reduced'],
  ] as const)('%s → %s', (_, who, subject, expected) => {
    expect(profileAccess(who, subject)).toBe(expected);
  });

  it('is always full on the own profile', () => {
    expect(profileAccess({ userId: 'owner', clanId: null }, owner('clan'))).toBe('full');
  });
});

describe('canSeePhoto', () => {
  it('follows the profile access for an ordinary photo', () => {
    expect(canSeePhoto(viewer(), photo(owner('public')))).toBe(true);
    expect(canSeePhoto(viewer(CLAN), photo(owner('clan', CLAN)))).toBe(true);
    expect(canSeePhoto(viewer(), photo(owner('clan', CLAN)))).toBe(false);
  });

  it('shows a Toast of the week winner to everyone', () => {
    expect(canSeePhoto(viewer(), photo(owner('clan', CLAN), { wonToastOfTheWeek: true }))).toBe(
      true,
    );
  });

  it.each([
    ['no photo', { hasPhoto: false }],
    ['a hidden photo', { hidden: true }],
    ['a removed toast', { removed: true }],
  ] as const)('never shows %s, not even to its owner or as a winner', (_, facts) => {
    const subject = owner('public');
    const self: Viewer = { userId: subject.userId, clanId: null };
    expect(canSeePhoto(self, photo(subject, facts))).toBe(false);
    expect(canSeePhoto(viewer(), photo(subject, { ...facts, wonToastOfTheWeek: true }))).toBe(
      false,
    );
  });
});

describe('canSeeToast', () => {
  it('follows the profile access, with or without a photo', () => {
    const noPhoto = { hasPhoto: false };
    expect(canSeeToast(viewer(), photo(owner('public'), noPhoto))).toBe(true);
    expect(canSeeToast(viewer(CLAN), photo(owner('clan', CLAN), noPhoto))).toBe(true);
    expect(canSeeToast(viewer(OTHER_CLAN), photo(owner('clan', CLAN), noPhoto))).toBe(false);
  });

  it('shows a toast whose photo an admin hid', () => {
    expect(canSeeToast(viewer(), photo(owner('public'), { hidden: true }))).toBe(true);
  });

  it('shows a Toast of the week winner to everyone', () => {
    expect(canSeeToast(viewer(), photo(owner('clan', CLAN), { wonToastOfTheWeek: true }))).toBe(
      true,
    );
  });

  it('never shows a removed toast, not even to its owner or as a winner', () => {
    const subject = owner('public');
    const self: Viewer = { userId: subject.userId, clanId: null };
    expect(canSeeToast(self, photo(subject, { removed: true }))).toBe(false);
    expect(canSeeToast(viewer(), photo(subject, { removed: true, wonToastOfTheWeek: true }))).toBe(
      false,
    );
  });
});
