import path from 'node:path';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { parseEnv } from '../config/env';
import { createDatabase } from './db.module';

// Two levels up is the api package root from both `src/db` (tests) and `dist/db` (built CLI).
export const MIGRATIONS_FOLDER = path.resolve(__dirname, '..', '..', 'src', 'db', 'migrations');

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(createDatabase(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations(parseEnv(process.env).DATABASE_URL).then(
    () => {
      console.log('Migrations applied');
    },
    (error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
