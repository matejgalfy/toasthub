import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AVATAR_COUNT } from '@toasthub/shared';

import { AVATARS, UserAvatar, initials } from './user-avatar';

describe('initials', () => {
  it.each([
    ['Toast Tester', 'TT'],
    ['ann', 'A'],
    ['  Ján  Peter   Novák ', 'JN'],
    ['šimon ďurček', 'ŠĎ'],
    // Decomposed (NFD) accents still give one letter.
    ['Šimon', 'Š'],
    ['🍞 Lover', '🍞L'],
    ['', '?'],
    [null, '?'],
  ])('%j → %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe('UserAvatar', () => {
  it('has a picture for every avatar id, in id order', () => {
    expect(AVATARS.map(({ id }) => id)).toEqual(
      Array.from({ length: AVATAR_COUNT }, (_, index) => index + 1),
    );
  });

  it('shows the chosen picture, named after the user', () => {
    render(<UserAvatar name="Toast Tester" avatarId={3} />);
    const avatar = screen.getByRole('img', { name: 'Toast Tester' });
    expect(avatar).toHaveAttribute('src', AVATARS[2].src);
  });

  it('falls back to initials without an avatar choice', () => {
    render(<UserAvatar name="Toast Tester" avatarId={null} />);
    expect(screen.getByRole('img', { name: 'Toast Tester' })).toHaveTextContent('TT');
  });
});
