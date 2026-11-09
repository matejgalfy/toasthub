import { Module } from '@nestjs/common';

import { AchievementsModule } from '../achievements/achievements.module';
import { FeedModule } from '../feed/feed.module';
import { SettingsModule } from '../settings/settings.module';
import { StorageModule } from '../storage/storage.module';
import { StreaksModule } from '../streaks/streaks.module';
import { ClansController } from './clans.controller';
import { ClansService } from './clans.service';

@Module({
  imports: [AchievementsModule, FeedModule, SettingsModule, StorageModule, StreaksModule],
  controllers: [ClansController],
  providers: [ClansService],
  exports: [ClansService],
})
export class ClansModule {}
