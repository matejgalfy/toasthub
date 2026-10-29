import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InitialsAvatar, initials } from './initials-avatar';

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

describe('InitialsAvatar', () => {
  it('is an image named after the user, coloured by the chosen avatar', () => {
    render(<InitialsAvatar name="Toast Tester" avatarId={3} />);
    const avatar = screen.getByRole('img', { name: 'Toast Tester' });
    expect(avatar).toHaveTextContent('TT');
    expect(avatar).toHaveClass('bg-avatar-3');
  });

  it('falls back to a neutral colour without an avatar choice', () => {
    render(<InitialsAvatar name="Toast Tester" avatarId={null} />);
    expect(screen.getByRole('img')).toHaveClass('bg-secondary');
  });
});
