import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { toErrorResponse } from './error-response';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = toErrorResponse(exception);
    if (status >= 500) {
      this.logger.error(exception);
    }
    void host.switchToHttp().getResponse<FastifyReply>().status(status).send(body);
  }
}
