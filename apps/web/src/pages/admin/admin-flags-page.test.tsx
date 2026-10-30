import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminFlag, AdminFlagPage } from '@toasthub/shared';

import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession, testUser } from '@/test/sessions';

import { AdminFlagsPage } from './admin-flags-page';

const ANN_ID = '01900000-0000-7000-8000-0000000000a1';

const countFlag: AdminFlag = {
  id: '01900000-0000-7000-8000-000000000f01',
  type: 'count_threshold',
  status: 'open',
  createdAt: '2026-10-29T10:00:00.000Z',
  subject: { id: ANN_ID, displayName: 'Ann Able', avatarId: 1, status: 'active' },
  reporter: null,
  reason: null,
  localDate: '2026-10-29',
  day: { active: 9, rejected: 0 },
  toast: null,
  resolvedBy: null,
  resolvedAt: null,
};

const photoFlag: AdminFlag = {
  ...countFlag,
  id: '01900000-0000-7000-8000-000000000f02',
  type: 'photo_report',
  status: 'actioned',
  reporter: { id: '01900000-0000-7000-8000-000000000b0b', displayName: 'Bob Baker', avatarId: 2 },
  reason: 'Not a toast',
  localDate: null,
  day: null,
  toast: {
    id: '01900000-0000-7000-8000-000000000101',
    sessionId: '01900000-0000-7000-8000-000000000101',
    eatenAt: '2026-10-28T07:00:00.000Z',
    localDate: '2026-10-28',
    status: 'active',
    deleted: false,
    photoUrl: 'https://photos.test/reported.webp',
    photoHidden: true,
    earlierPhotoUrls: ['https://photos.test/earlier.webp'],
  },
  resolvedBy: { id: testUser.id, displayName: 'Toast Tester', avatarId: 1 },
  resolvedAt: '2026-10-29T11:00:00.000Z',
};

const page = (items: AdminFlag[]): AdminFlagPage => ({ items, nextCursor: null });

function renderPage() {
  return renderWithApp(<AdminFlagsPage />, { session: testSession('admin'), path: '/admin/flags' });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AdminFlagsPage', () => {
  it('lists open flags by default, with the day of a count flag', async () => {
    const requests = mockApi(() => jsonResponse(200, page([countFlag])));
    renderPage();

    const card = await screen.findByRole('listitem');
    expect(within(card).getByText('Daily count')).toBeVisible();
    expect(within(card).getByRole('link', { name: 'Ann Able' })).toHaveAttribute(
      'href',
      `/u/${ANN_ID}`,
    );
    expect(card).toHaveTextContent('Thursday, 29 October 2026');
    expect(card).toHaveTextContent('Counting9');
    expect(new URL(requests[0]?.url ?? '').searchParams.get('status')).toBe('open');
  });

  it('shows a resolved photo report with its photos, reporter and resolver', async () => {
    mockApi(() => jsonResponse(200, page([photoFlag])));
    renderPage();

    const card = within(await screen.findByRole('list', { name: 'Flags' })).getAllByRole(
      'listitem',
    )[0] as HTMLElement;
    expect(within(card).getByRole('img', { name: "Ann Able's reported photo" })).toHaveAttribute(
      'src',
      'https://photos.test/reported.webp',
    );
    expect(within(card).getByRole('img', { name: 'Earlier photo 1' })).toBeVisible();
    expect(card).toHaveTextContent('Photo hidden');
    expect(card).toHaveTextContent('Reported by Bob Baker');
    expect(card).toHaveTextContent('Reason: Not a toast');
    expect(card).toHaveTextContent('Resolved by Toast Tester');
    expect(within(card).queryByRole('button', { name: /Resolve/ })).not.toBeInTheDocument();
  });

  it('filters by type and status', async () => {
    const user = userEvent.setup();
    const requests = mockApi(() => jsonResponse(200, page([])));
    renderPage();
    expect(await screen.findByText('No flags here.')).toBeVisible();

    await user.selectOptions(screen.getByLabelText('Type'), 'Photo report');
    await user.selectOptions(screen.getByLabelText('Status'), 'All');

    await waitFor(() => {
      const params = new URL(requests.at(-1)?.url ?? '').searchParams;
      expect(params.get('type')).toBe('photo_report');
      expect(params.has('status')).toBe(false);
    });
  });

  it("rejects the day's toasts and bans the subject", async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      request.method === 'POST'
        ? jsonResponse(200, { flag: { ...countFlag, status: 'actioned' } })
        : jsonResponse(200, page([countFlag])),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Resolve the flag on Ann Able' }));
    const dialog = screen.getByRole('dialog', { name: 'Resolve the flag on Ann Able' });
    expect(within(dialog).queryByLabelText('Hide the photo')).not.toBeInTheDocument();
    await user.click(within(dialog).getByLabelText("Reject the day's toasts"));
    await user.click(within(dialog).getByLabelText('Also ban Ann Able'));
    await user.click(within(dialog).getByRole('button', { name: 'Resolve' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const post = requests.find((request) => request.method === 'POST');
    expect(new URL(post?.url ?? '').pathname).toBe(`/api/v1/admin/flags/${countFlag.id}/resolve`);
    expect(await post?.json()).toEqual({ action: 'reject_toasts', ban: true });
  });

  it("doesn't offer to ban the admin's own account", async () => {
    const user = userEvent.setup();
    const own = { ...countFlag, subject: { ...countFlag.subject, id: testUser.id } };
    mockApi(() => jsonResponse(200, page([own])));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Resolve the flag on Ann Able' }));
    expect(screen.queryByLabelText('Also ban Ann Able')).not.toBeInTheDocument();
  });

  it('keeps the dialog open with the error when resolving fails', async () => {
    const user = userEvent.setup();
    mockApi((request) =>
      request.method === 'POST'
        ? jsonResponse(409, { error: { code: 'CONFLICT', message: 'Flag already resolved' } })
        : jsonResponse(200, page([countFlag])),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Resolve the flag on Ann Able' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Resolve' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "That's no longer possible.",
    );
  });
});
