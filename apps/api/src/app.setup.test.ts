import { afterEach, describe, expect, it } from 'vitest';

import { createFastifyAdapter } from './app.setup';

let adapter: ReturnType<typeof createFastifyAdapter> | undefined;

afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
});

async function clientIp(trustProxyHops: number): Promise<string> {
  adapter = createFastifyAdapter(trustProxyHops);
  const fastify = adapter.getInstance();
  fastify.get('/ip', (request) => ({ ip: request.ip }));
  const res = await fastify.inject({
    url: '/ip',
    remoteAddress: '10.42.0.7',
    // The client's own (fake) entry first, then the one the ingress appended.
    headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' },
  });
  return res.json<{ ip: string }>().ip;
}

describe('createFastifyAdapter', () => {
  it('ignores X-Forwarded-For without trusted proxies', async () => {
    expect(await clientIp(0)).toBe('10.42.0.7');
  });

  it('takes the address the trusted proxy saw, not one the client sent', async () => {
    expect(await clientIp(1)).toBe('203.0.113.9');
  });
});
