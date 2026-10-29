import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { createTestApp } from '../../../test/create-app';

let app: NestFastifyApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('health probes', () => {
  it('reports ready when the database answers', async () => {
    app = await createTestApp();
    const res = await app.inject({ url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('reports live', async () => {
    app = await createTestApp();
    const res = await app.inject({ url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('serves the probes outside the /api/v1 prefix only', async () => {
    app = await createTestApp();
    const res = await app.inject({ url: '/api/v1/readyz' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 503 in the error format when the database is unreachable', async () => {
    app = await createTestApp({ DATABASE_URL: 'postgres://nobody:none@127.0.0.1:1/none' });
    const res = await app.inject({ url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });
});
