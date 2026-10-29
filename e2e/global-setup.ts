import { existsSync } from 'node:fs';

import { execute } from './support/db.js';

const API_ENV_FILE = new URL('../apps/api/.env', import.meta.url);

/**
 * Every test signs up with a fresh email, so the database is not reset. Only the auth rate limits are:
 * the per-IP magic-link limit (20/h) would otherwise stop the suite after a few local runs. The env
 * loaded here is inherited by the test workers (`support/db.ts`).
 */
export default async function globalSetup() {
  if (existsSync(API_ENV_FILE)) process.loadEnvFile(API_ENV_FILE);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run E2E tests against production');
  }
  await execute('DELETE FROM rate_limit');
}
