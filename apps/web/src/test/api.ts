import { vi } from 'vitest';

import { api, createApiClient } from '@/api/client';

/**
 * Answers every `api.<method>` call with `respond(request)` instead of the network. Returns the requests,
 * so a test can check what was sent.
 */
export function mockApi(respond: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const fake = createApiClient({
    baseUrl: 'http://localhost',
    fetch: async (request: Request) => {
      requests.push(request.clone());
      return respond(request);
    },
  });
  for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const) {
    vi.spyOn(api, method).mockImplementation(fake[method] as never);
  }
  return requests;
}

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
