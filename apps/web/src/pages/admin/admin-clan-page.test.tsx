import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClanDetail } from '@toasthub/shared';

import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession } from '@/test/sessions';

import { AdminClanPage } from './admin-clan-page';

const CLAN_ID = '01900000-0000-7000-8000-00000000c1a0';
const ann = { id: '01900000-0000-7000-8000-0000000000a1', displayName: 'Ann Able', avatarId: 1 };
const bob = { id: '01900000-0000-7000-8000-000000000b0b', displayName: 'Bob Baker', avatarId: 2 };
const cyril = { id: '01900000-0000-7000-8000-0000000000c1', displayName: 'Cyril', avatarId: 3 };

const detail: ClanDetail = {
  clan: {
    id: CLAN_ID,
    name: 'Breakfast Club',
    description: 'Mornings only',
    memberCount: 3,
    createdAt: '2026-10-01T08:00:00.000Z',
  },
  streak: { current: 2, longest: 5 },
  members: [
    { user: ann, role: 'owner', joinedAt: '2026-10-01T08:00:00.000Z' },
    { user: bob, role: 'officer', joinedAt: '2026-10-02T08:00:00.000Z' },
    { user: cyril, role: 'member', joinedAt: '2026-10-03T08:00:00.000Z' },
  ],
  myRole: null,
  myRequest: null,
};

function renderPage() {
  return renderWithApp(<AdminClanPage />, {
    session: testSession('admin'),
    path: `/admin/clans/${CLAN_ID}`,
    routePath: '/admin/clans/:id',
    routes: [{ path: '/admin/clans', element: <p>clan list</p> }],
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AdminClanPage', () => {
  it('edits the name through the admin route', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      request.method === 'PATCH'
        ? jsonResponse(200, { clan: { ...detail.clan, name: 'Brunch Club' } })
        : jsonResponse(200, detail),
    );
    renderPage();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Brunch Club');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Saved.')).toBeVisible();
    const patch = requests.find((request) => request.method === 'PATCH');
    expect(new URL(patch?.url ?? '').pathname).toBe(`/api/v1/admin/clans/${CLAN_ID}`);
    expect(await patch?.json()).toEqual({ name: 'Brunch Club', description: 'Mornings only' });
  });

  it('hands the clan to the member picked', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      request.method === 'PATCH'
        ? jsonResponse(200, { clan: detail.clan })
        : jsonResponse(200, detail),
    );
    renderPage();

    expect(await screen.findByText('Current Toastmeister:')).toHaveTextContent('Ann Able');
    await user.selectOptions(screen.getByLabelText('New Toastmeister'), 'Cyril (Toastie)');
    await user.click(screen.getByRole('button', { name: 'Make Toastmeister' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Make Cyril the Toastmeister of Breakfast Club?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Make Toastmeister' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const patch = requests.find((request) => request.method === 'PATCH');
    expect(await patch?.json()).toEqual({ ownerId: cyril.id });
  });

  it('deletes the clan and goes back to the list', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      request.method === 'DELETE' ? new Response(null, { status: 204 }) : jsonResponse(200, detail),
    );
    const { router } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete clan' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Breakfast Club?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete clan' }));

    expect(await screen.findByText('clan list')).toBeVisible();
    expect(router.state.location.pathname).toBe('/admin/clans');
    const remove = requests.find((request) => request.method === 'DELETE');
    expect(new URL(remove?.url ?? '').pathname).toBe(`/api/v1/admin/clans/${CLAN_ID}`);
  });
});
