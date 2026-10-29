import { existsSync } from 'node:fs';

import pg from 'pg';

const API_ENV_FILE = new URL('../apps/api/.env', import.meta.url);

/**
 * Every test signs up with a fresh email, so the database is not reset. Only the auth rate limits are:
 * the per-IP magic-link limit (20/h) would otherwise stop the suite after a few local runs.
 */
export default async function globalSetup() {
  if (existsSync(API_ENV_FILE)) process.loadEnvFile(API_ENV_FILE);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set (see apps/api/.env.example)');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run E2E tests against production');
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('DELETE FROM rate_limit');
  } finally {
    await client.end();
  }
}
