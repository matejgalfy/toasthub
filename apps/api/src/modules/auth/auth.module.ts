import { Inject, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD, HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance } from 'fastify';

import { ConfigService } from '../../config/config.service';
import { type Database, DB } from '../../db/db.module';
import { MailModule } from '../mail/mail.module';
import { MailService } from '../mail/mail.service';
import { type Auth, createAuth } from './auth.config';
import { registerAuthRoutes } from './auth.handler';
import { AUTH, AuthService } from './auth.service';
import { SessionGuard } from './session.guard';

@Module({
  imports: [MailModule],
  providers: [
    {
      provide: AUTH,
      inject: [DB, ConfigService, MailService],
      useFactory: (db: Database, config: ConfigService, mail: MailService): Auth =>
        createAuth({
          db,
          env: {
            NODE_ENV: config.get('NODE_ENV'),
            BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET'),
            BETTER_AUTH_URL: config.get('BETTER_AUTH_URL'),
            WEB_ORIGIN: config.get('WEB_ORIGIN'),
          },
          sendMagicLink: (message) => mail.sendMagicLink(message),
          logger: new Logger('BetterAuth'),
        }),
    },
    AuthService,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [AuthService],
})
export class AuthModule implements OnModuleInit {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly config: ConfigService,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  onModuleInit(): void {
    const fastify = this.adapterHost.httpAdapter.getInstance<FastifyInstance>();
    registerAuthRoutes(fastify, this.auth, this.config.get('BETTER_AUTH_URL'));
  }
}
