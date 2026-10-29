import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiError } from './errors';

const MAX_RETRIES = 2;

interface QueryClientOptions {
  /** Any request answered with 401: the session ended (expired, revoked, signed out elsewhere). */
  onUnauthenticated?: () => void;
}

export function createQueryClient({ onUnauthenticated }: QueryClientOptions = {}) {
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) onUnauthenticated?.();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // A 4xx won't change on retry; network errors and 5xx might.
        retry: (failureCount, error) =>
          failureCount < MAX_RETRIES &&
          !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
      mutations: { retry: false },
    },
  });
}
