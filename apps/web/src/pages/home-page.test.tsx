import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HomeResponse, ToastSessionChangeResponse } from '@toasthub/shared';

import { Toaster } from '@/components/ui/sonner';
import { jsonResponse, mockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession } from '@/test/sessions';

import { HomePage } from './home-page';

const home: HomeResponse = {
  todayCount: 0,
  streak: { current: 2, longest: 5 },
  clanStreak: null,
  fact: { id: 1, text: 'Toast was invented to rescue stale bread.' },
  toastOfTheWeek: null,
};

const created: ToastSessionChangeResponse = {
  session: {
    id: '01900000-0000-7000-8000-0000000000aa',
    loggedAt: '2026-10-29T08:00:00.000Z',
    localDate: '2026-10-29',
    count: 1,
    hasPhoto: false,
    photoUrl: null,
    photoHidden: false,
    editable: true,
  },
  newAchievements: [],
};

const rateLimited = () =>
  jsonResponse(429, { error: { code: 'RATE_LIMITED', message: 'Too many toasts' } });

function renderHome() {
  return renderWithApp(
    <>
      <HomePage />
      <Toaster />
    </>,
    { session: testSession('user'), path: '/home' },
  );
}

/** A response the test releases when it wants, to look at the page while a request is in flight. */
function deferred() {
  let resolve: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const isPost = (request: Request) => request.method === 'POST';
const revokeObjectURL = vi.fn();

/**
 * The multipart body of the one `POST /toast-sessions` that was sent, as text: undici can't parse a body
 * built from jsdom's `File` back into FormData.
 */
async function postedBody(requests: Request[]) {
  const posts = requests.filter(isPost);
  expect(posts).toHaveLength(1);
  const [post] = posts;
  if (!post) throw new Error('No POST');
  expect(post.url).toBe('http://localhost/api/v1/toast-sessions');
  expect(post.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
  return post.text();
}

const countField = (count: number) => `name="count"\r\n\r\n${String(count)}\r\n`;

beforeEach(() => {
  // jsdom has no object URLs; the preview only needs a string.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = revokeObjectURL;
  revokeObjectURL.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Taps "+ Toast" and returns the dialog it opens. */
async function openLogDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Toast' }));
  return screen.getByRole('dialog', { name: 'Log toasts' });
}

describe('HomePage', () => {
  it('shows the counters, the fact and the Toast of the week placeholder', async () => {
    mockApi(() => jsonResponse(200, { ...home, clanStreak: { current: 4, longest: 4 } }));
    renderHome();

    const today = await screen.findByRole('group', { name: 'Today' });
    expect(today).toHaveTextContent('0toasts');
    expect(screen.getByRole('group', { name: 'Streak 🔥' })).toHaveTextContent('2daysLongest: 5');
    expect(screen.getByRole('group', { name: 'Clan streak 🔥' })).toHaveTextContent('4days');
    expect(screen.getByText(home.fact?.text ?? '')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Toast of the week' })).toBeInTheDocument();
  });

  it('links to My toasts', () => {
    mockApi(() => jsonResponse(200, home));
    renderHome();

    expect(screen.getByRole('link', { name: 'My toasts' })).toHaveAttribute('href', '/toasts');
  });

  it('hides the clan streak outside a clan', async () => {
    mockApi(() => jsonResponse(200, home));
    renderHome();

    await screen.findByRole('group', { name: 'Today' });
    expect(screen.queryByRole('group', { name: 'Clan streak 🔥' })).not.toBeInTheDocument();
  });

  it('counts the toast before the server answers, then announces new achievements', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    let saved = false;
    const requests = mockApi((request) => {
      if (isPost(request)) return pending.promise;
      return jsonResponse(
        200,
        saved ? { ...home, todayCount: 1, streak: { current: 3, longest: 5 } } : home,
      );
    });
    renderHome();
    await screen.findByRole('group', { name: 'Today' });

    const dialog = await openLogDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Log 1 toast' }));

    // The open dialog hides the page from the accessibility tree, so the cards are found by their text.
    expect(screen.getByText('Today').closest('[role="group"]')).toHaveTextContent('1toast');
    expect(screen.getByText('Streak 🔥').closest('[role="group"]')).toHaveTextContent('3days');
    expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeDisabled();

    saved = true;
    pending.resolve(jsonResponse(201, { ...created, newAchievements: ['first_bite'] }));
    expect(await screen.findByText('Achievement unlocked: First Bite')).toBeInTheDocument();
    expect(screen.getByText('Log your first toast')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    expect(await postedBody(requests)).toContain(countField(1));
    // The counters are refetched once the toast is saved.
    await vi.waitFor(() => {
      expect(requests.filter((request) => request.method === 'GET')).toHaveLength(2);
    });
  });

  it('logs as many toasts as picked in one request', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      isPost(request) ? jsonResponse(201, created) : jsonResponse(200, home),
    );
    renderHome();
    await screen.findByRole('group', { name: 'Today' });

    const dialog = await openLogDialog(user);
    const fewer = within(dialog).getByRole('button', { name: 'One toast fewer' });
    const more = within(dialog).getByRole('button', { name: 'One toast more' });
    expect(fewer).toBeDisabled();
    await user.click(more);
    await user.click(more);
    await user.click(more);
    await user.click(fewer);
    expect(within(dialog).getByRole('status', { name: 'Toasts' })).toHaveTextContent('3');

    await user.click(within(dialog).getByRole('button', { name: 'Log 3 toasts' }));

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const body = await postedBody(requests);
    expect(body).toContain(countField(3));
    expect(body).not.toContain('name="photo"');
  });

  it('stops at 10 toasts', async () => {
    const user = userEvent.setup();
    mockApi(() => jsonResponse(200, home));
    renderHome();

    const dialog = await openLogDialog(user);
    const more = within(dialog).getByRole('button', { name: 'One toast more' });
    for (let i = 1; i < 10; i++) await user.click(more);

    expect(within(dialog).getByRole('status', { name: 'Toasts' })).toHaveTextContent('10');
    expect(more).toBeDisabled();
  });

  it('takes the count back and says why when logging fails', async () => {
    const user = userEvent.setup();
    mockApi((request) => (isPost(request) ? rateLimited() : jsonResponse(200, home)));
    renderHome();
    await screen.findByRole('group', { name: 'Today' });

    const dialog = await openLogDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'One toast more' }));
    await user.click(within(dialog).getByRole('button', { name: 'Log 2 toasts' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Too many attempts. Wait a while and try again.',
    );
    expect(screen.getByText('Today').closest('[role="group"]')).toHaveTextContent('0toasts');
  });

  it('uploads the photo with the session', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      isPost(request) ? jsonResponse(201, created) : jsonResponse(200, home),
    );
    renderHome();
    const photo = new File(['jpeg bytes'], 'toast.jpg', { type: 'image/jpeg' });

    const dialog = await openLogDialog(user);
    expect(within(dialog).getByRole('button', { name: 'Add a photo' })).toBeInTheDocument();
    await user.upload(fileInput(), photo);

    expect(within(dialog).getByRole('img', { name: 'The photo you picked' })).toHaveAttribute(
      'src',
      'blob:preview',
    );
    expect(requests.some(isPost)).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'One toast more' }));
    await user.click(within(dialog).getByRole('button', { name: 'Log 2 toasts' }));

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const body = await postedBody(requests);
    expect(body).toContain(countField(2));
    // jsdom's File reaches undici as plain text, so only the part itself is checked.
    expect(body).toContain('name="photo"');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('logs without the photo once it is removed', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      isPost(request) ? jsonResponse(201, created) : jsonResponse(200, home),
    );
    renderHome();

    const dialog = await openLogDialog(user);
    await user.upload(fileInput(), new File(['jpeg'], 'toast.jpg', { type: 'image/jpeg' }));
    await user.click(within(dialog).getByRole('button', { name: 'Remove photo' }));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Log 1 toast' }));

    await vi.waitFor(() => {
      expect(requests.some(isPost)).toBe(true);
    });
    expect(await postedBody(requests)).not.toContain('name="photo"');
  });

  it('refuses a photo over 10 MB without uploading it', async () => {
    const user = userEvent.setup();
    const requests = mockApi(() => jsonResponse(200, home));
    renderHome();
    const photo = new File(['x'], 'huge.jpg', { type: 'image/jpeg' });
    Object.defineProperty(photo, 'size', { value: 11 * 1024 * 1024 });

    const dialog = await openLogDialog(user);
    await user.upload(fileInput(), photo);

    expect(within(dialog).getByRole('alert')).toHaveTextContent('larger than 10 MB');
    expect(within(dialog).getByRole('button', { name: 'Log 1 toast' })).toBeDisabled();
    expect(requests.some(isPost)).toBe(false);
  });

  it('shows why the server refused the photo', async () => {
    const user = userEvent.setup();
    mockApi((request) =>
      isPost(request)
        ? jsonResponse(400, {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid photo',
              fields: { photo: 'Unsupported image type' },
            },
          })
        : jsonResponse(200, home),
    );
    renderHome();

    const dialog = await openLogDialog(user);
    await user.upload(fileInput(), new File(['gif'], 'toast.gif', { type: 'image/jpeg' }));
    await user.click(within(dialog).getByRole('button', { name: 'Log 1 toast' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent("We can't read this file.");
  });
});

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('No file input');
  return input;
}
