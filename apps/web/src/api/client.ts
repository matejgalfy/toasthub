import createClient, { type ClientOptions } from 'openapi-fetch';

import { ApiError, toApiError } from './errors';
import type { paths } from './schema.gen';

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(options: ClientOptions = {}) {
  // Paths in the spec already start with /api/v1, and the API is same-origin (Vite proxy, nginx in prod).
  return createClient<paths>({ baseUrl: '', credentials: 'same-origin', ...options });
}

/** The typed client generated from `apps/api/openapi.json` (`bun run gen:client`). */
export const api = createApiClient();

interface ApiResult {
  data?: unknown;
  error?: unknown;
  response: Response;
}

/** The data of the success branch of an openapi-fetch result; `undefined` for empty (204) bodies. */
type SuccessData<R> = R extends { data: infer D } ? ([D] extends [never] ? undefined : D) : never;

/**
 * Awaits an `api` call and returns its data, or throws an `ApiError` (also for network failures), so
 * TanStack Query sees failures as errors: `queryFn: () => unwrap(api.GET('/api/v1/me'))`.
 */
export async function unwrap<R extends ApiResult>(request: Promise<R>): Promise<SuccessData<R>> {
  let result: R;
  try {
    result = await request;
  } catch (cause) {
    throw new ApiError('NETWORK', 0, cause instanceof Error ? cause.message : 'Network error');
  }
  if (result.error !== undefined || !result.response.ok) {
    throw toApiError(result.response.status, result.error);
  }
  // openapi-fetch's result union can't be narrowed on `error`; past the check this is the success branch.
  return result.data as SuccessData<R>;
}
