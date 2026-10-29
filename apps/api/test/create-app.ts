import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';

import { AppModule } from '../src/app.module';
import { configureApp, createFastifyAdapter } from '../src/app.setup';
import { ConfigService } from '../src/config/config.service';
import { type Env, parseEnv } from '../src/config/env';

/**
 * The full app, configured like `main.ts`, ready for `app.inject()`. `env` overrides single variables on
 * top of the test environment from `setup-int.ts`.
 */
export async function createTestApp(env: Partial<Record<keyof Env, string>> = {}) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue(new ConfigService(parseEnv({ ...process.env, ...env })))
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
