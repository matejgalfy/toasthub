import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { PHOTO_FIELD, type CreateToastResponse, type HomeResponse } from '@toasthub/shared';

import { api, unwrap } from '@/api/client';
import { ApiError, errorMessageKey } from '@/api/errors';

import { homeQueryKey, withLoggedToasts } from './home-query';

/** The most toasts one "+ Toast" dialog logs. A client-side cap only; the API's 30/h limit still applies. */
export const MAX_TOASTS_PER_LOG = 10;

export interface LogToastsInput {
  count: number;
  photo?: File;
}

export interface LogToastsResult {
  /** Toasts saved: fewer than asked when a later request failed, and then `error` says why. */
  saved: number;
  newAchievements: CreateToastResponse['newAchievements'];
  error?: unknown;
}

function photoForm(photo: File) {
  const form = new FormData();
  form.append(PHOTO_FIELD, photo);
  return form;
}

function createToast(photo?: File) {
  return unwrap(
    api.POST(
      '/api/v1/toasts',
      // The generated type describes the multipart field; the browser sets the boundary for FormData.
      photo ? { body: {}, bodySerializer: () => photoForm(photo) } : {},
    ),
  );
}

/**
 * Logs `count` toasts as one `POST /toasts` each, in order. The photo goes with the first one only, so a
 * bad photo fails before anything is saved. If a later request fails, the toasts saved so far stay and
 * the mutation still succeeds with `saved < count`. The home counters move before the server answers
 * (SPEC §4.3 acceptance) and are refetched afterwards; each new achievement pops a toast.
 */
export function useLogToasts() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async ({ count, photo }: LogToastsInput): Promise<LogToastsResult> => {
      const newAchievements: LogToastsResult['newAchievements'] = [];
      for (let saved = 0; saved < count; saved++) {
        try {
          const created = await createToast(saved === 0 ? photo : undefined);
          newAchievements.push(...created.newAchievements);
        } catch (error) {
          if (saved === 0) throw error;
          return { saved, newAchievements, error };
        }
      }
      return { saved: count, newAchievements };
    },
    onMutate: async ({ count }) => {
      await queryClient.cancelQueries({ queryKey: homeQueryKey });
      const previous = queryClient.getQueryData<HomeResponse>(homeQueryKey);
      if (previous) queryClient.setQueryData(homeQueryKey, withLoggedToasts(previous, count));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(homeQueryKey, context.previous);
    },
    onSuccess: ({ saved, newAchievements, error }, { count }) => {
      if (saved < count) {
        toast.error(t('home.log.partial', { saved, total: count }), {
          description: t(errorMessageKey(error)),
        });
      }
      for (const code of newAchievements) {
        toast.success(t('home.achievementUnlocked', { name: t(`achievements.${code}.name`) }), {
          description: t(`achievements.${code}.description`),
        });
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: homeQueryKey }),
  });
}

/** The message for a failed first toast; the server names the photo field when it can't read the file. */
export function photoErrorMessageKey(error: unknown) {
  if (error instanceof ApiError && error.fields?.[PHOTO_FIELD]) return 'home.photo.invalid';
  if (error instanceof ApiError && error.code === 'PAYLOAD_TOO_LARGE') return 'home.photo.tooLarge';
  return errorMessageKey(error);
}
