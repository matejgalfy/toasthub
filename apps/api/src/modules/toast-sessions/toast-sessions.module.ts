import { Module } from '@nestjs/common';

import { AchievementsModule } from '../achievements/achievements.module';
import { SettingsModule } from '../settings/settings.module';
import { StorageModule } from '../storage/storage.module';
import { ToastSessionsController } from './toast-sessions.controller';
import { ToastSessionsService } from './toast-sessions.service';

@Module({
  imports: [AchievementsModule, SettingsModule, StorageModule],
  controllers: [ToastSessionsController],
  providers: [ToastSessionsService],
})
export class ToastSessionsModule {}
