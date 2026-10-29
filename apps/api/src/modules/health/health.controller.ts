import { Controller, Get } from '@nestjs/common';
import { type Health, healthSchema } from '@toasthub/shared';

@Controller()
export class HealthController {
  @Get('healthz')
  healthz(): Health {
    return healthSchema.parse({ status: 'ok' });
  }
}
