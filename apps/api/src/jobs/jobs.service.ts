import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { TIME_ZONE } from '@toasthub/shared';
import { PgBoss } from 'pg-boss';

import { CleanupService } from '../modules/cleanup/cleanup.service';
import { TotwService } from '../modules/totw/totw.service';
import { JOB_SCHEDULES, JobName } from './job-names';

/**
 * Starts pg-boss in the worker, registers a handler per queue and the cron schedules. Every handler is
 * safe to run twice: a retried draw keeps the week's winner, and cleanups only delete what is left.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly boss: PgBoss,
    private readonly totw: TotwService,
    private readonly cleanup: CleanupService,
  ) {}

  private readonly handlers: Record<JobName, () => Promise<unknown>> = {
    [JobName.totwDraw]: () => this.totw.drawPreviousWeek(),
    [JobName.cleanupVerifications]: async () => ({
      deleted: await this.cleanup.deleteExpiredVerifications(),
    }),
    [JobName.cleanupPhotos]: async () => ({ deleted: await this.cleanup.deleteOldPhotos() }),
  };

  async onApplicationBootstrap(): Promise<void> {
    this.boss.on('error', (error) => {
      this.logger.error({ err: error }, 'pg-boss error');
    });
    this.boss.on('warning', (warning) => {
      this.logger.warn(warning, 'pg-boss warning');
    });
    // Installs or migrates pg-boss's own `pgboss` schema on the first start.
    await this.boss.start();

    for (const name of Object.values(JobName)) {
      // Retried with backoff (1, 2, 4, 8, 16 minutes), e.g. while the database or storage is down.
      await this.boss.createQueue(name, { retryLimit: 5, retryDelay: 60, retryBackoff: true });
      await this.boss.work(name, async (jobs) => {
        for (const job of jobs) {
          const result = await this.handlers[name]();
          this.logger.log({ job: name, jobId: job.id, result }, 'Job done');
        }
      });
      // `once`: a Monday missed while the worker was down is still drawn when it is back.
      await this.boss.schedule(name, JOB_SCHEDULES[name], null, { tz: TIME_ZONE, missed: 'once' });
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    // Before the database pool closes: running jobs finish first.
    await this.boss.stop({ graceful: true, timeout: 30_000 });
  }
}
