import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { addDays, type AdminMetrics } from '@toasthub/shared';

import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession } from '@/test/sessions';

import { AdminMetricsPage } from './admin-metrics-page';

const metrics: AdminMetrics = {
  users: 42,
  dau: 7,
  openFlags: 3,
  toastsPerDay: Array.from({ length: 30 }, (_, index) => ({
    date: addDays('2026-10-01', index),
    count: index === 29 ? 12 : index % 3,
  })),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AdminMetricsPage', () => {
  it('shows the counters and the toasts of the last 30 days', async () => {
    mockApi(() => jsonResponse(200, metrics));
    renderWithApp(<AdminMetricsPage />, { session: testSession('admin'), path: '/admin/metrics' });

    expect(await screen.findByRole('group', { name: 'Users' })).toHaveTextContent('42');
    expect(screen.getByRole('group', { name: 'Active today' })).toHaveTextContent('7');
    expect(screen.getByRole('group', { name: 'Open flags' })).toHaveTextContent('3');

    const chart = screen.getByRole('figure', { name: /Toasts per day/ });
    // 0, 1, 2, … over the first 29 days adds up to 28, plus 12 on the last day.
    expect(chart).toHaveTextContent('40 toasts in total, at most 12 on one day.');
    const rows = within(chart).getAllByRole('row', { hidden: true });
    expect(rows).toHaveLength(31);
    expect(rows.at(-1)).toHaveTextContent('30 Oct 202612');
  });
});
