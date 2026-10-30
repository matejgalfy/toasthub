import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ToastOfTheWeek, ToastOfTheWeekPage as Page } from '@toasthub/shared';

import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession } from '@/test/sessions';

import { ToastOfTheWeekPage } from './toast-of-the-week-page';

const BOB_ID = '01900000-0000-7000-8000-000000000b0b';

const won: ToastOfTheWeek = {
  weekStart: '2026-10-19',
  status: 'won',
  toast: {
    id: '01900000-0000-7000-8000-000000000101',
    user: { id: BOB_ID, displayName: 'Bob Baker', avatarId: 2 },
    eatenAt: '2026-10-22T07:30:00.000Z',
    photoUrl: 'https://photos.test/winner.webp',
  },
};

const page = (items: ToastOfTheWeek[], nextCursor: string | null = null): Page => ({
  items,
  nextCursor,
});

function renderPage() {
  return renderWithApp(<ToastOfTheWeekPage />, {
    session: testSession('user'),
    path: '/toast-of-the-week',
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ToastOfTheWeekPage', () => {
  it('lists the weeks with their winner, no winner or a removed one', async () => {
    mockApi(() =>
      jsonResponse(
        200,
        page([
          won,
          { weekStart: '2026-10-12', status: 'none', toast: null },
          { weekStart: '2026-10-05', status: 'removed', toast: null },
        ]),
      ),
    );
    renderPage();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(3);
    const [first, second, third] = items as [HTMLElement, HTMLElement, HTMLElement];
    expect(
      within(first).getByRole('img', { name: 'Toast of the week by Bob Baker' }),
    ).toHaveAttribute('src', 'https://photos.test/winner.webp');
    expect(within(first).getByRole('link', { name: 'Bob Baker' })).toHaveAttribute(
      'href',
      `/u/${BOB_ID}`,
    );
    expect(first).toHaveTextContent('19 Oct – 25 Oct 2026');
    expect(second).toHaveTextContent('12 Oct – 18 Oct 2026');
    expect(second).toHaveTextContent('No photo toast that week, so no winner.');
    expect(third).toHaveTextContent('The winning toast has been removed.');
  });

  it('loads older weeks', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      return jsonResponse(
        200,
        cursor
          ? page([{ weekStart: '2026-10-12', status: 'none', toast: null }])
          : page([won], 'next-page'),
      );
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Load older weeks' }));

    expect(await screen.findByText('No photo toast that week, so no winner.')).toBeVisible();
    expect(requests.map((r) => new URL(r.url).searchParams.get('cursor'))).toEqual([
      null,
      'next-page',
    ]);
  });

  it('explains the draw before the first one', async () => {
    mockApi(() => jsonResponse(200, page([])));
    renderPage();

    expect(
      await screen.findByText(
        'No draws yet. Every Monday one photo toast from the week before wins.',
      ),
    ).toBeVisible();
  });
});
