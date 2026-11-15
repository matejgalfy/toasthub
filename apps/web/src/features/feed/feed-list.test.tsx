import { useInfiniteQuery } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FeedItem, ToastSession } from '@toasthub/shared';

import { clanFeedQueryOptions } from '@/features/clans/clans-api';
import { userToastsQueryOptions } from '@/features/profile/profile-api';
import { toastSessionsQueryOptions } from '@/features/toast-sessions/toast-sessions-api';
import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession, testUser } from '@/test/sessions';

import { globalFeedQueryOptions } from './feed-api';
import { FeedList } from './feed-list';

const CLAN = '01900000-0000-7000-8000-000000000003';
const item = (overrides: Partial<FeedItem> = {}): FeedItem => ({
  sessionId: '01900000-0000-7000-8000-000000000004',
  toastId: '01900000-0000-7000-8000-000000000005',
  user: { id: testUser.id, displayName: 'Toast Tester', avatarId: 1 },
  loggedAt: '2020-10-28T07:00:00.000Z',
  localDate: '2020-10-28',
  count: 2,
  description: 'Breakfast',
  photoUrl: 'https://photos.example/toast.webp',
  likeCount: 0,
  likedByMe: false,
  ...overrides,
});
const page = (items: unknown[]) => ({ items, nextCursor: null });
const session = (description: string | null): ToastSession => ({
  id: item().sessionId,
  loggedAt: item().loggedAt,
  localDate: item().localDate,
  count: 2,
  description,
  hasPhoto: true,
  photoUrl: item().photoUrl,
  photoHidden: false,
  editable: false,
});
const changed = (description: string | null) => ({
  session: session(description),
  newAchievements: [],
});

function Feed({ clan = false }: { clan?: boolean }) {
  const global = useInfiniteQuery({ ...globalFeedQueryOptions, enabled: !clan });
  const clanFeed = useInfiniteQuery({ ...clanFeedQueryOptions(CLAN), enabled: clan });
  return <FeedList feed={clan ? clanFeed : global} empty="No toasts" />;
}

function CacheViews() {
  const global = useInfiniteQuery(globalFeedQueryOptions);
  const clan = useInfiniteQuery(clanFeedQueryOptions(CLAN));
  const profile = useInfiniteQuery(userToastsQueryOptions(testUser.id));
  const history = useInfiniteQuery(toastSessionsQueryOptions);
  return (
    <>
      <section aria-label="Global feed">
        <FeedList feed={global} empty="No toasts" />
      </section>
      <section aria-label="Clan feed">
        <FeedList feed={clan} empty="No toasts" />
      </section>
      <p aria-label="Profile description">{profile.data?.pages[0]?.items[0]?.description}</p>
      <p aria-label="History description">{history.data?.pages[0]?.items[0]?.description}</p>
    </>
  );
}

function mockFeed(respond?: Parameters<typeof mockApi>[0], items = [item()]) {
  return mockApi((request) => {
    if (new URL(request.url).pathname.endsWith('/comments')) return jsonResponse(200, page([]));
    return respond ? respond(request) : jsonResponse(200, page(items));
  });
}

const renderFeed = (clan = false) =>
  renderWithApp(<Feed clan={clan} />, { session: testSession('user') });

async function openEdit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Edit description' }));
  return screen.getByRole('dialog', { name: 'Edit description' });
}

afterEach(() => vi.restoreAllMocks());

describe('FeedList description editing (BR-TOAST-8, D71)', () => {
  it('offers editing directly under the photo only for the owner, including past and blank posts', async () => {
    const user = userEvent.setup();
    mockFeed(undefined, [
      item({ description: null }),
      item({ sessionId: 'other', user: { id: 'other', displayName: 'Mia', avatarId: null } }),
      item({ sessionId: 'past' }),
    ]);
    renderFeed();

    const actions = await screen.findAllByRole('button', { name: 'Edit description' });
    expect(actions).toHaveLength(2);
    const [blankAction, pastAction] = actions;
    if (!blankAction || !pastAction) throw new Error('Missing owner actions');
    expect(blankAction.previousElementSibling?.tagName).toBe('IMG');
    expect(pastAction.previousElementSibling).toHaveTextContent('Breakfast');
    expect(pastAction.previousElementSibling?.previousElementSibling?.tagName).toBe('IMG');
    await user.click(blankAction);
    const dialog = screen.getByRole('dialog', { name: 'Edit description' });
    const field = within(dialog).getByRole('textbox', { name: 'Description (optional)' });
    expect(dialog).toHaveClass('max-h-[90dvh]', 'overflow-y-auto');
    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('maxlength', '500');
    expect(
      within(dialog).queryByRole('button', { name: 'One toast more' }),
    ).not.toBeInTheDocument();
    await user.type(field, 'x'.repeat(501));
    expect(field).toHaveValue('x'.repeat(500));
  });

  it('does not offer editing another user’s post, even to an admin', async () => {
    mockFeed(undefined, [
      item({ user: { id: 'other', displayName: 'Mia', avatarId: null }, description: null }),
    ]);
    renderWithApp(<Feed />, { session: testSession('admin') });

    await screen.findByRole('link', { name: 'Mia' });
    expect(screen.queryByRole('button', { name: 'Edit description' })).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'edits and clears a past post from the clan feed=%s using only description',
    async (clan) => {
      const user = userEvent.setup();
      let description: string | null = 'Breakfast';
      const requests = mockFeed(async (request) => {
        if (request.method === 'PATCH') {
          description = ((await request.json()) as { description: string | null }).description;
          return jsonResponse(200, changed(description));
        }
        return jsonResponse(200, page([item({ description })]));
      });
      renderFeed(clan);

      let dialog = await openEdit(user);
      let field = within(dialog).getByRole('textbox', { name: 'Description (optional)' });
      expect(field).toHaveValue('Breakfast');
      await user.clear(field);
      await user.type(field, '  Breakfast\nwith friends  ');
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(
        await screen.findByText('Breakfast\nwith friends', { normalizer: (value) => value }),
      ).toBeVisible();

      dialog = await openEdit(user);
      field = within(dialog).getByRole('textbox', { name: 'Description (optional)' });
      await user.clear(field);
      await user.type(field, '   ');
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(
        screen.queryByText('Breakfast\nwith friends', { normalizer: (value) => value }),
      ).not.toBeInTheDocument();
      const patches = requests.filter((request) => request.method === 'PATCH');
      expect(patches.map((request) => request.url)).toEqual([
        `http://localhost/api/v1/toast-sessions/${item().sessionId}`,
        `http://localhost/api/v1/toast-sessions/${item().sessionId}`,
      ]);
      expect(await Promise.all(patches.map((request) => request.json()))).toEqual([
        { description: 'Breakfast\nwith friends' },
        { description: null },
      ]);
    },
  );

  it('discards a canceled draft and initializes it again when reopened', async () => {
    const user = userEvent.setup();
    const requests = mockFeed();
    renderFeed();

    let dialog = await openEdit(user);
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Description (optional)' }),
      ' draft',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    dialog = await openEdit(user);
    expect(within(dialog).getByRole('textbox', { name: 'Description (optional)' })).toHaveValue(
      'Breakfast',
    );
    expect(requests.some((request) => request.method === 'PATCH')).toBe(false);
  });

  it('prevents edits and closing while pending, keeps a failed draft and allows retry', async () => {
    const user = userEvent.setup();
    let release: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    let attempts = 0;
    const requests = mockFeed((request) => {
      if (request.method === 'PATCH') {
        attempts += 1;
        return attempts === 1 ? pending : jsonResponse(200, changed('Breakfast draft'));
      }
      return jsonResponse(200, page([item()]));
    });
    renderFeed();

    const dialog = await openEdit(user);
    const field = within(dialog).getByRole('textbox', { name: 'Description (optional)' });
    await user.type(field, ' draft');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(field).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(dialog).toBeVisible();
    release(jsonResponse(409, { error: { code: 'CONFLICT', message: 'Rejected session' } }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "That's no longer possible.",
    );
    await vi.waitFor(() => expect(field).toBeEnabled());
    expect(field).toHaveValue('Breakfast draft');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const patches = requests.filter((request) => request.method === 'PATCH');
    expect(await Promise.all(patches.map((request) => request.json()))).toEqual([
      { description: 'Breakfast draft' },
      { description: 'Breakfast draft' },
    ]);
  });

  it('refreshes loaded global and clan feeds, profile photos and own history after a description-only edit', async () => {
    const user = userEvent.setup();
    let description: string | null = 'Breakfast';
    const requests = mockFeed(async (request) => {
      const path = new URL(request.url).pathname;
      if (request.method === 'PATCH') {
        description = ((await request.json()) as { description: string | null }).description;
        return jsonResponse(200, changed(description));
      }
      if (path === '/api/v1/me/toast-sessions')
        return jsonResponse(200, page([session(description)]));
      if (path.endsWith('/toasts'))
        return jsonResponse(200, page([{ ...item({ description }), id: item().toastId }]));
      return jsonResponse(200, page([item({ description })]));
    });
    renderWithApp(<CacheViews />, { session: testSession('user') });
    const global = screen.getByRole('region', { name: 'Global feed' });
    const clan = screen.getByRole('region', { name: 'Clan feed' });
    await within(global).findByText('Breakfast');
    await within(clan).findByText('Breakfast');
    expect(await screen.findByLabelText('Profile description')).toHaveTextContent('Breakfast');
    expect(await screen.findByLabelText('History description')).toHaveTextContent('Breakfast');

    await user.click(within(global).getByRole('button', { name: 'Edit description' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit description' });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Description (optional)' }),
      ' with friends',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(global).getByText('Breakfast with friends')).toBeVisible();
    expect(within(clan).getByText('Breakfast with friends')).toBeVisible();
    expect(screen.getByLabelText('Profile description')).toHaveTextContent(
      'Breakfast with friends',
    );
    expect(screen.getByLabelText('History description')).toHaveTextContent(
      'Breakfast with friends',
    );
    for (const path of [
      '/api/v1/feed',
      `/api/v1/clans/${CLAN}/feed`,
      `/api/v1/users/${testUser.id}/toasts`,
      '/api/v1/me/toast-sessions',
    ]) {
      expect(
        requests.filter(
          (request) => request.method === 'GET' && new URL(request.url).pathname === path,
        ),
      ).toHaveLength(2);
    }
  });
});
