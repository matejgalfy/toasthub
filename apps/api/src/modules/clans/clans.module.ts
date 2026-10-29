import { Module } from '@nestjs/common';

import { AchievementsModule } from '../achievements/achievements.module';
import { SettingsModule } from '../settings/settings.module';
import { StorageModule } from '../storage/storage.module';
import { StreaksModule } from '../streaks/streaks.module';
import { ClanFeedService } from './clan-feed.service';
import { ClansController } from './clans.controller';
import { ClansService } from './clans.service';

@Module({
  imports: [AchievementsModule, SettingsModule, StorageModule, StreaksModule],
  controllers: [ClansController],
  providers: [ClansService, ClanFeedService],
})
export class ClansModule {}
