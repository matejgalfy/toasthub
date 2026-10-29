import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { HomeResponse } from '@toasthub/shared';

import { api, unwrap } from '@/api/client';
import { leaderboardsQueryKey } from '@/features/leaderboards/leaderboards-api';
import { usersQueryKey } from '@/features/profile/profile-api';
import {
  announceAchievements,
  sessionForm,
  toastSessionsQueryKey,
} from '@/features/toast-sessions/toast-sessions-api';

import { homeQueryKey, withLoggedToasts } from './home-query';

export interface LogToastsInput {
  count: number;
  photo?: File;
}

/**
 * Logs `count` toasts as one `POST /toast-sessions`, which saves all of them or none (SPEC §12 D43). The
 * home counters move before the server answers (SPEC §4.3 acceptance) and are refetched afterwards; each
 * new achievement pops a toast.
 */
export function useLogToasts() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ count, photo }: LogToastsInput) =>
      unwrap(
        api.POST('/api/v1/toast-sessions', {
          // The generated type describes the multipart fields; the body itself is FormData.
          body: {},
          bodySerializer: () => sessionForm(photo ? { count, photo } : { count }),
        }),
      ),
    onMutate: async ({ count }) => {
      await queryClient.cancelQueries({ queryKey: homeQueryKey });
      const previous = queryClient.getQueryData<HomeResponse>(homeQueryKey);
      if (previous) queryClient.setQueryData(homeQueryKey, withLoggedToasts(previous, count));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(homeQueryKey, context.previous);
    },
    onSuccess: ({ newAchievements }) => {
      announceAchievements(t, newAchievements);
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
