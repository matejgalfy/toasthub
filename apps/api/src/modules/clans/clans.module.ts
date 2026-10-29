import { Module } from '@nestjs/common';

import { AchievementsModule } from '../achievements/achievements.module';
import { SettingsModule } from '../settings/settings.module';
import { StreaksModule } from '../streaks/streaks.module';
import { ClansController } from './clans.controller';
import { ClansService } from './clans.service';

@Module({
  imports: [AchievementsModule, SettingsModule, StreaksModule],
  controllers: [ClansController],
  providers: [ClansService],
})
export class ClansModule {}
