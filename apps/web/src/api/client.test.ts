import { describe, expect, it } from 'vitest';

import { createApiClient, unwrap } from './client';
import { ApiError, errorMessageKey } from './errors';

function clientReturning(response: Response | Error) {
  return createApiClient({
    baseUrl: 'http://localhost',
    fetch: () => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)),
  });
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api client', () => {
  it('returns the typed data', async () => {
    const user = { id: '01900000-0000-7000-8000-000000000001', displayName: 'Ann' };
    const data = await unwrap(clientReturning(json(200, { user })).GET('/api/v1/me'));
    expect(data.user.displayName).toBe('Ann');
  });

  it('turns a §8 error body into an ApiError with its code', async () => {
    const body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid',
        fields: { displayName: 'Too short' },
      },
    };
    const error: unknown = await unwrap(
      clientReturning(json(400, body)).PATCH('/api/v1/me', { body: { displayName: 'A' } }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
      fields: { displayName: 'Too short' },
    });
    expect(errorMessageKey(error)).toBe('errors.VALIDATION_ERROR');
  });

  it('reports a non-§8 failure as INTERNAL and a failed fetch as NETWORK', async () => {
    const proxyPage = new Response('Bad Gateway', { status: 502 });
    await expect(unwrap(clientReturning(proxyPage).GET('/api/v1/me'))).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 502,
    });
    await expect(
      unwrap(clientReturning(new TypeError('Failed to fetch')).GET('/api/v1/me')),
    ).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
  });

  it('maps unknown thrown values to the generic message', () => {
    expect(errorMessageKey(new Error('boom'))).toBe('errors.INTERNAL');
  });
});
