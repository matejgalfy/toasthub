import { Pool } from 'pg';
import { afterAll, beforeEach, inject } from 'vitest';

// Runs before every integration test file: point the app at the test container and start each test
// from empty tables.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = inject('databaseUrl');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

// Truncates every table in `public`. Drizzle's migration journal lives in the `drizzle` schema and stays.
const TRUNCATE_ALL = `
  DO $$
  DECLARE tables text;
  BEGIN
    SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO tables
    FROM pg_tables WHERE schemaname = 'public';
    IF tables IS NOT NULL THEN
      EXECUTE 'TRUNCATE ' || tables || ' RESTART IDENTITY CASCADE';
    END IF;
  END $$;
`;

beforeEach(async () => {
  await pool.query(TRUNCATE_ALL);
});

afterAll(async () => {
  await pool.end();
});
