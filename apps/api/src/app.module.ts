import { Module } from '@nestjs/common';

import { AppLoggerModule } from './common/logger.module';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClansModule } from './modules/clans/clans.module';
import { HealthModule } from './modules/health/health.module';
import { HomeModule } from './modules/home/home.module';
import { LeaderboardsModule } from './modules/leaderboards/leaderboards.module';
import { MeModule } from './modules/me/me.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ToastSessionsModule } from './modules/toast-sessions/toast-sessions.module';
import { ToastsModule } from './modules/toasts/toasts.module';
import { TotwModule } from './modules/totw/totw.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule,
    AppLoggerModule,
    DbModule,
    AuthModule,
    ClansModule,
    HealthModule,
    HomeModule,
    LeaderboardsModule,
    MeModule,
    SettingsModule,
    ToastSessionsModule,
    ToastsModule,
    TotwModule,
    UsersModule,
  ],
})
export class AppModule {}
