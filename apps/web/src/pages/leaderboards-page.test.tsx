import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClanLeaderboard, ClanRank, UserLeaderboard, UserRank } from '@toasthub/shared';

import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession, testUser } from '@/test/sessions';

import { LeaderboardsPage } from './leaderboards-page';

const CLAN_ID = '01900000-0000-7000-8000-000000000300';

function userRank(rank: number, n: number, count: number): UserRank {
  return {
    rank,
    user: {
      id: `01900000-0000-7000-8000-00000000010${String(n)}`,
      displayName: `User ${String(n)}`,
      avatarId: n,
    },
    count,
  };
}

const meRank = (rank: number, count: number): UserRank => ({
  rank,
  user: { id: testUser.id, displayName: testUser.displayName ?? '', avatarId: 1 },
  count,
});

function clanRank(rank: number, n: number, count: number, currentStreak: number): ClanRank {
  return {
    rank,
    clan: { id: `01900000-0000-7000-8000-00000000030${String(n)}`, name: `Clan ${String(n)}` },
    count,
    currentStreak,
  };
}

const memberSession = () => {
  const session = testSession('user');
  if (session.status !== 'authenticated') throw new Error('expected a user');
  return { ...session, user: { ...session.user, clanId: CLAN_ID } };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LeaderboardsPage', () => {
  it("shows this week's users with shared ranks and pins the caller below the top", async () => {
    const board: UserLeaderboard = {
      items: [userRank(1, 1, 5), userRank(1, 2, 5), userRank(3, 3, 1)],
      me: meRank(52, 1),
    };
    const requests = mockApi(() => jsonResponse(200, board));
    renderWithApp(<LeaderboardsPage />, { session: testSession('user'), path: '/leaderboards' });

    const list = await screen.findByRole('list', { name: 'Users by toasts' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    for (const [row, rank, name, count] of [
      [rows[0], 'Rank 1', 'User 1', '5 toasts'],
      [rows[1], 'Rank 1', 'User 2', '5 toasts'],
      [rows[2], 'Rank 3', 'User 3', '1 toast'],
    ] as const) {
      expect(row).toHaveTextContent(rank);
      expect(row).toHaveTextContent(name);
      expect(row).toHaveTextContent(count);
    }
    expect(within(rows[0] as HTMLElement).getByRole('link', { name: 'User 1' })).toHaveAttribute(
      'href',
      `/u/${userRank(1, 1, 5).user.id}`,
    );
    const pinned = screen.getByRole('group', { name: 'You' });
    expect(pinned).toHaveTextContent('Rank 52');
    expect(pinned).toHaveTextContent('Toast Tester');
    expect(screen.getByRole('button', { name: 'This week' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(new URL(requests[0]?.url ?? '').searchParams.get('period')).toBe('week');
  });

  it("marks the caller's row in the list and says so when they have no toasts", async () => {
    const user = userEvent.setup();
    mockApi((request) => {
      const period = new URL(request.url).searchParams.get('period');
      const board: UserLeaderboard =
        period === 'year'
          ? { items: [meRank(1, 9)], me: meRank(1, 9) }
          : { items: [userRank(1, 1, 2)], me: null };
      return jsonResponse(200, board);
    });
    renderWithApp(<LeaderboardsPage />, { session: testSession('user'), path: '/leaderboards' });

    expect(await screen.findByText('No toasts from you this week yet.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'This year' }));

    const list = await screen.findByRole('list', { name: 'Users by toasts' });
    expect(within(list).getByText('Toast Tester').closest('[aria-current]')).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it("shows clans for this month with their streak and the caller's clan", async () => {
    const user = userEvent.setup();
    const clans: ClanLeaderboard = {
      items: [clanRank(1, 1, 40, 3), clanRank(2, 2, 12, 0)],
      myClan: { ...clanRank(2, 2, 12, 0), clan: { id: CLAN_ID, name: 'Clan 2' } },
    };
    const requests = mockApi((request) =>
      request.url.includes('/leaderboards/clans')
        ? jsonResponse(200, clans)
        : jsonResponse(200, { items: [], me: null }),
    );
    renderWithApp(<LeaderboardsPage />, { session: memberSession(), path: '/leaderboards' });
    await screen.findByText('No toasts in this period yet.');

    await user.click(screen.getByRole('tab', { name: 'Clans' }));

    const list = await screen.findByRole('list', { name: 'Clans by toasts' });
    const [first] = within(list).getAllByRole('listitem');
    expect(first).toHaveTextContent('Clan streak: 3 days');
    expect(within(first as HTMLElement).getByRole('link', { name: 'Clan 1' })).toHaveAttribute(
      'href',
      `/clans/${clanRank(1, 1, 0, 0).clan.id}`,
    );
    expect(screen.getByRole('group', { name: 'Your clan' })).toHaveTextContent('Rank 2');
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const clanRequest = requests.find((r) => r.url.includes('/leaderboards/clans'));
    expect(new URL(clanRequest?.url ?? '').searchParams.get('period')).toBe('month');
  });

  it('has no "Your clan" row outside a clan', async () => {
    const user = userEvent.setup();
    mockApi((request) =>
      request.url.includes('/leaderboards/clans')
        ? jsonResponse(200, { items: [clanRank(1, 1, 4, 1)], myClan: null })
        : jsonResponse(200, { items: [], me: null }),
    );
    renderWithApp(<LeaderboardsPage />, { session: testSession('user'), path: '/leaderboards' });
    await user.click(await screen.findByRole('tab', { name: 'Clans' }));

    await screen.findByRole('list', { name: 'Clans by toasts' });
    expect(screen.queryByRole('group', { name: 'Your clan' })).not.toBeInTheDocument();
  });
});
