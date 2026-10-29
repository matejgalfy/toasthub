import { Module } from '@nestjs/common';

import { ClansModule } from '../clans/clans.module';
import { StreaksModule } from '../streaks/streaks.module';
import { LeaderboardsController } from './leaderboards.controller';
import { LeaderboardsService } from './leaderboards.service';

@Module({
  imports: [ClansModule, StreaksModule],
  controllers: [LeaderboardsController],
  providers: [LeaderboardsService],
})
export class LeaderboardsModule {}
