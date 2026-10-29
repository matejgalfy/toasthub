import { queryOptions } from '@tanstack/react-query';

import type { Me } from '@toasthub/shared';

import { api, unwrap } from '@/api/client';
import { ApiError } from '@/api/errors';

export const meQueryKey = ['me'] as const;

/** The signed-in user, or `null` when there is no session (a 401 is an answer here, not an error). */
export const meQueryOptions = queryOptions({
  queryKey: meQueryKey,
  queryFn: async (): Promise<Me | null> => {
    try {
      return (await unwrap(api.GET('/api/v1/me'))).user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
});
