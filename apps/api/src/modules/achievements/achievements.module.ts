import { Module } from '@nestjs/common';

import { StreaksModule } from '../streaks/streaks.module';
import { AchievementsService } from './achievements.service';

// No routes yet: the profile lists achievements from M9 on. Toasts (and later clans, TOTW) call the service.
@Module({
  imports: [StreaksModule],
  providers: [AchievementsService],
  exports: [AchievementsService],
})
export class AchievementsModule {}
