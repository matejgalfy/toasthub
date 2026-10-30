import { Module } from '@nestjs/common';
import { PgBoss } from 'pg-boss';

import { ConfigService } from '../config/config.service';
import { CleanupModule } from '../modules/cleanup/cleanup.module';
import { TotwModule } from '../modules/totw/totw.module';
import { JobsService } from './jobs.service';

// Only the worker imports this module: the api never starts pg-boss (SPEC §12 D10).
@Module({
  imports: [CleanupModule, TotwModule],
  providers: [
    {
      provide: PgBoss,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new PgBoss({
          connectionString: config.get('DATABASE_URL'),
          application_name: 'toasthub-worker',
          max: 4,
        }),
    },
    JobsService,
  ],
  exports: [PgBoss],
})
export class JobsModule {}
