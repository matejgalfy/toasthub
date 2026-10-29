import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { AppError } from '../../common/errors/app-error';
import type { AuthSession, AuthUser } from './auth.config';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `SessionGuard` on every route that isn't `@Public()`. */
    auth?: Pick<AuthSession, 'session' | 'user'>;
  }
}

export const IS_PUBLIC = 'toasthub:isPublic';

/** Opts a route or controller out of the global `SessionGuard`. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The signed-in, active user. Only valid behind `SessionGuard`. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const user = context.switchToHttp().getRequest<FastifyRequest>().auth?.user;
  if (!user) throw new AppError('UNAUTHENTICATED', 'Authentication required');
  return user satisfies AuthUser;
});
