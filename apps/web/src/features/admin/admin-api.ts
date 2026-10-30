import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type {
  AdminUpdateClan,
  FlagStatus,
  FlagType,
  LocalDate,
  ResolveFlag,
  UpdateAppSettings,
  UserStatus,
} from '@toasthub/shared';

import { api, unwrap } from '@/api/client';
import { clanKey, clansQueryKey, useClanMutation } from '@/features/clans/clans-api';
import { homeQueryKey } from '@/features/home/home-query';
import { leaderboardsQueryKey } from '@/features/leaderboards/leaderboards-api';
import { usersQueryKey } from '@/features/profile/profile-api';
import { totwQueryKey } from '@/features/toast-of-the-week/totw-api';

/** Every `/admin/*` query starts with this key. */
export const adminQueryKey = ['admin'] as const;

const settingsKey = [...adminQueryKey, 'settings'] as const;

export interface FlagFilters {
  type: FlagType | null;
  status: FlagStatus | null;
}

/** The flag queue, newest first, a page at a time; a null filter lists every value. */
export const adminFlagsQueryOptions = ({ type, status }: FlagFilters) =>
  infiniteQueryOptions({
    queryKey: [...adminQueryKey, 'flags', type, status],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/admin/flags', {
          params: {
            query: {
              ...(type ? { type } : {}),
              ...(status ? { status } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    placeholderData: keepPreviousData,
  });

/** Users newest first; `search` matches part of the email or display name. */
export const adminUsersQueryOptions = (search: string) =>
  infiniteQueryOptions({
    queryKey: [...adminQueryKey, 'users', search],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/admin/users', {
          params: {
            query: { ...(search ? { search } : {}), ...(pageParam ? { cursor: pageParam } : {}) },
          },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    placeholderData: keepPreviousData,
  });

export const adminSettingsQueryOptions = queryOptions({
  queryKey: settingsKey,
  queryFn: async () => (await unwrap(api.GET('/api/v1/admin/settings'))).settings,
});

export const adminMetricsQueryOptions = queryOptions({
  queryKey: [...adminQueryKey, 'metrics'],
  queryFn: () => unwrap(api.GET('/api/v1/admin/metrics')),
});

/**
 * Rejecting toasts, hiding a photo and banning change what every page counts and shows (SPEC §12 D52),
 * so all of it is refetched: the admin views, home, profiles, boards, Toast of the week and clans.
 */
function invalidateModerated(queryClient: QueryClient) {
  return Promise.all(
    [
      adminQueryKey,
      homeQueryKey,
      usersQueryKey,
      leaderboardsQueryKey,
      totwQueryKey,
      clansQueryKey,
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export function useResolveFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ResolveFlag }) =>
      unwrap(api.POST('/api/v1/admin/flags/{id}/resolve', { params: { path: { id } }, body })),
    onSettled: () => invalidateModerated(queryClient),
  });
}

export function useSetUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      unwrap(
        api.POST('/api/v1/admin/users/{id}/status', {
          params: { path: { id } },
          body: { status },
        }),
      ),
    onSettled: () => invalidateModerated(queryClient),
  });
}

/** Name, description or a new Owner for any clan; refetches like the Owner's own edits. */
export function useAdminUpdateClan(id: string) {
  const queryClient = useQueryClient();
  return useClanMutation(
    (body: AdminUpdateClan) =>
      unwrap(api.PATCH('/api/v1/admin/clans/{id}', { params: { path: { id } }, body })),
    () => {
      void queryClient.invalidateQueries({ queryKey: adminQueryKey });
    },
  );
}

/** Goes back to the clan list first, so the deleted clan isn't refetched into a 404. */
export function useAdminDeleteClan(id: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useClanMutation(
    () => unwrap(api.DELETE('/api/v1/admin/clans/{id}', { params: { path: { id } } })),
    () => {
      void navigate('/admin/clans', { replace: true });
      queryClient.removeQueries({ queryKey: clanKey(id) });
      void queryClient.invalidateQueries({ queryKey: adminQueryKey });
      toast.success(t('admin.clans.deleted'));
    },
  );
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateAppSettings) =>
      (await unwrap(api.PATCH('/api/v1/admin/settings', { body }))).settings,
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKey, settings);
    },
  });
}

/** Draws the week again; home shows last week's winner and profiles show the title. */
export function useRedraw() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (weekStart: LocalDate) =>
      unwrap(
        api.POST('/api/v1/admin/toast-of-the-week/{weekStart}/redraw', {
          params: { path: { weekStart } },
        }),
      ),
    onSettled: () =>
      Promise.all(
        [totwQueryKey, homeQueryKey, usersQueryKey].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}
