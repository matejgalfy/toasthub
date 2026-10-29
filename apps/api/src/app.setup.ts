import multipart from '@fastify/multipart';
import { Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { errorResponseSchema, PHOTO_MAX_BYTES } from '@toasthub/shared';
import {
  cleanupOpenApiDoc,
  createZodDto,
  createZodValidationPipe,
  ZodSerializerInterceptor,
} from 'nestjs-zod';
import { z } from 'zod';

import { AppError } from './common/errors/app-error';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { toErrorResponse } from './common/errors/error-response';
import { REQUEST_ID_HEADER, requestId } from './common/logging';
import { isOriginAllowed } from './common/origin-check';
import { ConfigService } from './config/config.service';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = `${API_PREFIX}/docs`;
// Better Auth's `<cookiePrefix>.session_token`; `__Secure-` is prepended over HTTPS.
const SESSION_COOKIE = 'toasthub.session_token';

const ValidationPipe = createZodValidationPipe({
  createValidationException: (error) =>
    error instanceof z.core.$ZodError
      ? AppError.validation(error)
      : new AppError('VALIDATION_ERROR', 'Request validation failed'),
});

// The class name becomes the OpenAPI schema name, which the generated web client exposes as a type.
class ErrorResponse extends createZodDto(errorResponseSchema) {}

export function createFastifyAdapter(): FastifyAdapter {
  // `requestIdHeader: false` so an incoming ID is only reused after `requestId` has checked it.
  return new FastifyAdapter({ requestIdHeader: false, genReqId: requestId });
}

/**
 * Everything that shapes request handling. Shared by `main.ts`, `bun run openapi` and tests. Needs
 * `ConfigService` in the app.
 */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  // Only toast photos are uploaded: one file per request. A route reads the file itself (`request.file()`);
  // a bigger file fails there with a 413.
  await app.register(multipart, { limits: { files: 1, fileSize: PHOTO_MAX_BYTES } });

  const config = app.get(ConfigService);
  const webOrigin = config.get('WEB_ORIGIN');
  // The API's own origin too, for the Swagger UI it serves in dev.
  const trustedOrigins = [webOrigin, new URL(config.get('BETTER_AUTH_URL')).origin];

  app.enableCors({ origin: webOrigin, credentials: true });
  app.setGlobalPrefix(API_PREFIX, { exclude: ['healthz', 'readyz'] });
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalInterceptors(new ZodSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      void reply.header(REQUEST_ID_HEADER, request.id);
      if (isOriginAllowed(request.method, request.headers, trustedOrigins)) {
        done();
        return;
      }
      const { status, body } = toErrorResponse(new AppError('FORBIDDEN', 'Origin not allowed'));
      void reply.status(status).send(body);
    });
}

export function buildOpenApiDocument(app: NestFastifyApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Toasthub API')
    .setVersion('1')
    .setDescription(
      'Errors use the `ErrorResponse` shape. See docs/SPEC.md §8. Sign-in endpoints under ' +
        '`/api/v1/auth/*` are served by Better Auth and not listed here.',
    )
    .addCookieAuth(SESSION_COOKIE)
    // Opaque session tokens (from the `set-auth-token` header), not JWTs.
    .addBearerAuth({ type: 'http', bearerFormat: 'opaque' })
    .build();
  return cleanupOpenApiDoc(
    SwaggerModule.createDocument(app, config, { extraModels: [ErrorResponse] }),
  );
}
