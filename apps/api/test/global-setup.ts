import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

import { runMigrations } from '../src/db/migrate';

// Keep in step with infra/docker/docker-compose.yml.
const POSTGRES_IMAGE = 'postgres:18.6-alpine';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/** One Postgres container per test run, migrated once. */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const databaseUrl = container.getConnectionUri();
  await runMigrations(databaseUrl);
  project.provide('databaseUrl', databaseUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
