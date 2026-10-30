import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ToastOfTheWeek, ToastOfTheWeekPage } from '@toasthub/shared';

import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession } from '@/test/sessions';

import { AdminTotwPage } from './admin-totw-page';

const none: ToastOfTheWeek = { weekStart: '2026-10-19', status: 'none', toast: null };
const history: ToastOfTheWeekPage = { items: [none], nextCursor: null };

function renderPage() {
  return renderWithApp(<AdminTotwPage />, { session: testSession('admin'), path: '/admin/totw' });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AdminTotwPage', () => {
  it('draws a listed week again after confirming', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      request.method === 'POST' ? jsonResponse(200, none) : jsonResponse(200, history),
    );
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Draw 19 Oct – 25 Oct 2026 again' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Draw 19 Oct – 25 Oct 2026 again?' });
    await user.click(within(dialog).getByRole('button', { name: 'Draw again' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const post = requests.find((request) => request.method === 'POST');
    expect(new URL(post?.url ?? '').pathname).toBe(
      '/api/v1/admin/toast-of-the-week/2026-10-19/redraw',
    );
  });

  it('draws a week picked by its Monday and explains one not over yet', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      request.method === 'POST'
        ? jsonResponse(409, { error: { code: 'CONFLICT', message: 'Week not over' } })
        : jsonResponse(200, history),
    );
    renderPage();

    const week = await screen.findByLabelText('Week starting on (Monday)');
    await user.clear(week);
    await user.type(week, '2026-10-28');
    await user.click(screen.getByRole('button', { name: 'Draw' }));
    expect(screen.getByText('Pick a Monday.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.clear(week);
    await user.type(week, '2026-10-26');
    await user.click(screen.getByRole('button', { name: 'Draw' }));
    const dialog = screen.getByRole('dialog', { name: 'Draw 26 Oct – 1 Nov 2026 again?' });
    await user.click(within(dialog).getByRole('button', { name: 'Draw again' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "This week hasn't ended yet.",
    );
    const post = requests.find((request) => request.method === 'POST');
    expect(new URL(post?.url ?? '').pathname).toBe(
      '/api/v1/admin/toast-of-the-week/2026-10-26/redraw',
    );
  });
});
