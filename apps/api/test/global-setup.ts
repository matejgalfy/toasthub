import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

import { runMigrations } from '../src/db/migrate';
import { TEST_S3 } from './s3';

// Keep these in step with infra/docker/docker-compose.yml.
const POSTGRES_IMAGE = 'postgres:18.6-alpine';
const MAILPIT_IMAGE = 'axllent/mailpit:v1.32.0';
const MINIO_IMAGE = 'pgsty/minio:RELEASE.2026-08-04T00-00-00Z';

const SMTP_PORT = 1025;
const MAILPIT_API_PORT = 8025;
const MINIO_PORT = 9000;

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    smtpUrl: string;
    mailpitUrl: string;
    s3Endpoint: string;
  }
}

let postgres: StartedPostgreSqlContainer | undefined;
let mailpit: StartedTestContainer | undefined;
let minio: StartedTestContainer | undefined;

/** One Postgres container (migrated once), one Mailpit and one MinIO (with the photo bucket) per test run. */
export async function setup(project: TestProject): Promise<void> {
  [postgres, mailpit, minio] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new GenericContainer(MAILPIT_IMAGE)
      .withExposedPorts(SMTP_PORT, MAILPIT_API_PORT)
      .withWaitStrategy(Wait.forHttp('/livez', MAILPIT_API_PORT))
      .start(),
    new GenericContainer(MINIO_IMAGE)
      .withCommand(['server', '/data'])
      .withEnvironment({
        MINIO_ROOT_USER: TEST_S3.accessKeyId,
        MINIO_ROOT_PASSWORD: TEST_S3.secretAccessKey,
      })
      .withExposedPorts(MINIO_PORT)
      .withWaitStrategy(Wait.forHttp('/minio/health/live', MINIO_PORT))
      .start(),
  ]);
  const databaseUrl = postgres.getConnectionUri();
  const s3Endpoint = `http://${minio.getHost()}:${String(minio.getMappedPort(MINIO_PORT))}`;
  await Promise.all([runMigrations(databaseUrl), createBucket(s3Endpoint)]);

  const host = mailpit.getHost();
  project.provide('databaseUrl', databaseUrl);
  project.provide('s3Endpoint', s3Endpoint);
  project.provide('smtpUrl', `smtp://${host}:${String(mailpit.getMappedPort(SMTP_PORT))}`);
  project.provide(
    'mailpitUrl',
    `http://${host}:${String(mailpit.getMappedPort(MAILPIT_API_PORT))}`,
  );
}

export async function teardown(): Promise<void> {
  await Promise.all([postgres?.stop(), mailpit?.stop(), minio?.stop()]);
}

async function createBucket(endpoint: string): Promise<void> {
  const client = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: TEST_S3.accessKeyId, secretAccessKey: TEST_S3.secretAccessKey },
  });
  try {
    await client.send(new CreateBucketCommand({ Bucket: TEST_S3.bucket }));
  } finally {
    client.destroy();
  }
}
