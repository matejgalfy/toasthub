import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addDays,
  localDate,
  type ToastSession,
  type ToastSessionChangeResponse,
  type ToastSessionPage,
} from '@toasthub/shared';

import { Toaster } from '@/components/ui/sonner';
import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession } from '@/test/sessions';

import { MyToastsPage } from './my-toasts-page';

const today = localDate(new Date());

function session(overrides: Partial<ToastSession> = {}): ToastSession {
  return {
    id: '01900000-0000-7000-8000-000000000001',
    loggedAt: `${today}T07:15:00.000Z`,
    localDate: today,
    count: 2,
    hasPhoto: false,
    photoUrl: null,
    photoHidden: false,
    editable: true,
    ...overrides,
  };
}

const yesterday = session({
  id: '01900000-0000-7000-8000-000000000002',
  loggedAt: `${addDays(today, -1)}T18:40:00.000Z`,
  localDate: addDays(today, -1),
  count: 1,
  photoUrl: 'https://photos.example/yesterday.webp',
  hasPhoto: true,
  editable: false,
});

const page = (items: ToastSession[], nextCursor: string | null = null): ToastSessionPage => ({
  items,
  nextCursor,
});

const changed = (s: ToastSession): ToastSessionChangeResponse => ({
  session: s,
  newAchievements: [],
});

const isList = (request: Request) =>
  request.method === 'GET' && new URL(request.url).pathname === '/api/v1/me/toast-sessions';

function renderPage() {
  return renderWithApp(
    <>
      <MyToastsPage />
      <Toaster />
    </>,
    { session: testSession('user'), path: '/toasts' },
  );
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Opens the edit dialog of the session row whose name matches. */
async function openEdit(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole('button', { name }));
  return screen.getByRole('dialog', { name: 'Edit toasts' });
}

describe('MyToastsPage', () => {
  it("groups the sessions by day; only today's can be edited", async () => {
    mockApi(() => jsonResponse(200, page([session(), yesterday])));
    renderPage();

    const todaySection = await screen.findByRole('region', { name: 'Today' });
    expect(within(todaySection).getByRole('button', { name: /2 toasts/ })).toBeInTheDocument();

    const [, older] = screen.getAllByRole('region');
    expect(older).toBeDefined();
    if (!older) return;
    expect(within(older).getByRole('heading', { level: 2 }).textContent).toMatch(/\d{4}/);
    expect(within(older).getByText('1 toast')).toBeInTheDocument();
    expect(within(older).queryByRole('button')).not.toBeInTheDocument();
    expect(within(older).getByRole('img')).toHaveAttribute(
      'src',
      'https://photos.example/yesterday.webp',
    );
  });

  it('says so when there are no toasts yet', async () => {
    mockApi(() => jsonResponse(200, page([])));
    renderPage();

    expect(await screen.findByText(/No toasts yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute('href', '/home');
  });

  it('loads older sessions with the cursor', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      new URL(request.url).searchParams.get('cursor') === 'next'
        ? jsonResponse(200, page([yesterday]))
        : jsonResponse(200, page([session()], 'next')),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Show older toasts' }));

    expect(await screen.findByText('1 toast')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show older toasts' })).not.toBeInTheDocument();
    expect(requests.filter(isList).map((r) => new URL(r.url).search)).toEqual(['', '?cursor=next']);
  });

  it('changes the count of a session', async () => {
    const user = userEvent.setup();
    let count = 2;
    const requests = mockApi(async (request) => {
      if (request.method === 'PATCH') {
        count = ((await request.json()) as { count: number }).count;
        return jsonResponse(200, changed(session({ count })));
      }
      return jsonResponse(200, page([session({ count })]));
    });
    renderPage();

    const dialog = await openEdit(user, /2 toasts/);
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'One toast more' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const patch = requests.find((r) => r.method === 'PATCH');
    expect(patch?.url).toBe(`http://localhost/api/v1/toast-sessions/${session().id}`);
    expect(count).toBe(3);
    expect(await screen.findByRole('button', { name: /3 toasts/ })).toBeInTheDocument();
  });

  it('adds a photo without touching the count', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      request.method === 'PUT'
        ? jsonResponse(200, changed(session({ hasPhoto: true, photoUrl: 'https://p.example/a' })))
        : jsonResponse(200, page([session()])),
    );
    renderPage();

    const dialog = await openEdit(user, /2 toasts/);
    await user.upload(fileInput(), new File(['jpeg'], 'toast.jpg', { type: 'image/jpeg' }));
    expect(within(dialog).getByRole('img', { name: 'The photo you picked' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const put = requests.find((r) => r.method === 'PUT');
    expect(put?.url).toBe(`http://localhost/api/v1/toast-sessions/${session().id}/photo`);
    expect(put?.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
    expect(requests.some((r) => r.method === 'PATCH')).toBe(false);
  });

  it('removes the photo', async () => {
    const user = userEvent.setup();
    const withPhoto = session({ hasPhoto: true, photoUrl: 'https://p.example/a' });
    const requests = mockApi((request) =>
      request.method === 'DELETE'
        ? jsonResponse(200, { session: session() })
        : jsonResponse(200, page([withPhoto])),
    );
    renderPage();

    const dialog = await openEdit(user, /2 toasts/);
    expect(within(dialog).getByRole('img', { name: 'The photo of these toasts' })).toHaveAttribute(
      'src',
      'https://p.example/a',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Remove photo' }));
    expect(within(dialog).getByRole('button', { name: 'Add a photo' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => {
      expect(requests.some((r) => r.method === 'DELETE')).toBe(true);
    });
    expect(requests.find((r) => r.method === 'DELETE')?.url).toBe(
      `http://localhost/api/v1/toast-sessions/${session().id}/photo`,
    );
  });

  it('offers only removal for a photo an admin hid', async () => {
    const user = userEvent.setup();
    mockApi(() => jsonResponse(200, page([session({ hasPhoto: true, photoHidden: true })])));
    renderPage();

    const dialog = await openEdit(user, /2 toasts/);
    expect(within(dialog).getByText(/An admin hid this photo/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Add a photo' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove photo' }));
    expect(within(dialog).getByText(/can't get a new one/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
  });

  it('deletes a session after a confirmation', async () => {
    const user = userEvent.setup();
    let deleted = false;
    const requests = mockApi((request) => {
      if (request.method === 'DELETE') {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      return jsonResponse(200, page(deleted ? [] : [session()]));
    });
    renderPage();

    const dialog = await openEdit(user, /2 toasts/);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete these toasts?' });
    expect(confirm).toHaveTextContent('These 2 toasts leave your counts and streak.');
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false);

    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Toasts deleted.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests.find((r) => r.method === 'DELETE')?.url).toBe(
      `http://localhost/api/v1/toast-sessions/${session().id}`,
    );
    expect(await screen.findByText(/No toasts yet/)).toBeInTheDocument();
  });

  it('keeps the dialog open and says why a change failed', async () => {
    const user = userEvent.setup();
    mockApi((request) =>
      request.method === 'PATCH'
        ? jsonResponse(409, { error: { code: 'CONFLICT', message: 'Past its day' } })
        : jsonResponse(200, page([session()])),
    );
    renderPage();

    const dialog = await openEdit(user, /2 toasts/);
    await user.click(within(dialog).getByRole('button', { name: 'One toast fewer' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "That's no longer possible.",
    );
  });
});

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('No file input');
  return input;
}
