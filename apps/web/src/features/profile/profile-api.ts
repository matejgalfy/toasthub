import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query';

import { api, unwrap } from '@/api/client';

/**
 * Every profile query starts with this key. Changes to toasts (log, edit, delete) and to the own profile
 * invalidate all of it: counts, stats, the heatmap, achievements and photos may all follow.
 */
export const usersQueryKey = ['users'] as const;

const userPath = (id: string) => ({ params: { path: { id } } });

export const profileQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...usersQueryKey, id],
    queryFn: async () => (await unwrap(api.GET('/api/v1/users/{id}', userPath(id)))).profile,
  });

export const statsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...usersQueryKey, id, 'stats'],
    queryFn: () => unwrap(api.GET('/api/v1/users/{id}/stats', userPath(id))),
  });

export const heatmapQueryOptions = (id: string, year: number) =>
  queryOptions({
    queryKey: [...usersQueryKey, id, 'heatmap', year],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/users/{id}/heatmap', {
          params: { path: { id }, query: { year } },
        }),
      ),
    // Keeps the previous year on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

export const achievementsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...usersQueryKey, id, 'achievements'],
    queryFn: async () =>
      (await unwrap(api.GET('/api/v1/users/{id}/achievements', userPath(id)))).items,
  });

/** The visible photos, one per session, newest first (SPEC §12 D45). */
export const userToastsQueryOptions = (id: string) =>
  infiniteQueryOptions({
    queryKey: [...usersQueryKey, id, 'toasts'],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/users/{id}/toasts', {
          params: { path: { id }, query: pageParam === null ? {} : { cursor: pageParam } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
