import { infiniteQueryOptions } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';

export const totwQueryKey = ['toast-of-the-week'] as const;

/** Drawn weeks, newest first, a page at a time (`GET /toast-of-the-week`). */
export const totwHistoryQueryOptions = infiniteQueryOptions({
  queryKey: totwQueryKey,
  queryFn: ({ pageParam }) =>
    unwrap(
      api.GET('/api/v1/toast-of-the-week', {
        params: { query: pageParam ? { cursor: pageParam } : {} },
      }),
    ),
  initialPageParam: null as string | null,
  getNextPageParam: (page) => page.nextCursor,
});
