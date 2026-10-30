import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { buildOpenApiDocument, configureApp, createFastifyAdapter, DOCS_PATH } from './app.setup';
import { ConfigService } from './config/config.service';
import { envSchema } from './config/env';
import { WorkerModule } from './jobs/worker.module';

async function bootstrapApi(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await configureApp(app);

  const config = app.get(ConfigService);
  if (!config.isProduction) {
    SwaggerModule.setup(DOCS_PATH, app, () => buildOpenApiDocument(app));
  }

  await app.listen(config.get('PORT'), config.get('HOST'));
}

// Same image, other role (SPEC §12 D10): runs the jobs until it gets SIGTERM.
async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.init();
}

void (envSchema.shape.APP_ROLE.parse(process.env.APP_ROLE) === 'worker'
  ? bootstrapWorker()
  : bootstrapApi());
