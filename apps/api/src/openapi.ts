import 'reflect-metadata';

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { buildOpenApiDocument, configureApp, createFastifyAdapter } from './app.setup';

// Writes apps/api/openapi.json (`bun run openapi`), which the web client generator reads.
async function main(): Promise<void> {
  // Building the document never queries the database (the pool connects lazily), so any URL will do.
  process.env.DATABASE_URL ??= 'postgres://openapi@localhost:5432/openapi';
  process.env.BETTER_AUTH_SECRET ??= 'openapi-only-secret-never-used-for-signing';
  process.env.S3_ACCESS_KEY_ID ??= 'openapi';
  process.env.S3_SECRET_ACCESS_KEY ??= 'openapi';
  process.env.LOG_LEVEL = 'silent';

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(), {
    logger: false,
  });
  await configureApp(app);
  const document = buildOpenApiDocument(app);
  await app.close();

  const target = path.resolve(__dirname, '..', 'openapi.json');
  await writeFile(target, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`Wrote ${target}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
