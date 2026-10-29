import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

import { runMigrations } from '../src/db/migrate';

// Keep both in step with infra/docker/docker-compose.yml.
const POSTGRES_IMAGE = 'postgres:18.6-alpine';
const MAILPIT_IMAGE = 'axllent/mailpit:v1.32.0';

const SMTP_PORT = 1025;
const MAILPIT_API_PORT = 8025;

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    smtpUrl: string;
    mailpitUrl: string;
  }
}

let postgres: StartedPostgreSqlContainer | undefined;
let mailpit: StartedTestContainer | undefined;

/** One Postgres container (migrated once) and one Mailpit per test run. */
export async function setup(project: TestProject): Promise<void> {
  [postgres, mailpit] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new GenericContainer(MAILPIT_IMAGE)
      .withExposedPorts(SMTP_PORT, MAILPIT_API_PORT)
      .withWaitStrategy(Wait.forHttp('/livez', MAILPIT_API_PORT))
      .start(),
  ]);
  const databaseUrl = postgres.getConnectionUri();
  await runMigrations(databaseUrl);

  const host = mailpit.getHost();
  project.provide('databaseUrl', databaseUrl);
  project.provide('smtpUrl', `smtp://${host}:${String(mailpit.getMappedPort(SMTP_PORT))}`);
  project.provide(
    'mailpitUrl',
    `http://${host}:${String(mailpit.getMappedPort(MAILPIT_API_PORT))}`,
  );
}

export async function teardown(): Promise<void> {
  await Promise.all([postgres?.stop(), mailpit?.stop()]);
}
