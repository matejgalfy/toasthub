import type { IncomingHttpHeaders } from 'node:http';

import { HttpException, Logger, NotFoundException } from '@nestjs/common';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { toErrorResponse } from '../../common/errors/error-response';
import { type Auth, AUTH_BASE_PATH, CLIENT_IP_HEADER } from './auth.config';

/**
 * The Better Auth endpoints we use (SPEC §8). Everything else Better Auth ships (update-user, change-email,
 * list-sessions, …) would bypass our own validation, so it is a 404.
 */
const ALLOWED_ENDPOINTS = new Set([
  'POST /sign-in/magic-link',
  'GET /magic-link/verify',
  'POST /sign-out',
  'GET /get-session',
]);

// Recomputed for the re-serialized body, or hop-by-hop.
const DROPPED_HEADERS = new Set(['content-length', 'transfer-encoding', 'connection']);

export function toWebHeaders(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || DROPPED_HEADERS.has(key) || key === CLIENT_IP_HEADER) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item);
  }
  return headers;
}

function toWebRequest(request: FastifyRequest, url: URL): Request {
  const headers = toWebHeaders(request.headers);
  headers.set(CLIENT_IP_HEADER, request.ip);
  const hasBody = request.method !== 'GET' && request.body !== undefined;
  return new Request(url, {
    method: request.method,
    headers,
    ...(hasBody && { body: JSON.stringify(request.body) }),
  });
}

function errorMessage(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
      const { message } = parsed;
      if (typeof message === 'string' && message) return message;
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return 'Request failed';
}

async function sendWebResponse(reply: FastifyReply, response: Response): Promise<void> {
  void reply.status(response.status);
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie' && !DROPPED_HEADERS.has(key)) void reply.header(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) void reply.header('set-cookie', cookies);

  const text = await response.text();
  if (response.status >= 400) {
    // Same error shape as the rest of the API (SPEC §8), so the web client maps `code` the same way.
    const { body } = toErrorResponse(new HttpException(errorMessage(text), response.status));
    await reply.type('application/json').send(body);
    return;
  }
  await reply.send(text || null);
}

/** Mounts Better Auth on the Fastify instance at `/api/v1/auth/*`. */
export function registerAuthRoutes(fastify: FastifyInstance, auth: Auth, baseUrl: string): void {
  const logger = new Logger('AuthHandler');

  fastify.route({
    method: ['GET', 'POST'],
    url: `${AUTH_BASE_PATH}/*`,
    handler: async (request, reply) => {
      // The configured public URL, never the Host header, decides the origin Better Auth sees.
      const url = new URL(request.url, baseUrl);
      const endpoint = `${request.method} ${url.pathname.slice(AUTH_BASE_PATH.length)}`;
      if (!ALLOWED_ENDPOINTS.has(endpoint)) {
        const { status, body } = toErrorResponse(new NotFoundException());
        await reply.status(status).send(body);
        return;
      }
      try {
        await sendWebResponse(reply, await auth.handler(toWebRequest(request, url)));
      } catch (error) {
        logger.error(error);
        const { status, body } = toErrorResponse(error);
        await reply.status(status).send(body);
      }
    },
  });
}
