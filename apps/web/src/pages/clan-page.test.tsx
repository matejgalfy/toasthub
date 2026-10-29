import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ClanDetail,
  ClanFeedItem,
  ClanJoinRequest,
  ClanMember,
  ClanRole,
} from '@toasthub/shared';

import { Toaster } from '@/components/ui/sonner';
import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession, testUser } from '@/test/sessions';

import { ClanPage } from './clan-page';

const CLAN_ID = '01900000-0000-7000-8000-000000000300';
const OWNER_ID = '01900000-0000-7000-8000-000000000011';
const OFFICER_ID = '01900000-0000-7000-8000-000000000012';
const MEMBER_ID = '01900000-0000-7000-8000-000000000013';
const TOAST_ID = '01900000-0000-7000-8000-000000000400';

const person = (id: string, displayName: string, role: ClanRole): ClanMember => ({
  user: { id, displayName, avatarId: 2 },
  role,
  joinedAt: '2026-10-01T08:00:00.000Z',
});

/** The clan as `GET /clans/:id` answers it, with the tester in `myRole` (null = not a member). */
function detail(myRole: ClanRole | null, overrides: Partial<ClanDetail> = {}): ClanDetail {
  const roles: Record<ClanRole, string> = {
    owner: OWNER_ID,
    officer: OFFICER_ID,
    member: MEMBER_ID,
  };
  const members = [
    person(OWNER_ID, 'Olga Owner', 'owner'),
    person(OFFICER_ID, 'Otto Officer', 'officer'),
    person(MEMBER_ID, 'Mia Member', 'member'),
  ].map((member) =>
    myRole !== null && member.user.id === roles[myRole]
      ? { ...member, user: { ...member.user, id: testUser.id, displayName: 'Toast Tester' } }
      : member,
  );
  return {
    clan: {
      id: CLAN_ID,
      name: 'Crumbs',
      description: 'Butter first',
      memberCount: members.length,
      createdAt: '2026-10-01T08:00:00.000Z',
    },
    streak: { current: 3, longest: 8 },
    members,
    myRole,
    myRequest: null,
    ...overrides,
  };
}

const feedItem = (overrides: Partial<ClanFeedItem> = {}): ClanFeedItem => ({
  sessionId: '01900000-0000-7000-8000-000000000500',
  toastId: TOAST_ID,
  user: { id: MEMBER_ID, displayName: 'Mia Member', avatarId: 3 },
  loggedAt: '2026-10-28T07:00:00.000Z',
  localDate: '2026-10-28',
  count: 2,
  photoUrl: 'https://photos.example/1.webp',
  likeCount: 1,
  likedByMe: false,
  ...overrides,
});

const request: ClanJoinRequest = {
  id: '01900000-0000-7000-8000-000000000600',
  clanId: CLAN_ID,
  user: { id: '01900000-0000-7000-8000-000000000014', displayName: 'Nick Newbie', avatarId: 1 },
  status: 'pending',
  createdAt: '2026-10-28T09:00:00.000Z',
};

const noContent = () => new Response(null, { status: 204 });

/** Answers the clan routes; `extra` handles mutations (return undefined to fall through to a 404). */
function mockClanApi(
  clan: ClanDetail,
  {
    feed = [feedItem()],
    extra,
  }: {
    feed?: ClanFeedItem[];
    extra?: (r: Request) => Response | Promise<Response> | undefined;
  } = {},
) {
  return mockApi((r) => {
    const answer = extra?.(r);
    if (answer) return answer;
    const path = new URL(r.url).pathname;
    if (r.method === 'GET') {
      if (path === `/api/v1/clans/${CLAN_ID}`) return jsonResponse(200, clan);
      if (path.endsWith('/feed')) return jsonResponse(200, { items: feed, nextCursor: null });
      if (path.endsWith('/requests')) return jsonResponse(200, { items: [request] });
      if (path === '/api/v1/me') return jsonResponse(200, { user: testUser });
    }
    return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
}

function renderClan(id = CLAN_ID) {
  return renderWithApp(
    <>
      <ClanPage />
      <Toaster />
    </>,
    { session: testSession('user'), path: `/clans/${id}`, routePath: '/clans/:id' },
  );
}

const sent = (requests: Request[], method: string) =>
  requests.filter((r) => r.method === method).map((r) => new URL(r.url).pathname);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ClanPage', () => {
  it('shows a visitor the clan, its streak and members, but not the feed', async () => {
    mockClanApi(detail(null));
    renderClan();

    expect(await screen.findByRole('heading', { level: 1, name: 'Crumbs' })).toBeVisible();
    expect(screen.getByText('Butter first')).toBeVisible();
    expect(screen.getByRole('group', { name: 'Clan streak 🔥' })).toHaveTextContent('3days');
    expect(screen.getByRole('group', { name: 'Longest streak' })).toHaveTextContent('8days');
    expect(screen.queryByRole('tab', { name: 'Feed' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: 'Olga Owner' })).toHaveAttribute(
      'href',
      `/u/${OWNER_ID}`,
    );
    expect(screen.getByText('Officer')).toBeVisible();
    // A visitor can't act on anyone.
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
  });

  it('sends a join request', async () => {
    const user = userEvent.setup();
    const requests = mockClanApi(detail(null), {
      extra: (r) => (r.method === 'POST' ? jsonResponse(202, { request }) : undefined),
    });
    renderClan();

    await user.click(await screen.findByRole('button', { name: 'Request to join' }));

    await vi.waitFor(() => {
      expect(sent(requests, 'POST')).toEqual([`/api/v1/clans/${CLAN_ID}/join`]);
    });
  });

  it('explains a join conflict', async () => {
    const user = userEvent.setup();
    mockClanApi(detail(null), {
      extra: (r) =>
        r.method === 'POST'
          ? jsonResponse(409, { error: { code: 'CONFLICT', message: 'This clan is full' } })
          : undefined,
    });
    renderClan();

    await user.click(await screen.findByRole('button', { name: 'Request to join' }));

    expect(await screen.findByText(/this clan is full\.$/)).toBeVisible();
  });

  it('cancels a pending request', async () => {
    const user = userEvent.setup();
    const requests = mockClanApi(detail(null, { myRequest: request }), {
      extra: (r) => (r.method === 'DELETE' ? noContent() : undefined),
    });
    renderClan();

    expect(await screen.findByText(/waiting for an officer/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel request' }));

    await vi.waitFor(() => {
      expect(sent(requests, 'DELETE')).toEqual(['/api/v1/me/clan-request']);
    });
  });

  it('opens the feed for a member and likes a session at once', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const requests = mockClanApi(detail('member'), {
      extra: (r) => {
        if (r.method !== 'POST') return undefined;
        // Held, so the count shown before the answer is the optimistic one.
        return new Promise<Response>((resolve) => {
          release = () => {
            resolve(noContent());
          };
        });
      },
    });
    renderClan();

    expect(await screen.findByRole('tab', { name: 'Feed' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByRole('img', { name: "Mia Member's photo: 2 toasts" })).toBeVisible();
    const like = screen.getByRole('button', { name: 'Like (1)' });
    expect(like).toHaveAttribute('aria-pressed', 'false');

    await user.click(like);

    expect(screen.getByRole('button', { name: 'Like (2)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    release();
    await vi.waitFor(() => {
      expect(sent(requests, 'POST')).toEqual([`/api/v1/toasts/${TOAST_ID}/like`]);
    });
  });

  it('takes a like back', async () => {
    const user = userEvent.setup();
    const requests = mockClanApi(detail('member'), {
      feed: [feedItem({ likedByMe: true, likeCount: 2 })],
      extra: (r) => (r.method === 'DELETE' ? noContent() : undefined),
    });
    renderClan();

    await user.click(await screen.findByRole('button', { name: 'Like (2)' }));

    await vi.waitFor(() => {
      expect(sent(requests, 'DELETE')).toEqual([`/api/v1/toasts/${TOAST_ID}/like`]);
    });
  });

  it('reports a photo with a reason', async () => {
    const user = userEvent.setup();
    const requests = mockClanApi(detail('member'), {
      feed: [feedItem(), feedItem({ sessionId: 'no-photo', toastId: 'other', photoUrl: null })],
      extra: (r) => (r.method === 'POST' ? new Response(null, { status: 202 }) : undefined),
    });
    renderClan();

    // Only the session with a photo can be reported.
    const reports = await screen.findAllByRole('button', { name: 'Report' });
    expect(reports).toHaveLength(1);
    await user.click(reports[0] as HTMLElement);
    const dialog = screen.getByRole('dialog', { name: 'Report this photo?' });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Reason (optional)' }),
      'Not toast',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Report photo' }));

    expect(await screen.findByText('Thanks. An admin will take a look.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const report = requests.find((r) => r.method === 'POST');
    expect(new URL(report?.url ?? '').pathname).toBe(`/api/v1/toasts/${TOAST_ID}/report`);
    expect(await report?.json()).toEqual({ reason: 'Not toast' });
  });

  it('asks before a member leaves', async () => {
    const user = userEvent.setup();
    const requests = mockClanApi(detail('member'), {
      extra: (r) => (r.method === 'POST' ? noContent() : undefined),
    });
    renderClan();

    await user.click(await screen.findByRole('button', { name: 'Leave clan' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave Crumbs?' });
    await user.click(within(dialog).getByRole('button', { name: 'Leave' }));

    await vi.waitFor(() => {
      expect(sent(requests, 'POST')).toEqual([`/api/v1/clans/${CLAN_ID}/leave`]);
    });
  });

  it('lets an officer approve requests and remove members only', async () => {
    const user = userEvent.setup();
    const requests = mockClanApi(detail('officer'), {
      extra: (r) =>
        r.method === 'POST'
          ? jsonResponse(200, {
              membership: { ...person(request.user.id, '', 'member'), clanId: CLAN_ID },
            })
          : undefined,
    });
    renderClan();

    const panel = await screen.findByRole('region', { name: 'Join requests' });
    await user.click(await within(panel).findByRole('button', { name: 'Approve Nick Newbie' }));
    await vi.waitFor(() => {
      expect(sent(requests, 'POST')).toEqual([
        `/api/v1/clans/${CLAN_ID}/requests/${request.id}/approve`,
      ]);
    });

    await user.click(screen.getByRole('tab', { name: 'Members' }));
    // Not on the Owner, not on themselves.
    expect(screen.getAllByRole('button', { name: /^Actions for/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Actions for Mia Member' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Remove from clan',
    ]);
  });

  it('lets the Owner promote, hand over and remove; and edit in settings', async () => {
    const user = userEvent.setup();
    const requests = mockClanApi(detail('owner'), {
      extra: (r) =>
        r.method === 'PATCH'
          ? jsonResponse(200, {
              membership: { ...person(MEMBER_ID, 'Mia Member', 'officer'), clanId: CLAN_ID },
            })
          : undefined,
    });
    renderClan();

    expect(await screen.findByText(/You're the owner/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Leave clan' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Members' }));
    await user.click(screen.getByRole('button', { name: 'Actions for Mia Member' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Make officer',
      'Make owner',
      'Remove from clan',
    ]);
    await user.click(screen.getByRole('menuitem', { name: 'Make officer' }));
    await vi.waitFor(() => {
      expect(sent(requests, 'PATCH')).toEqual([`/api/v1/clans/${CLAN_ID}/members/${MEMBER_ID}`]);
    });
    expect(await requests.find((r) => r.method === 'PATCH')?.json()).toEqual({ role: 'officer' });

    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Crumbs');
    expect(screen.getByRole('button', { name: 'Delete clan' })).toBeVisible();
  });

  it('hands the clan over after a confirmation', async () => {
    const user = userEvent.setup();
    const requests = mockClanApi(detail('owner'), {
      extra: (r) =>
        r.method === 'POST'
          ? jsonResponse(200, {
              owner: { ...person(OFFICER_ID, 'Otto Officer', 'owner'), clanId: CLAN_ID },
              previousOwner: { ...person(testUser.id, 'Toast Tester', 'officer'), clanId: CLAN_ID },
            })
          : undefined,
    });
    renderClan();

    await user.click(await screen.findByRole('tab', { name: 'Members' }));
    await user.click(screen.getByRole('button', { name: 'Actions for Otto Officer' }));
    await user.click(screen.getByRole('menuitem', { name: 'Make owner' }));
    const dialog = screen.getByRole('dialog', { name: 'Make Otto Officer the owner?' });
    await user.click(within(dialog).getByRole('button', { name: 'Make owner' }));

    await vi.waitFor(() => {
      expect(sent(requests, 'POST')).toEqual([`/api/v1/clans/${CLAN_ID}/transfer`]);
    });
    expect(await requests.find((r) => r.method === 'POST')?.json()).toEqual({
      userId: OFFICER_ID,
    });
  });

  it('says so for an unknown clan', async () => {
    mockClanApi(detail(null));
    renderClan('01900000-0000-7000-8000-000000000399');

    expect(await screen.findByText(/couldn't find this clan/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Browse clans' })).toHaveAttribute('href', '/clans');
  });
});
