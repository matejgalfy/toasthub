import { Pool } from 'pg';
import { afterAll, beforeEach, inject } from 'vitest';

import { clearMailbox } from './mailpit';
import { TEST_S3 } from './s3';

// Runs before every integration test file: point the app at the test containers and start each test
// from empty tables and an empty mailbox.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = inject('databaseUrl');
process.env.SMTP_URL = inject('smtpUrl');
process.env.BETTER_AUTH_SECRET = 'integration-test-secret-that-is-long-enough';
process.env.BETTER_AUTH_URL = 'http://localhost:3000';
process.env.WEB_ORIGIN = 'http://localhost:5173';
process.env.S3_ENDPOINT = inject('s3Endpoint');
process.env.S3_BUCKET = TEST_S3.bucket;
process.env.S3_ACCESS_KEY_ID = TEST_S3.accessKeyId;
process.env.S3_SECRET_ACCESS_KEY = TEST_S3.secretAccessKey;
process.env.S3_FORCE_PATH_STYLE = 'true';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

// Truncates every table in `public` except the facts seeded by a migration. `app_setting` is emptied too,
// which reads as the defaults. Drizzle's migration journal lives in the `drizzle` schema and stays.
const TRUNCATE_ALL = `
  DO $$
  DECLARE tables text;
  BEGIN
    SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO tables
    FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'toast_fact';
    IF tables IS NOT NULL THEN
      EXECUTE 'TRUNCATE ' || tables || ' RESTART IDENTITY CASCADE';
    END IF;
  END $$;
`;

beforeEach(async () => {
  await Promise.all([pool.query(TRUNCATE_ALL), clearMailbox()]);
});

afterAll(async () => {
  await pool.end();
});
