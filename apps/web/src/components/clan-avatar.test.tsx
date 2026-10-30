import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CLAN_AVATAR_COUNT } from '@toasthub/shared';

import { CLAN_AVATARS, ClanAvatar } from './clan-avatar';

describe('ClanAvatar', () => {
  it('has a picture for every clan avatar id, in id order', () => {
    expect(CLAN_AVATARS.map(({ id }) => id)).toEqual(
      Array.from({ length: CLAN_AVATAR_COUNT }, (_, index) => index + 1),
    );
  });

  it('shows the chosen picture, named after the clan', () => {
    render(<ClanAvatar name="Breakfast Club" avatarId={2} />);
    const avatar = screen.getByRole('img', { name: 'Breakfast Club' });
    expect(avatar).toHaveAttribute('src', CLAN_AVATARS[1].src);
  });

  it('falls back to initials without a picture', () => {
    render(<ClanAvatar name="Breakfast Club" avatarId={null} />);
    expect(screen.getByRole('img', { name: 'Breakfast Club' })).toHaveTextContent('BC');
  });

  it('stays out of the accessibility tree when decorative', () => {
    render(<ClanAvatar name="Breakfast Club" avatarId={2} decorative />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
