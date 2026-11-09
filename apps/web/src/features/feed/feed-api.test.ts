import { describe, expect, it } from 'vitest';

import type { FeedItem } from '@toasthub/shared';

import { isFeedQuery, withLike } from './feed-api';

const item = (toastId: string, likeCount: number, likedByMe: boolean): FeedItem => ({
  sessionId: `session-${toastId}`,
  toastId,
  user: { id: 'user', displayName: 'Mia', avatarId: null },
  loggedAt: '2026-10-28T07:00:00.000Z',
  localDate: '2026-10-28',
  count: 1,
  photoUrl: null,
  likeCount,
  likedByMe,
});

const feed = (...items: FeedItem[][]) => ({
  pages: items.map((page) => ({ items: page, nextCursor: null })),
  pageParams: items.map(() => null),
});

describe('withLike', () => {
  it('likes and unlikes one session on any page', () => {
    const before = feed([item('a', 0, false)], [item('b', 2, true)]);

    const liked = withLike(before, 'a', true);
    expect(liked.pages[0]?.items[0]).toMatchObject({ likeCount: 1, likedByMe: true });
    // Other sessions keep their identity, so their rows don't re-render.
    expect(liked.pages[1]?.items[0]).toBe(before.pages[1]?.items[0]);

    const unliked = withLike(before, 'b', false);
    expect(unliked.pages[1]?.items[0]).toMatchObject({ likeCount: 1, likedByMe: false });
  });

  it("doesn't count a like twice", () => {
    const before = feed([item('a', 3, true)]);
    expect(withLike(before, 'a', true).pages[0]?.items[0]).toBe(before.pages[0]?.items[0]);
  });
});

describe('isFeedQuery', () => {
  it('matches the global feed and every clan feed, nothing else', () => {
    expect(isFeedQuery({ queryKey: ['feed'] })).toBe(true);
    expect(isFeedQuery({ queryKey: ['clans', 'c1', 'feed'] })).toBe(true);
    expect(isFeedQuery({ queryKey: ['clans', 'c1'] })).toBe(false);
    expect(isFeedQuery({ queryKey: ['clans', 'list', ''] })).toBe(false);
    expect(isFeedQuery({ queryKey: ['users', 'u1', 'toasts'] })).toBe(false);
  });
});
