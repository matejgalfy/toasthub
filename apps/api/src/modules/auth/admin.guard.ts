import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { UserRole } from '@toasthub/shared';
import type { FastifyRequest } from 'fastify';

import { AppError } from '../../common/errors/app-error';

/** SPEC §8 "Admin": use with `@UseGuards(AdminGuard)`. Runs after the global `SessionGuard`. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<FastifyRequest>().auth?.user;
    if (!user) throw new AppError('UNAUTHENTICATED', 'Authentication required');
    if (user.role !== UserRole.admin) throw new AppError('FORBIDDEN', 'Admins only');
    return true;
  }
}
