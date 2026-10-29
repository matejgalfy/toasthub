import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { ConfigService } from '../config/config.service';
import * as schema from './schema';

export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');

export type Database = NodePgDatabase<typeof schema>;

/** The database or an open transaction, so callers can run a service method inside their transaction. */
export type DbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema, casing: 'snake_case' });
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      // The pool connects lazily, so the app (and `bun run openapi`) can start without a database.
      useFactory: (config: ConfigService) =>
        new Pool({
          connectionString: config.get('DATABASE_URL'),
          max: 10,
          connectionTimeoutMillis: 5_000,
          idleTimeoutMillis: 30_000,
        }),
    },
    { provide: DB, inject: [PG_POOL], useFactory: createDatabase },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
