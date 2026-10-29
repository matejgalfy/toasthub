import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import type { Options } from 'pino-http';

import type { Env } from '../config/env';

export const REQUEST_ID_HEADER = 'x-request-id';

const SAFE_REQUEST_ID = /^[\w.:-]{1,128}$/;

// Query parameters whose values never reach the logs (magic-link tokens, emails in auth flows).
const SECRET_QUERY_PARAMS = new Set(['token', 'email', 'code', 'callbackurl']);

const SECRET_KEYS = ['email', 'token', 'accessToken', 'refreshToken', 'password', 'secret'];

// A safety net for objects logged by hand; the request serializer below already drops headers.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...SECRET_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
];

export function redactUrl(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const params = new URLSearchParams(url.slice(queryStart + 1));
  for (const key of [...params.keys()]) {
    if (SECRET_QUERY_PARAMS.has(key.toLowerCase())) params.set(key, '[redacted]');
  }
  return `${url.slice(0, queryStart)}?${params.toString()}`;
}

/**
 * Fastify's `genReqId`: reuses a well-formed incoming request ID (from the ingress), otherwise makes one.
 * pino-http then logs Fastify's ID, which middie copies onto the raw request.
 */
export function requestId(req: IncomingMessage): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

interface SerializedRequest {
  id: string;
  method: string;
  url: string;
}

export function pinoHttpOptions(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): Options {
  return {
    level: env.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    serializers: {
      req: (req: SerializedRequest) => ({
        id: req.id,
        method: req.method,
        url: redactUrl(req.url),
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    ...(env.NODE_ENV === 'development' && {
      transport: { target: 'pino-pretty', options: { singleLine: true } },
    }),
  };
}
