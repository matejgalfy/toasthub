import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Locale, UpdateMe } from '@toasthub/shared';

import { api, unwrap } from '@/api/client';
import { meQueryKey } from '@/features/auth/me-query';
import { useSession } from '@/features/auth/session';
import { usersQueryKey } from '@/features/profile/profile-api';
import { changeLocale } from '@/i18n';

/**
 * `PATCH /me`; the response replaces the session's user, so guards and header update at once. The own
 * profile page shows the name and avatar too, so it is refetched.
 */
export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMe) => unwrap(api.PATCH('/api/v1/me', { body })),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(meQueryKey, user);
      void queryClient.invalidateQueries({ queryKey: [...usersQueryKey, user.id] });
    },
  });
}

/** Switches the UI language; for a signed-in user it is also saved to their profile. */
export function useChangeLocale() {
  const session = useSession();
  const { mutate } = useUpdateMe();
  return (locale: Locale) => {
    void changeLocale(locale);
    // If saving fails the switch still applies on this device.
    if (session.status === 'authenticated') mutate({ locale });
  };
}
