import { queryOptions } from '@tanstack/react-query';

import type { HomeResponse } from '@toasthub/shared';

import { api, unwrap } from '@/api/client';

export const homeQueryKey = ['home'] as const;

export const homeQueryOptions = queryOptions({
  queryKey: homeQueryKey,
  queryFn: (): Promise<HomeResponse> => unwrap(api.GET('/api/v1/home')),
});

/**
 * The home data as it will be once the `count` toasts being logged are saved, so the counters update at
 * once. The current streak already counts up to yesterday, so only the first toast of the day extends it.
 * The clan streak is left to the refetch: another member may already have toasted today.
 */
export function withLoggedToasts(home: HomeResponse, count: number): HomeResponse {
  if (count === 0) return home;
  const todayCount = home.todayCount + count;
  if (home.todayCount > 0) return { ...home, todayCount };
  const current = home.streak.current + 1;
  return {
    ...home,
    todayCount,
    streak: { current, longest: Math.max(home.streak.longest, current) },
  };
}
