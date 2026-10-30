import { Module } from '@nestjs/common';

import { AppLoggerModule } from '../common/logger.module';
import { ConfigModule } from '../config/config.module';
import { DbModule } from '../db/db.module';
import { JobsModule } from './jobs.module';

/** The worker process (`APP_ROLE=worker`): scheduled jobs only, no HTTP server. */
@Module({
  imports: [ConfigModule, AppLoggerModule, DbModule, JobsModule],
})
export class WorkerModule {}
