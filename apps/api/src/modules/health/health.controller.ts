import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { type Health, healthSchema } from '@toasthub/shared';
import { sql } from 'drizzle-orm';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { type Database, DB } from '../../db/db.module';
import { Public } from '../auth/auth.decorators';

class HealthDto extends createZodDto(healthSchema) {}

// Kubernetes probes, outside the /api/v1 prefix.
@Public()
@Controller()
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Liveness: the process is up. */
  @Get('healthz')
  @ZodResponse({ status: 200, type: HealthDto })
  healthz(): Health {
    return { status: 'ok' };
  }

  /** Readiness: the database answers. */
  @Get('readyz')
  @ZodResponse({ status: 200, type: HealthDto })
  async readyz(): Promise<Health> {
    try {
      await this.db.execute(sql`select 1`);
    } catch (cause) {
      throw new ServiceUnavailableException('Database unreachable', { cause });
    }
    return { status: 'ok' };
  }
}
