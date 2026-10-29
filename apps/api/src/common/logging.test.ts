import { Writable } from 'node:stream';

import { Controller, Get, Logger as NestLogger } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Logger, LoggerModule } from 'nestjs-pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { testConfigProvider } from '../../test/config-provider';
import { configureApp, createFastifyAdapter } from '../app.setup';
import { pinoHttpOptions, redactUrl } from './logging';

describe('redactUrl', () => {
  it('masks secret query values and keeps the rest', () => {
    expect(
      redactUrl('/api/v1/auth/magic-link/verify?token=abc123&callbackURL=%2Fhome&page=2'),
    ).toBe('/api/v1/auth/magic-link/verify?token=%5Bredacted%5D&callbackURL=%5Bredacted%5D&page=2');
  });

  it('leaves URLs without a query alone', () => {
    expect(redactUrl('/api/v1/me')).toBe('/api/v1/me');
  });
});

const lines: Record<string, unknown>[] = [];
const sink = new Writable({
  write(chunk: Buffer, _encoding, done) {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      lines.push(JSON.parse(line) as Record<string, unknown>);
    }
    done();
  },
});

@Controller('echo')
class EchoController {
  private readonly logger = new NestLogger(EchoController.name);

  @Get()
  echo(): { ok: true } {
    this.logger.log({ user: { email: 'ann@example.com', token: 'tok_123' } }, 'handled');
    return { ok: true };
  }
}

let app: NestFastifyApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      LoggerModule.forRoot({
        pinoHttp: [pinoHttpOptions({ LOG_LEVEL: 'info', NODE_ENV: 'test' }), sink],
      }),
    ],
    controllers: [EchoController],
    providers: [testConfigProvider()],
  }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  lines.length = 0;
});

describe('request logging', () => {
  it('echoes a well-formed incoming request ID and logs it', async () => {
    const res = await app.inject({ url: '/api/v1/echo', headers: { 'x-request-id': 'abc-123' } });
    expect(res.headers['x-request-id']).toBe('abc-123');
    const completed = lines.find((line) => line.msg === 'request completed');
    expect(completed).toMatchObject({ req: { id: 'abc-123' }, res: { statusCode: 200 } });
  });

  it('replaces a malformed request ID with a UUID', async () => {
    const res = await app.inject({ url: '/api/v1/echo', headers: { 'x-request-id': 'bad id\n' } });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps tokens, emails, cookies and auth headers out of the logs', async () => {
    await app.inject({
      url: '/api/v1/echo?token=magic-secret&email=ann%40example.com',
      headers: { authorization: 'Bearer bearer-secret', cookie: 'session=cookie-secret' },
    });
    const output = JSON.stringify(lines);
    expect(lines.length).toBeGreaterThan(0);
    for (const secret of ['magic-secret', 'ann@example.com', 'ann%40example.com', 'tok_123']) {
      expect(output).not.toContain(secret);
    }
    expect(output).not.toContain('bearer-secret');
    expect(output).not.toContain('cookie-secret');
  });
});
