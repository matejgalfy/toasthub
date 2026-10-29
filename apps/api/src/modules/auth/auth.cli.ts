import { drizzle } from 'drizzle-orm/node-postgres';

import * as schema from '../../db/schema';
import { createAuth } from './auth.config';

/**
 * Entry point for the Better Auth CLI only (`bun run --filter @toasthub/api auth:schema`), which reads the
 * plugins and `additionalFields` to print the auth tables. The app never imports this file.
 */
export const auth = createAuth({
  db: drizzle.mock({ schema, casing: 'snake_case' }),
  env: {
    NODE_ENV: 'development',
    BETTER_AUTH_SECRET: 'cli-only-secret-never-used-for-signing',
    BETTER_AUTH_URL: 'http://localhost:3000',
    WEB_ORIGIN: 'http://localhost:5173',
  },
  sendMagicLink: () => Promise.resolve(),
  logger: console,
});
