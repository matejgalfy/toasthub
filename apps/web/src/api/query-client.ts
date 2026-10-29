import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './errors';

const MAX_RETRIES = 2;

export function createQueryClient() {
  return new QueryClient({
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
