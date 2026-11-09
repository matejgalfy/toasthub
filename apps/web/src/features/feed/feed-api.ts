import {
  type InfiniteData,
  infiniteQueryOptions,
  type Query,
  type QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import type { FeedPage } from '@toasthub/shared';

import { api, unwrap } from '@/api/client';
import { usersQueryKey } from '@/features/profile/profile-api';

/**
 * The global feed on home (`GET /feed`). Clan feeds live under their clan's key (`['clans', id, 'feed']`);
 * both list the same sessions with the same likes (SPEC §4.14).
 */
export const feedQueryKey = ['feed'] as const;

export type FeedData = InfiniteData<FeedPage>;

/** Every user's sessions, newest first. */
export const globalFeedQueryOptions = infiniteQueryOptions({
  queryKey: feedQueryKey,
  queryFn: ({ pageParam }) =>
    unwrap(
      api.GET('/api/v1/feed', {
        params: { query: pageParam === null ? {} : { cursor: pageParam } },
      }),
    ),
  initialPageParam: null as string | null,
  getNextPageParam: (page) => page.nextCursor,
});

/** The global feed and every clan's feed: the queries a like shows up in. */
export function isFeedQuery(query: Pick<Query, 'queryKey'>): boolean {
  const key = query.queryKey;
  return key[0] === feedQueryKey[0] || (key[0] === 'clans' && key[2] === 'feed');
}

/** The feed with the like on `toastId` set to `liked`. */
export function withLike(feed: FeedData, toastId: string, liked: boolean): FeedData {
  return {
    ...feed,
    pages: feed.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.toastId !== toastId || item.likedByMe === liked
          ? item
          : { ...item, likedByMe: liked, likeCount: item.likeCount + (liked ? 1 : -1) },
      ),
    })),
  };
}

/**
 * 🍞 on a session, shown at once in every loaded feed (global and clan) and put back if the request fails.
 * Profiles show likes too, so they are refetched afterwards.
 */
export function useToggleLike() {
  const queryClient = useQueryClient();
  const feeds = { predicate: isFeedQuery };
  return useMutation({
    mutationFn: ({ toastId, liked }: { toastId: string; liked: boolean }) => {
      const params = { params: { path: { id: toastId } } };
      return liked
        ? unwrap(api.POST('/api/v1/toasts/{id}/like', params))
        : unwrap(api.DELETE('/api/v1/toasts/{id}/like', params));
    },
    onMutate: async ({ toastId, liked }) => {
      await queryClient.cancelQueries(feeds);
      const previous: [QueryKey, FeedData | undefined][] =
        queryClient.getQueriesData<FeedData>(feeds);
      queryClient.setQueriesData<FeedData>(feeds, (feed) =>
        feed ? withLike(feed, toastId, liked) : feed,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries(feeds),
        queryClient.invalidateQueries({ queryKey: usersQueryKey }),
      ]),
  });
}

/** Reports a photo to the admins; the answer has no body (202). */
export function useReportPhoto() {
  return useMutation({
    mutationFn: ({ toastId, reason }: { toastId: string; reason: string }) =>
      unwrap(
        api.POST('/api/v1/toasts/{id}/report', {
          params: { path: { id: toastId } },
          body: reason.trim() ? { reason: reason.trim() } : {},
        }),
      ),
  });
}
