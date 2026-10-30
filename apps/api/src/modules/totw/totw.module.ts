import { randomInt } from 'node:crypto';

import { Module } from '@nestjs/common';

import { AchievementsModule } from '../achievements/achievements.module';
import { StorageModule } from '../storage/storage.module';
import type { RandomIndex } from './totw-draw';
import { TotwController } from './totw.controller';
import { TOTW_RANDOM, TotwService } from './totw.service';

@Module({
  imports: [AchievementsModule, StorageModule],
  controllers: [TotwController],
  providers: [
    TotwService,
    { provide: TOTW_RANDOM, useValue: ((n) => randomInt(n)) satisfies RandomIndex },
  ],
  // Home shows last week's draw; the worker runs the draw (and M16's redraw reuses it).
  exports: [TotwService],
})
export class TotwModule {}
