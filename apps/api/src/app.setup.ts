import { Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { errorResponseSchema } from '@toasthub/shared';
import {
  cleanupOpenApiDoc,
  createZodDto,
  createZodValidationPipe,
  ZodSerializerInterceptor,
} from 'nestjs-zod';
import { z } from 'zod';

import { AppError } from './common/errors/app-error';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { REQUEST_ID_HEADER, requestId } from './common/logging';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = `${API_PREFIX}/docs`;

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

/** Everything that shapes request handling. Shared by `main.ts`, `bun run openapi` and tests. */
export function configureApp(app: NestFastifyApplication): void {
  app.setGlobalPrefix(API_PREFIX, { exclude: ['healthz', 'readyz'] });
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalInterceptors(new ZodSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      void reply.header(REQUEST_ID_HEADER, request.id);
      done();
    });
}

export function buildOpenApiDocument(app: NestFastifyApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Toasthub API')
    .setVersion('1')
    .setDescription('Errors use the `ErrorResponse` shape. See docs/SPEC.md §8.')
    .build();
  return cleanupOpenApiDoc(
    SwaggerModule.createDocument(app, config, { extraModels: [ErrorResponse] }),
  );
}
