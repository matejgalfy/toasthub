import { existsSync } from 'node:fs';

import { defineConfig } from 'drizzle-kit';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  casing: 'snake_case',
  // Only `drizzle-kit studio` and friends connect; `generate` works without a database.
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
