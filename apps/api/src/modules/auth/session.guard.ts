import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '@toasthub/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '../../common/errors/app-error';
import { IS_PUBLIC } from './auth.decorators';
import { AuthService } from './auth.service';

/**
 * Global guard (SPEC §8 "Session"): a valid session cookie or bearer token of an active user. Routes opt
 * out with `@Public()`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const resolved = await this.authService.getSession(request.headers);
    // Bans revoke sessions, but checking here also covers a session created in a race with the ban.
    if (resolved?.user.status !== UserStatus.active) {
      throw new AppError('UNAUTHENTICATED', 'Authentication required');
    }

    if (resolved.setCookie.length > 0) {
      void http.getResponse<FastifyReply>().header('set-cookie', resolved.setCookie);
    }
    request.auth = { session: resolved.session, user: resolved.user };
    return true;
  }
}
