import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Clan, ClanPage } from '@toasthub/shared';

import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession, testUser } from '@/test/sessions';

import { ClanNewPage } from './clan-new-page';
import { ClansPage } from './clans-page';

const CLAN_ID = '01900000-0000-7000-8000-000000000300';

function clan(n: number, overrides: Partial<Clan> = {}): Clan {
  return {
    id: `01900000-0000-7000-8000-00000000030${String(n)}`,
    name: `Clan ${String(n)}`,
    description: null,
    memberCount: n,
    createdAt: '2026-10-01T08:00:00.000Z',
    ...overrides,
  };
}

const page = (items: Clan[], nextCursor: string | null = null): ClanPage => ({
  items,
  nextCursor,
});

const memberSession = () => {
  const session = testSession('user');
  if (session.status !== 'authenticated') throw new Error('expected a user');
  return { ...session, user: { ...session.user, clanId: CLAN_ID } };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ClansPage', () => {
  it('lists clans with their member counts and links', async () => {
    mockApi(() => jsonResponse(200, page([clan(1, { description: 'Crunchy only' }), clan(2)])));
    renderWithApp(<ClansPage />, { session: testSession('user'), path: '/clans' });

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Crunchy only');
    expect(items[0]).toHaveTextContent('1 member');
    expect(items[1]).toHaveTextContent('2 members');
    expect(within(items[1] as HTMLElement).getByRole('link', { name: 'Clan 2' })).toHaveAttribute(
      'href',
      `/clans/${clan(2).id}`,
    );
    expect(screen.getByRole('link', { name: 'Create clan' })).toHaveAttribute('href', '/clans/new');
  });

  it('searches by name once typing stops', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) => {
      const search = new URL(request.url).searchParams.get('search');
      return jsonResponse(200, page(search ? [] : [clan(1)]));
    });
    renderWithApp(<ClansPage />, { session: testSession('user'), path: '/clans' });
    await screen.findByRole('link', { name: 'Clan 1' });

    await user.type(screen.getByRole('searchbox', { name: 'Search clans' }), ' rye ');

    expect(await screen.findByText('No clan name contains “rye”.')).toBeVisible();
    const searches = requests.map((r) => new URL(r.url).searchParams.get('search'));
    // Debounced: the list isn't fetched for every keystroke, and the search is trimmed.
    expect(searches).toEqual([null, 'rye']);
  });

  it('links a member to their clan instead of offering to create one', async () => {
    mockApi(() => jsonResponse(200, page([])));
    renderWithApp(<ClansPage />, { session: memberSession(), path: '/clans' });

    expect(await screen.findByText('No clans yet. Create the first one!')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Your clan' })).toHaveAttribute(
      'href',
      `/clans/${CLAN_ID}`,
    );
    expect(screen.queryByRole('link', { name: 'Create clan' })).not.toBeInTheDocument();
  });
});

describe('ClanNewPage', () => {
  const routes = [{ path: '/clans/:id', element: <p>clan page</p> }];

  it('creates the clan and opens it', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      request.method === 'POST'
        ? jsonResponse(201, { clan: clan(1, { id: CLAN_ID }), newAchievements: [] })
        : jsonResponse(200, { user: { ...testUser, clanId: CLAN_ID } }),
    );
    renderWithApp(<ClanNewPage />, { session: testSession('user'), path: '/clans/new', routes });

    await user.type(screen.getByRole('textbox', { name: 'Name' }), '  Rye Riders ');
    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Dark bread only');
    await user.click(screen.getByRole('button', { name: 'Create clan' }));

    expect(await screen.findByText('clan page')).toBeVisible();
    const post = requests.find((r) => r.method === 'POST');
    expect(await post?.json()).toEqual({ name: 'Rye Riders', description: 'Dark bread only' });
  });

  it('checks the name length before sending', async () => {
    const user = userEvent.setup();
    const requests = mockApi(() => jsonResponse(500, {}));
    renderWithApp(<ClanNewPage />, { session: testSession('user'), path: '/clans/new' });

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Ry');
    await user.click(screen.getByRole('button', { name: 'Create clan' }));

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription(
      'Use 3 to 40 characters.',
    );
    expect(requests).toHaveLength(0);
  });

  it('says when the name is taken', async () => {
    const user = userEvent.setup();
    mockApi(() =>
      jsonResponse(409, { error: { code: 'CONFLICT', message: 'A clan with this name exists' } }),
    );
    renderWithApp(<ClanNewPage />, { session: testSession('user'), path: '/clans/new' });

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Crumbs');
    await user.click(screen.getByRole('button', { name: 'Create clan' }));

    expect(await screen.findByText('Another clan already has this name.')).toBeVisible();
  });

  it('sends a member to their clan', async () => {
    mockApi(() => jsonResponse(500, {}));
    renderWithApp(<ClanNewPage />, { session: memberSession(), path: '/clans/new', routes });

    expect(await screen.findByText('clan page')).toBeVisible();
  });
});
