import {
  type InfiniteData,
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { ClanFeedPage, CreateClan, UpdateClan } from '@toasthub/shared';

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

/** Current members' sessions, newest first (members only). */
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
 * clan (`/me`), the clan streak on home, profiles, whose access follows clan membership (D45), and the
 * boards, which list clans and members.
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

type FeedData = InfiniteData<ClanFeedPage, string | null>;

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
 * 🍞 on a session in the clan feed, shown at once and put back if the request fails. Profiles show
 * likes too, so they are refetched afterwards.
 */
export function useToggleLike(clanId: string) {
  const queryClient = useQueryClient();
  const key = feedKey(clanId);
  return useMutation({
    mutationFn: ({ toastId, liked }: { toastId: string; liked: boolean }) => {
      const params = { params: { path: { id: toastId } } };
      return liked
        ? unwrap(api.POST('/api/v1/toasts/{id}/like', params))
        : unwrap(api.DELETE('/api/v1/toasts/{id}/like', params));
    },
    onMutate: async ({ toastId, liked }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<FeedData>(key);
      if (previous) queryClient.setQueryData(key, withLike(previous, toastId, liked));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
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
