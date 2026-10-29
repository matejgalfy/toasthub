import { Module, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { pinoHttpOptions } from './common/logging';
import { ConfigModule } from './config/config.module';
import { ConfigService } from './config/config.service';
import { DbModule } from './db/db.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { HomeModule } from './modules/home/home.module';
import { MeModule } from './modules/me/me.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ToastSessionsModule } from './modules/toast-sessions/toast-sessions.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: pinoHttpOptions({
          LOG_LEVEL: config.get('LOG_LEVEL'),
          NODE_ENV: config.get('NODE_ENV'),
        }),
        // Kubernetes polls these every few seconds; logging each probe is noise.
        exclude: [
          { path: 'healthz', method: RequestMethod.GET },
          { path: 'readyz', method: RequestMethod.GET },
        ],
      }),
    }),
    DbModule,
    AuthModule,
    HealthModule,
    HomeModule,
    MeModule,
    SettingsModule,
    ToastSessionsModule,
    UsersModule,
  ],
})
export class AppModule {}
