import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { CreateClan, UpdateClan } from '@toasthub/shared';

import { api, unwrap } from '@/api/client';
import { meQueryKey } from '@/features/auth/me-query';
import { homeQueryKey } from '@/features/home/home-query';
import { leaderboardsQueryKey } from '@/features/leaderboards/leaderboards-api';
import { usersQueryKey } from '@/features/profile/profile-api';
import { announceAchievements } from '@/features/toast-sessions/toast-sessions-api';

/** Every clan query starts with this key: the browser, each clan, its feed and its requests. */
export const clansQueryKey = ['clans'] as const;

export const clanKey = (id: string) => [...clansQueryKey, id] as const;
const feedKey = (id: string) => [...clanKey(id), 'feed'] as const;
const clanPath = (id: string) => ({ params: { path: { id } } });

/** Clans by name, A–Z, a page at a time; blank `search` lists them all (`GET /clans`). */
export const clanListQueryOptions = (search: string) =>
  infiniteQueryOptions({
    queryKey: [...clansQueryKey, 'list', search],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/clans', {
          params: {
            query: { ...(search ? { search } : {}), ...(pageParam ? { cursor: pageParam } : {}) },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    // Keeps the previous results on screen while a new search loads.
    placeholderData: keepPreviousData,
  });

/** Members, streak and the caller's role and request (`GET /clans/:id`). */
export const clanQueryOptions = (id: string) =>
  queryOptions({
    queryKey: clanKey(id),
    queryFn: () => unwrap(api.GET('/api/v1/clans/{id}', clanPath(id))),
  });

/** Current members' sessions, newest first (members only); likes go through `features/feed`. */
export const clanFeedQueryOptions = (id: string) =>
  infiniteQueryOptions({
    queryKey: feedKey(id),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/clans/{id}/feed', {
          params: { path: { id }, query: pageParam === null ? {} : { cursor: pageParam } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

/** Pending join requests, oldest first (Officers and the Owner). */
export const clanRequestsQueryOptions = (id: string) =>
  queryOptions({
    queryKey: [...clanKey(id), 'requests'],
    queryFn: async () => (await unwrap(api.GET('/api/v1/clans/{id}/requests', clanPath(id)))).items,
  });

/**
 * A change to clan membership or roles. Afterwards every clan query is refetched, and so are the caller's
 * clan (`/me`), the clan streak on home, profiles and the boards, which list clans and members.
 */
export function useClanMutation<Input, Result>(
  mutationFn: (input: Input) => Promise<Result>,
  onSuccess?: (result: Result, input: Input) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: clansQueryKey }),
        queryClient.invalidateQueries({ queryKey: meQueryKey }),
        queryClient.invalidateQueries({ queryKey: homeQueryKey }),
        queryClient.invalidateQueries({ queryKey: usersQueryKey }),
        queryClient.invalidateQueries({ queryKey: leaderboardsQueryKey }),
      ]),
  });
}

/** Founding a clan can earn `clansman`. */
export function useCreateClan() {
  const { t } = useTranslation();
  return useClanMutation(
    (body: CreateClan) => unwrap(api.POST('/api/v1/clans', { body })),
    (result) => {
      announceAchievements(t, result.newAchievements);
    },
  );
}

export function useUpdateClan(id: string) {
  return useClanMutation((body: UpdateClan) =>
    unwrap(api.PATCH('/api/v1/clans/{id}', { ...clanPath(id), body })),
  );
}

/**
 * Leaves the page first, so the deleted clan isn't refetched into a 404 under the user. The notice is
 * shown here because the page that asked is gone by the time the request settles.
 */
export function useDeleteClan(id: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useClanMutation(
    () => unwrap(api.DELETE('/api/v1/clans/{id}', clanPath(id))),
    () => {
      void navigate('/clans', { replace: true });
      queryClient.removeQueries({ queryKey: clanKey(id) });
      toast.success(t('clans.settings.deleted'));
    },
  );
}

export function useJoinClan(id: string) {
  return useClanMutation(() => unwrap(api.POST('/api/v1/clans/{id}/join', clanPath(id))));
}

export function useCancelJoinRequest() {
  return useClanMutation(() => unwrap(api.DELETE('/api/v1/me/clan-request')));
}

/** The feed is members only: drop it, so the refetch after leaving doesn't end in a 403. */
export function useLeaveClan(id: string) {
  const queryClient = useQueryClient();
  return useClanMutation(
    () => unwrap(api.POST('/api/v1/clans/{id}/leave', clanPath(id))),
    () => {
      queryClient.removeQueries({ queryKey: feedKey(id) });
    },
  );
}

export function useDecideJoinRequest(id: string) {
  return useClanMutation(({ requestId, approve }: { requestId: string; approve: boolean }) => {
    const params = { params: { path: { id, rid: requestId } } };
    return approve
      ? unwrap(api.POST('/api/v1/clans/{id}/requests/{rid}/approve', params))
      : unwrap(api.POST('/api/v1/clans/{id}/requests/{rid}/reject', params));
  });
}

export function useChangeMemberRole(id: string) {
  return useClanMutation(({ userId, role }: { userId: string; role: 'officer' | 'member' }) =>
    unwrap(
      api.PATCH('/api/v1/clans/{id}/members/{userId}', {
        params: { path: { id, userId } },
        body: { role },
      }),
    ),
  );
}

export function useKickMember(id: string) {
  return useClanMutation(({ userId }: { userId: string }) =>
    unwrap(api.DELETE('/api/v1/clans/{id}/members/{userId}', { params: { path: { id, userId } } })),
  );
}

export function useTransferClan(id: string) {
  return useClanMutation(({ userId }: { userId: string }) =>
    unwrap(api.POST('/api/v1/clans/{id}/transfer', { ...clanPath(id), body: { userId } })),
  );
}
