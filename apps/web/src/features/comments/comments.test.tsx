import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Comment, CommentPage, UserToast } from '@toasthub/shared';

import { PhotoGrid } from '@/features/profile/photo-grid';
import { jsonResponse, mockApi as baseMockApi } from '@/test/api';
import { renderWithApp } from '@/test/render';
import { testSession } from '@/test/sessions';

import { Comments } from './comments';

const TOAST = '01900000-0000-7000-8000-000000000001';
const ROOT = '01900000-0000-7000-8000-000000000002';
const REPLY = '01900000-0000-7000-8000-000000000003';
const comment = (id: string, body: string, parentId: string | null = null): Comment => ({
  id,
  toastId: TOAST,
  parentId,
  body,
  author: { id: '01900000-0000-7000-8000-000000000004', displayName: 'Mia', avatarId: null },
  createdAt: '2026-10-28T07:00:00.000Z',
  deleted: false,
  canDelete: true,
  likeCount: 0,
  likedByMe: false,
});
const page = (items: Comment[], nextCursor: string | null = null) => ({ items, nextCursor });
function mockApi(respond: Parameters<typeof baseMockApi>[0]) {
  return baseMockApi(async (request) => {
    const response = await respond(request);
    const url = new URL(request.url);
    if (request.method !== 'GET' || !url.pathname.endsWith('/comments') || !response.ok)
      return response;
    const body = (await response.json()) as CommentPage;
    const topLevel = url.searchParams.get('topLevel') === 'true';
    const items = topLevel ? body.items.filter((item) => item.parentId === null) : body.items;
    const limit = Number(url.searchParams.get('limit') ?? 20);
    return jsonResponse(response.status, {
      items: items.slice(0, limit),
      nextCursor: items.length > limit ? 'more-comments' : topLevel ? null : body.nextCursor,
    });
  });
}

const renderComments = () =>
  renderWithApp(<Comments toastId={TOAST} />, { session: testSession('user') });

afterEach(() => vi.restoreAllMocks());

describe('Comments', () => {
  it('previews three roots without fetching or showing replies', async () => {
    const user = userEvent.setup();
    const requests = mockApi(() =>
      jsonResponse(
        200,
        page([
          comment(ROOT, 'Preview root'),
          comment(REPLY, 'Preview reply', ROOT),
          comment('third', 'Preview third'),
          comment('fourth', 'Preview fourth'),
        ]),
      ),
    );
    renderComments();
    expect(await screen.findByText('Preview root')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Preview third')).toBeVisible();
    expect(screen.getByText('Preview fourth')).toBeVisible();
    expect(screen.queryByText('Preview reply')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Comment' })).toBeVisible();
    expect(requests).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Show all comments' }));
    expect(await screen.findByText('Preview reply')).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(new URL(requests[0]?.url ?? '').searchParams.get('topLevel')).toBe('true');
    expect(new URL(requests[0]?.url ?? '').searchParams.get('limit')).toBe('3');
    expect(new URL(requests[1]?.url ?? '').searchParams.has('topLevel')).toBe(false);
  });

  it('fills the third preview slot with a reply when there are only two roots', async () => {
    const requests = mockApi(() =>
      jsonResponse(
        200,
        page([
          comment(ROOT, 'First root'),
          comment(REPLY, 'First reply', ROOT),
          comment('second-root', 'Second root'),
          comment('second-reply', 'Hidden reply', 'second-root'),
        ]),
      ),
    );
    renderComments();
    expect(await screen.findByText('First reply')).toBeVisible();
    expect(screen.getByText('First root')).toBeVisible();
    expect(screen.getByText('Second root')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('Hidden reply')).not.toBeInTheDocument();
    expect(requests.map((request) => new URL(request.url).search)).toEqual([
      '?topLevel=true&limit=3',
      '?limit=3',
    ]);
  });

  it('creates trimmed roots and replies to deleted placeholders with the correct requests', async () => {
    const user = userEvent.setup();
    const deleted = {
      ...comment(ROOT, 'removed'),
      body: null,
      author: null,
      deleted: true,
      canDelete: false,
    };
    const items: Comment[] = [deleted];
    const requests = mockApi(async (request) => {
      if (request.method === 'POST') {
        const input = (await request.json()) as { body: string; parentId?: string };
        const created = comment(
          input.parentId ? REPLY : 'new-root',
          input.body,
          input.parentId ?? null,
        );
        items.push(created);
        return jsonResponse(201, created);
      }
      return jsonResponse(200, page([...items]));
    });
    renderComments();
    expect(await screen.findByText('Deleted comment')).toBeVisible();
    await user.type(screen.getByRole('textbox', { name: 'Comment' }), '  A root  ');
    await user.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(await screen.findByText('A root')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Reply to Deleted comment' }));
    await user.type(screen.getByRole('textbox', { name: 'Reply' }), '  A reply  ');
    await user.click(screen.getByRole('button', { name: 'Post reply' }));
    expect(await screen.findByText('A reply')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show all comments' }));
    const bodies = await Promise.all(
      requests.filter((request) => request.method === 'POST').map((request) => request.json()),
    );
    expect(bodies).toEqual([{ body: 'A root' }, { body: 'A reply', parentId: ROOT }]);
    expect(screen.getByText('Reply to Deleted comment')).toBeVisible();
  });

  it('deletes with a placeholder preserving nested replies', async () => {
    const user = userEvent.setup();
    let root = comment(ROOT, 'Root body');
    const requests = mockApi((request) => {
      if (request.method === 'DELETE') {
        root = { ...root, body: null, author: null, deleted: true, canDelete: false };
        return new Response(null, { status: 204 });
      }
      return jsonResponse(200, page([root, comment(REPLY, 'Reply body', ROOT)]));
    });
    renderComments();
    expect(await screen.findByText('Root body')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show all comments' }));
    await screen.findByText('Reply body');
    const deleteButton = screen.getAllByRole('button', { name: 'Delete comment by Mia' })[0];
    if (!deleteButton) throw new Error('Missing root delete button');
    await user.click(deleteButton);
    const dialog = await screen.findByRole('dialog', { name: 'Delete this comment?' });
    expect(
      within(dialog).getByText(
        'Your comment will be replaced with a deleted placeholder. Replies will stay in the thread.',
      ),
    ).toBeVisible();
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Deleted comment')).toBeVisible();
    expect(screen.getByText('Reply body')).toBeVisible();
    expect(screen.queryByText('Root body')).not.toBeInTheDocument();
    expect(requests.find((request) => request.method === 'DELETE')?.url).toContain(
      `/api/v1/comments/${ROOT}`,
    );
  });

  it('likes and unlikes a comment with the count synchronized across entrypoints', async () => {
    const user = userEvent.setup();
    let root = comment(ROOT, 'React to this');
    const requests = mockApi((request) => {
      if (new URL(request.url).pathname.endsWith('/like')) {
        const liked = request.method === 'POST';
        root = { ...root, likeCount: liked ? 1 : 0, likedByMe: liked };
        return new Response(null, { status: 204 });
      }
      return jsonResponse(200, page([root]));
    });
    renderWithApp(
      <>
        <Comments toastId={TOAST} />
        <Comments toastId={TOAST} />
      </>,
      { session: testSession('user') },
    );
    const before = await screen.findAllByRole('button', { name: 'Like 0' });
    const first = before[0];
    if (!first) throw new Error('Missing comment reaction');
    expect(first).toHaveAttribute('aria-pressed', 'false');
    await user.click(first);
    const liked = await screen.findAllByRole('button', { name: 'Like 1' });
    expect(liked).toHaveLength(2);
    for (const button of liked) expect(button).toHaveAttribute('aria-pressed', 'true');
    const unlike = liked[0];
    if (!unlike) throw new Error('Missing liked comment reaction');
    await user.click(unlike);
    expect(await screen.findAllByRole('button', { name: 'Like 0' })).toHaveLength(2);
    const reactions = requests.filter((request) => new URL(request.url).pathname.endsWith('/like'));
    expect(reactions.map((request) => request.method)).toEqual(['POST', 'DELETE']);
    expect(
      reactions.every(
        (request) => new URL(request.url).pathname === `/api/v1/comments/${ROOT}/like`,
      ),
    ).toBe(true);
  });

  it('does not allow reactions to deleted placeholders', async () => {
    mockApi(() =>
      jsonResponse(
        200,
        page([
          {
            ...comment(ROOT, 'Removed'),
            body: null,
            author: null,
            deleted: true,
            canDelete: false,
          },
        ]),
      ),
    );
    renderComments();
    expect(await screen.findByText('Deleted comment')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Like / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reply to Deleted comment' })).toBeVisible();
  });

  it('shows reaction errors without changing the displayed count', async () => {
    const user = userEvent.setup();
    mockApi((request) =>
      new URL(request.url).pathname.endsWith('/like')
        ? jsonResponse(500, { error: { code: 'INTERNAL', message: 'Failed' } })
        : jsonResponse(200, page([comment(ROOT, 'Root')])),
    );
    renderComments();
    await user.click(await screen.findByRole('button', { name: 'Like 0' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Like 0' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('synchronizes mutations across mounted entrypoints for the same toast', async () => {
    const user = userEvent.setup();
    const items: Comment[] = [];
    const requests = mockApi((request) => {
      if (request.method === 'POST') {
        const created = comment(ROOT, 'Synced comment');
        items.push(created);
        return jsonResponse(201, created);
      }
      return jsonResponse(200, page([...items]));
    });
    renderWithApp(
      <>
        <Comments toastId={TOAST} />
        <Comments toastId={TOAST} />
      </>,
      { session: testSession('user') },
    );
    await screen.findAllByText('No comments yet.');
    const input = screen.getAllByRole('textbox', { name: 'Comment' })[0];
    const submit = screen.getAllByRole('button', { name: 'Post comment' })[0];
    if (!input || !submit) throw new Error('Missing first composer');
    await user.type(input, 'Synced comment');
    await user.click(submit);
    expect(await screen.findAllByText('Synced comment')).toHaveLength(2);
    expect(requests.filter((request) => request.method === 'GET')).toHaveLength(4);
  });

  it('cancels deletion without sending a mutation', async () => {
    const user = userEvent.setup();
    const requests = mockApi(() => jsonResponse(200, page([comment(ROOT, 'Keep root')])));
    renderComments();
    await user.click(await screen.findByRole('button', { name: 'Delete comment by Mia' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this comment?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Keep root')).toBeVisible();
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
  });

  it('keeps delete confirmation open with errors and allows retry', async () => {
    const user = userEvent.setup();
    let failed = true;
    let root = comment(ROOT, 'Root');
    mockApi((request) => {
      if (request.method === 'DELETE') {
        if (failed) return jsonResponse(500, { error: { code: 'INTERNAL', message: 'Failed' } });
        root = { ...root, body: null, author: null, deleted: true, canDelete: false };
        return new Response(null, { status: 204 });
      }
      return jsonResponse(200, page([root]));
    });
    renderComments();
    await user.click(await screen.findByRole('button', { name: 'Delete comment by Mia' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this comment?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toBeVisible();
    failed = false;
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Deleted comment')).toBeVisible();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('loads the next page and places replies under their parent', async () => {
    const user = userEvent.setup();
    const requests = mockApi((request) =>
      jsonResponse(
        200,
        new URL(request.url).searchParams.get('cursor')
          ? page([comment(REPLY, 'Child', ROOT)])
          : page([comment(ROOT, 'Root')], 'next'),
      ),
    );
    renderComments();
    await user.click(await screen.findByRole('button', { name: 'Show all comments' }));
    await user.click(await screen.findByRole('button', { name: 'Show more comments' }));
    expect(await screen.findByText('Child')).toBeVisible();
    const rows = screen.getAllByRole('listitem');
    expect(rows[1]?.getAttribute('style')).toContain('margin-inline-start: 0.75rem');
    expect(requests.map((request) => new URL(request.url).search)).toEqual([
      '?topLevel=true&limit=3',
      '?limit=3',
      '',
      '?cursor=next',
    ]);
    expect(screen.queryByRole('button', { name: 'Show more comments' })).not.toBeInTheDocument();
  });

  it('keeps submitted text on errors and allows a retry', async () => {
    const user = userEvent.setup();
    let fail = true;
    mockApi((request) => {
      if (request.method === 'POST')
        return fail
          ? jsonResponse(500, { error: { code: 'INTERNAL', message: 'Failed' } })
          : jsonResponse(201, comment(ROOT, 'Keep this'));
      return jsonResponse(200, page([]));
    });
    renderComments();
    await screen.findByText('No comments yet.');
    const input = screen.getByRole('textbox', { name: 'Comment' });
    await user.type(input, 'Keep this');
    await user.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(input).toHaveValue('Keep this');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Post comment' }));
    await vi.waitFor(() => expect(input).toHaveValue(''));
  });

  it('retries query errors and disables whitespace-only submissions', async () => {
    const user = userEvent.setup();
    let fail = true;
    mockApi(() =>
      fail
        ? jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Failed' } })
        : jsonResponse(200, page([])),
    );
    renderComments();
    expect(await screen.findByRole('alert')).toBeVisible();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No comments yet.')).toBeVisible();
    await user.type(screen.getByRole('textbox', { name: 'Comment' }), '   ');
    expect(screen.getByRole('button', { name: 'Post comment' })).toBeDisabled();
  });

  it('caps visual indentation and links deep reply context to the exact parent', async () => {
    const comments = Array.from({ length: 6 }, (_, index) =>
      comment(String(index), `Body ${String(index)}`, index ? String(index - 1) : null),
    );
    mockApi(() => jsonResponse(200, page(comments)));
    renderComments();
    await screen.findByText('Body 0');
    expect(await screen.findByText('Body 1')).toBeVisible();
    expect(screen.getByText('Body 2')).toBeVisible();
    expect(screen.queryByText('Body 3')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show all comments' }));
    await screen.findByText('Body 5');
    const rows = screen.getAllByRole('listitem');
    expect(rows[4]?.getAttribute('style')).toContain('margin-inline-start: 2.25rem');
    expect(rows[5]?.getAttribute('style')).toContain('margin-inline-start: 2.25rem');
    const deepest = rows[5];
    const parent = rows[4];
    if (!deepest || !parent) throw new Error('Missing deepest reply or parent');
    expect(within(deepest).getByRole('link', { name: 'Reply to Mia' })).toHaveAttribute(
      'href',
      `#${parent.id}`,
    );
  });

  it('opens profile photos in a dialog with lazily fetched comments', async () => {
    const user = userEvent.setup();
    const photo: UserToast = {
      id: TOAST,
      sessionId: ROOT,
      eatenAt: '2026-10-28T07:00:00.000Z',
      localDate: '2026-10-28',
      count: 1,
      photoUrl: 'https://photos.example/toast.webp',
      likeCount: 0,
      likedByMe: false,
    };
    const requests = mockApi((request) =>
      jsonResponse(
        200,
        new URL(request.url).pathname.endsWith('/comments')
          ? page([comment(ROOT, 'Photo comment')])
          : { items: [photo], nextCursor: null },
      ),
    );
    renderWithApp(<PhotoGrid userId={ROOT} />, { session: testSession('user') });
    const button = await screen.findByRole('button', {
      name: 'Open photo and comments: 1 toast on 28 October 2026',
    });
    expect(requests).toHaveLength(1);
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Photo and comments' });
    expect(await within(dialog).findByText('Photo comment')).toBeVisible();
    expect(requests.at(-1)?.url).toContain(`/toasts/${TOAST}/comments`);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await vi.waitFor(() => expect(button).toHaveFocus());
  });
});
