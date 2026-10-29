import { queryOptions } from '@tanstack/react-query';

import type { Period } from '@toasthub/shared';

import { api, unwrap } from '@/api/client';

/** Every board starts with this key, so one invalidation after a toast or a clan change covers them all. */
export const leaderboardsQueryKey = ['leaderboards'] as const;

/** Users by toasts in the period, plus the caller's own row (`GET /leaderboards/users`). */
export const userLeaderboardQueryOptions = (period: Period) =>
  queryOptions({
    queryKey: [...leaderboardsQueryKey, 'users', period],
    queryFn: () => unwrap(api.GET('/api/v1/leaderboards/users', { params: { query: { period } } })),
  });

/** Clans by toasts credited to them, plus the caller's clan (`GET /leaderboards/clans`). */
export const clanLeaderboardQueryOptions = (period: Period) =>
  queryOptions({
    queryKey: [...leaderboardsQueryKey, 'clans', period],
    queryFn: () => unwrap(api.GET('/api/v1/leaderboards/clans', { params: { query: { period } } })),
  });

/** One clan's current members by toasts logged for it (`GET /clans/:id/leaderboard`). */
export const clanMemberLeaderboardQueryOptions = (clanId: string, period: Period) =>
  queryOptions({
    queryKey: [...leaderboardsQueryKey, 'clan', clanId, period],
    queryFn: async () =>
      (
        await unwrap(
          api.GET('/api/v1/clans/{id}/leaderboard', {
            params: { path: { id: clanId }, query: { period } },
          }),
        )
      ).items,
  });
