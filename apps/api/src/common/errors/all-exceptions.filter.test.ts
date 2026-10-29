import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { errorCodeSchema, type ErrorCode, errorResponseSchema } from '@toasthub/shared';
import { createZodDto } from 'nestjs-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { configureApp, createFastifyAdapter } from '../../app.setup';
import { AppError } from './app-error';

class CreateThingDto extends createZodDto(
  z.object({ name: z.string().min(2), tags: z.array(z.string()).max(1) }),
) {}

@Controller('test')
class ThrowingController {
  @Get('app-error/:code')
  appError(@Param('code') code: string): never {
    throw new AppError(errorCodeSchema.parse(code), `custom ${code} message`);
  }

  @Get('unauthorized')
  unauthorized(): never {
    throw new UnauthorizedException();
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException();
  }

  @Get('bad-request')
  badRequest(): never {
    throw new BadRequestException('Bad thing');
  }

  @Get('missing')
  missing(): never {
    throw new NotFoundException('Thing not found');
  }

  @Get('unavailable')
  unavailable(): never {
    throw new ServiceUnavailableException('db at 10.0.0.5 is down');
  }

  @Get('crash')
  crash(): never {
    throw new Error('secret internal detail');
  }

  @Get('internal')
  internal(): never {
    throw new AppError('INTERNAL', 'secret internal detail');
  }

  @Post('things')
  create(@Body() body: CreateThingDto): CreateThingDto {
    return body;
  }
}

let app: NestFastifyApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ controllers: [ThrowingController] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), {
    logger: false,
  });
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
});

async function request(
  method: 'GET' | 'POST',
  url: string,
  payload?: string | Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const res = await app.inject({
    method,
    url: `/api/v1/test${url}`,
    headers,
    ...(payload && { payload }),
  });
  return { status: res.statusCode, body: errorResponseSchema.parse(res.json()).error };
}

describe('error format', () => {
  it.each([
    ['VALIDATION_ERROR', 400],
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['PAYLOAD_TOO_LARGE', 413],
    ['RATE_LIMITED', 429],
  ] as const)('maps AppError %s to %i with its message', async (code: ErrorCode, status) => {
    const res = await request('GET', `/app-error/${code}`);
    expect(res).toEqual({ status, body: { code, message: `custom ${code} message` } });
  });

  it.each([
    ['/unauthorized', 401, 'UNAUTHENTICATED'],
    ['/forbidden', 403, 'FORBIDDEN'],
    ['/bad-request', 400, 'VALIDATION_ERROR'],
    ['/missing', 404, 'NOT_FOUND'],
  ])('maps Nest exception %s to %i %s', async (url, status, code) => {
    const res = await request('GET', url);
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
  });

  it('maps an unknown route to NOT_FOUND', async () => {
    const res = await request('GET', '/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('reports Zod validation failures per field', async () => {
    const res = await request('POST', '/things', { name: 'x', tags: ['a', 'b'] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.fields ?? {}).sort()).toEqual(['name', 'tags']);
  });

  it('passes a valid body through', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/test/things',
      payload: { name: 'ok', tags: [] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ name: 'ok', tags: [] });
  });

  it('maps malformed JSON from Fastify to VALIDATION_ERROR', async () => {
    const res = await request('POST', '/things', '{"name":', {
      'content-type': 'application/json',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('maps a body over the Fastify limit to PAYLOAD_TOO_LARGE', async () => {
    const res = await request('POST', '/things', { name: 'x'.repeat(2 * 1024 * 1024), tags: [] });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it.each(['/crash', '/internal'])('hides internal details for %s', async (url) => {
    const res = await request('GET', url);
    expect(res).toEqual({
      status: 500,
      body: { code: 'INTERNAL', message: 'Internal server error' },
    });
  });

  it('keeps a 503 status but reports INTERNAL without the message', async () => {
    const res = await request('GET', '/unavailable');
    expect(res).toEqual({
      status: 503,
      body: { code: 'INTERNAL', message: 'Internal server error' },
    });
  });
});
