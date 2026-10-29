import { infiniteQueryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { type AchievementCode, PHOTO_FIELD } from '@toasthub/shared';

import { api, unwrap } from '@/api/client';
import { homeQueryKey } from '@/features/home/home-query';
import { leaderboardsQueryKey } from '@/features/leaderboards/leaderboards-api';
import { usersQueryKey } from '@/features/profile/profile-api';

export const toastSessionsQueryKey = ['toast-sessions'] as const;

/** The caller's sessions, newest first, a page at a time (`GET /me/toast-sessions`). */
export const toastSessionsQueryOptions = infiniteQueryOptions({
  queryKey: toastSessionsQueryKey,
  queryFn: ({ pageParam }) =>
    unwrap(
      api.GET('/api/v1/me/toast-sessions', {
        params: { query: pageParam === null ? {} : { cursor: pageParam } },
      }),
    ),
  initialPageParam: null as string | null,
  getNextPageParam: (page) => page.nextCursor,
});

/** A multipart body; the browser sets the boundary for FormData. */
export function sessionForm({ count, photo }: { count?: number; photo?: File }) {
  const form = new FormData();
  if (count !== undefined) form.append('count', String(count));
  if (photo) form.append(PHOTO_FIELD, photo);
  return form;
}

/** One sonner toast per newly earned achievement. */
export function announceAchievements(t: TFunction, codes: readonly AchievementCode[]) {
  for (const code of codes) {
    toast.success(t('home.achievementUnlocked', { name: t(`achievements.${code}.name`) }), {
      description: t(`achievements.${code}.description`),
    });
  }
}

/**
 * A change to a session. Counts and streaks follow it, so home, the list, the profile and the boards are
 * refetched whatever the outcome; achievements it earned pop a toast.
 */
function useSessionMutation<Input, Result>(
  mutationFn: (input: Input) => Promise<Result>,
  achievementsOf: (result: Result) => readonly AchievementCode[] = () => [],
) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      announceAchievements(t, achievementsOf(result));
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: homeQueryKey }),
        queryClient.invalidateQueries({ queryKey: toastSessionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: usersQueryKey }),
        queryClient.invalidateQueries({ queryKey: leaderboardsQueryKey }),
      ]),
  });
}

const sessionPath = (id: string) => ({ params: { path: { id } } });

export function useUpdateSessionCount() {
  return useSessionMutation(
    ({ id, count }: { id: string; count: number }) =>
      unwrap(api.PATCH('/api/v1/toast-sessions/{id}', { ...sessionPath(id), body: { count } })),
    (result) => result.newAchievements,
  );
}

export function useSetSessionPhoto() {
  return useSessionMutation(
    ({ id, photo }: { id: string; photo: File }) =>
      unwrap(
        api.PUT('/api/v1/toast-sessions/{id}/photo', {
          ...sessionPath(id),
          body: { photo: '' },
          bodySerializer: () => sessionForm({ photo }),
        }),
      ),
    (result) => result.newAchievements,
  );
}

export function useRemoveSessionPhoto() {
  return useSessionMutation(({ id }: { id: string }) =>
    unwrap(api.DELETE('/api/v1/toast-sessions/{id}/photo', sessionPath(id))),
  );
}

export function useDeleteSession() {
  return useSessionMutation(({ id }: { id: string }) =>
    unwrap(api.DELETE('/api/v1/toast-sessions/{id}', sessionPath(id))),
  );
}
