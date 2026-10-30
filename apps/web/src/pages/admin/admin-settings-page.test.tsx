import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession } from '@/test/sessions';

import { AdminSettingsPage } from './admin-settings-page';

const settings = { flagDailyThreshold: 8, clanMaxMembers: 10 };

function renderPage() {
  return renderWithApp(<AdminSettingsPage />, {
    session: testSession('admin'),
    path: '/admin/settings',
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AdminSettingsPage', () => {
  it('saves changed settings', async () => {
    const user = userEvent.setup();
    const requests = mockApi(async (request) =>
      request.method === 'PATCH'
        ? jsonResponse(200, { settings: { ...settings, ...((await request.json()) as object) } })
        : jsonResponse(200, { settings }),
    );
    renderPage();

    const threshold = await screen.findByRole('spinbutton', { name: 'Daily flag threshold' });
    expect(threshold).toHaveValue(8);
    expect(screen.getByRole('spinbutton', { name: 'Clan size limit' })).toHaveValue(10);
    await user.clear(threshold);
    await user.type(threshold, '12');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Saved.')).toBeVisible();
    const patch = requests.find((request) => request.method === 'PATCH');
    expect(await patch?.json()).toEqual({ flagDailyThreshold: 12, clanMaxMembers: 10 });
  });

  it('explains a value out of range without saving', async () => {
    const user = userEvent.setup();
    const requests = mockApi(() => jsonResponse(200, { settings }));
    renderPage();

    const limit = await screen.findByRole('spinbutton', { name: 'Clan size limit' });
    await user.clear(limit);
    await user.type(limit, '1');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(limit).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter a whole number from 2 to 1000.')).toBeVisible();
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });
});
