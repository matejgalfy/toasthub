import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACHIEVEMENTS,
  type Heatmap,
  localDate,
  type UserProfile,
  type UserStats,
  type UserToast,
  type UserToastPage,
} from '@toasthub/shared';

import { formatLocalDate } from '@/i18n/format';
import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession, testUser } from '@/test/sessions';

import { ProfilePage } from './profile-page';

const today = localDate(new Date());
const year = Number(today.slice(0, 4));
const OTHER_ID = '01900000-0000-7000-8000-000000000099';

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: testUser.id,
    displayName: 'Toast Tester',
    avatarId: 1,
    access: 'full',
    counts: { week: 3, month: 7, year: 40 },
    ...overrides,
  };
}

const stats: UserStats = {
  totals: { allTime: 40, firstToastDate: `${String(year - 1)}-12-30` },
  averages: { perDay: 0.4567, perWeek: 3, perMonth: 13.33 },
  bestDay: { date: today, count: 5 },
  streak: { current: 2, longest: 9 },
};

const heatmapOf = (y: number): Heatmap => ({
  year: y,
  days: y === year ? [{ date: today, count: 2 }] : [],
});

const achievements = {
  items: ACHIEVEMENTS.map(({ code }) => ({
    code,
    earnedAt: code === 'first_bite' ? '2026-10-01T08:00:00.000Z' : null,
  })),
};

function photo(n: number): UserToast {
  return {
    id: `01900000-0000-7000-8000-00000000010${String(n)}`,
    sessionId: `01900000-0000-7000-8000-00000000020${String(n)}`,
    eatenAt: `${today}T07:00:00.000Z`,
    localDate: today,
    count: n,
    photoUrl: `https://photos.example/${String(n)}.webp`,
    likeCount: 0,
    likedByMe: false,
  };
}

const page = (items: UserToast[], nextCursor: string | null = null): UserToastPage => ({
  items,
  nextCursor,
});

/** Answers the five `/users/:id` routes like the API would for `subject`. */
function mockProfileApi(subject: UserProfile, toasts: (cursor: string | null) => UserToastPage) {
  return mockApi((request) => {
    const url = new URL(request.url);
    const route = url.pathname.replace(`/api/v1/users/${subject.id}`, '');
    switch (route) {
      case '':
        return jsonResponse(200, { profile: subject });
      case '/stats':
        return jsonResponse(200, stats);
      case '/heatmap':
        return jsonResponse(200, heatmapOf(Number(url.searchParams.get('year'))));
      case '/achievements':
        return jsonResponse(200, achievements);
      case '/toasts':
        return jsonResponse(200, toasts(url.searchParams.get('cursor')));
      default:
        return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
  });
}

function renderProfile(id: string) {
  return renderWithApp(<ProfilePage />, {
    session: testSession('user'),
    path: `/u/${id}`,
    routePath: '/u/:id',
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProfilePage', () => {
  it('shows the own full profile with a link to My toasts', async () => {
    mockProfileApi(profile(), () => page([photo(2)]));
    renderProfile(testUser.id);

    expect(await screen.findByRole('heading', { level: 1, name: 'Toast Tester' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'My toasts' })).toHaveAttribute('href', '/toasts');
    expect(screen.getByText('This year').nextElementSibling).toHaveTextContent('40');

    const total = await screen.findByRole('group', { name: 'Total' });
    expect(total).toHaveTextContent('40toasts');
    expect(screen.getByRole('group', { name: 'Best day' })).toHaveTextContent('5toasts');
    expect(screen.getByRole('group', { name: 'Averages' })).toHaveTextContent('Per day0.5');
  });

  it('fills the heatmap and labels every day', async () => {
    mockProfileApi(profile(), () => page([]));
    renderProfile(testUser.id);

    const label = `${formatLocalDate(today, 'en', { dateStyle: 'long' })}: 2 toasts`;
    const cell = await screen.findByRole('img', { name: label });
    expect(cell).toHaveClass('bg-heat-2');
    expect(screen.getByText(`2 toasts in ${String(year)}`)).toBeInTheDocument();
    const firstOfYear = formatLocalDate(`${String(year)}-01-01`, 'en', { dateStyle: 'long' });
    expect(screen.getByRole('img', { name: `${firstOfYear}: 0 toasts` })).toHaveClass('bg-muted');
  });

  it('switches the heatmap year back to the first toast', async () => {
    const user = userEvent.setup();
    const requests = mockProfileApi(profile(), () => page([]));
    renderProfile(testUser.id);

    const next = await screen.findByRole('button', { name: 'Next year' });
    expect(next).toBeDisabled();
    const previous = screen.getByRole('button', { name: 'Previous year' });
    await vi.waitFor(() => {
      expect(previous).toBeEnabled();
    });
    await user.click(previous);

    expect(await screen.findByText(`0 toasts in ${String(year - 1)}`)).toBeInTheDocument();
    // The first toast was last year, so there is nothing further back.
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
    const heatmapYears = requests
      .filter((r) => new URL(r.url).pathname.endsWith('/heatmap'))
      .map((r) => new URL(r.url).searchParams.get('year'));
    expect(heatmapYears).toEqual([String(year), String(year - 1)]);
  });

  it('lists earned achievements with their date and the rest as locked', async () => {
    mockProfileApi(profile(), () => page([]));
    renderProfile(testUser.id);

    const section = await screen.findByRole('region', { name: 'Achievements' });
    expect(
      await within(section).findByText(`1 of ${String(ACHIEVEMENTS.length)} earned`),
    ).toBeVisible();
    const items = within(section).getAllByRole('listitem');
    expect(items).toHaveLength(ACHIEVEMENTS.length);
    expect(items[0]).toHaveTextContent('First Bite');
    expect(items[0]).toHaveTextContent('Earned 1 Oct 2026');
    expect(items[1]).toHaveTextContent('Shutterbug');
    expect(items[1]).toHaveTextContent('Not earned yet');
  });

  it('loads more photos with the cursor and gives each alt text', async () => {
    const user = userEvent.setup();
    const requests = mockProfileApi(profile(), (cursor) =>
      cursor === 'next' ? page([photo(1)]) : page([photo(2)], 'next'),
    );
    renderProfile(testUser.id);

    const section = await screen.findByRole('region', { name: 'Photos' });
    const date = formatLocalDate(today, 'en', { dateStyle: 'long' });
    expect(
      await within(section).findByRole('img', { name: `2 toasts on ${date}` }),
    ).toHaveAttribute('src', 'https://photos.example/2.webp');
    await user.click(within(section).getByRole('button', { name: 'Show more photos' }));

    expect(await within(section).findByRole('img', { name: `1 toast on ${date}` })).toBeVisible();
    expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    const cursors = requests
      .filter((r) => new URL(r.url).pathname.endsWith('/toasts'))
      .map((r) => new URL(r.url).search);
    expect(cursors).toEqual(['', '?cursor=next']);
  });

  it("shows only the basics of a clan-only profile and doesn't ask for the rest", async () => {
    const other = profile({ id: OTHER_ID, displayName: 'Shy Toaster', access: 'reduced' });
    const requests = mockProfileApi(other, () => page([]));
    renderProfile(OTHER_ID);

    expect(await screen.findByRole('heading', { level: 1, name: 'Shy Toaster' })).toBeVisible();
    expect(screen.getByText(/Shy Toaster shares stats, achievements and photos/)).toBeVisible();
    expect(screen.getByText('This week').nextElementSibling).toHaveTextContent('3');
    expect(screen.queryByRole('link', { name: 'My toasts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([`/api/v1/users/${OTHER_ID}`]);
  });

  it("has no My toasts link on someone else's full profile", async () => {
    mockProfileApi(profile({ id: OTHER_ID, displayName: 'Open Toaster' }), () => page([]));
    renderProfile(OTHER_ID);

    expect(await screen.findByRole('heading', { level: 1, name: 'Open Toaster' })).toBeVisible();
    expect(await screen.findByRole('region', { name: 'Stats' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'My toasts' })).not.toBeInTheDocument();
  });

  it('says so for an unknown user', async () => {
    mockProfileApi(profile(), () => page([]));
    renderProfile(OTHER_ID);

    expect(await screen.findByText("We couldn't find this profile.")).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/home');
  });

  it("doesn't call the API for an id that isn't one", async () => {
    const requests = mockProfileApi(profile(), () => page([]));
    renderProfile('not-a-uuid');

    expect(await screen.findByText("We couldn't find this profile.")).toBeVisible();
    expect(requests).toHaveLength(0);
  });
});
