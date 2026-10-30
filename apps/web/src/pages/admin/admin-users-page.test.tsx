import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminUser, AdminUserPage } from '@toasthub/shared';

import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession, testUser } from '@/test/sessions';

import { AdminUsersPage } from './admin-users-page';

const ann: AdminUser = {
  id: '01900000-0000-7000-8000-0000000000a1',
  email: 'ann@example.com',
  displayName: 'Ann Able',
  avatarId: 1,
  role: 'user',
  status: 'active',
  clan: { id: '01900000-0000-7000-8000-00000000c1a0', name: 'Breakfast Club' },
  createdAt: '2026-10-01T08:00:00.000Z',
};

const newcomer: AdminUser = {
  ...ann,
  id: '01900000-0000-7000-8000-0000000000a2',
  email: 'new@example.com',
  displayName: null,
  avatarId: null,
  status: 'banned',
  clan: null,
};

const me: AdminUser = { ...ann, id: testUser.id, email: testUser.email, role: 'admin', clan: null };

const page = (items: AdminUser[]): AdminUserPage => ({ items, nextCursor: null });

function renderPage() {
  return renderWithApp(<AdminUsersPage />, { session: testSession('admin'), path: '/admin/users' });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AdminUsersPage', () => {
  it('lists users with their email, clan and status', async () => {
    mockApi(() => jsonResponse(200, page([ann, newcomer, me])));
    renderPage();

    const [first, second, third] = (await screen.findAllByRole('listitem')) as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(first).toHaveTextContent('ann@example.com');
    expect(first).toHaveTextContent('Breakfast Club');
    expect(within(first).getByRole('button', { name: 'Ban Ann Able' })).toBeVisible();
    expect(second).toHaveTextContent('Not onboarded yet');
    expect(second).toHaveTextContent('Banned');
    expect(within(second).getByRole('button', { name: 'Unban new@example.com' })).toBeVisible();
    // No ban button for the own account (the api answers 409).
    expect(third).toHaveTextContent('Admin');
    expect(within(third).queryByRole('button')).not.toBeInTheDocument();
  });

  it('searches by email or name', async () => {
    const user = userEvent.setup();
    const requests = mockApi(() => jsonResponse(200, page([])));
    renderPage();

    await user.type(await screen.findByRole('searchbox', { name: 'Search users' }), 'ann');

    expect(await screen.findByText('No email or name contains “ann”.')).toBeVisible();
    expect(new URL(requests.at(-1)?.url ?? '').searchParams.get('search')).toBe('ann');
  });

  it('bans a user after confirming', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      request.method === 'POST'
        ? jsonResponse(200, { user: { ...ann, status: 'banned' } })
        : jsonResponse(200, page([ann])),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Ban Ann Able' }));
    const dialog = screen.getByRole('dialog', { name: 'Ban Ann Able?' });
    await user.click(within(dialog).getByRole('button', { name: 'Ban' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const post = requests.find((request) => request.method === 'POST');
    expect(new URL(post?.url ?? '').pathname).toBe(`/api/v1/admin/users/${ann.id}/status`);
    expect(await post?.json()).toEqual({ status: 'banned' });
  });
});
