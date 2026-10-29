import { Module } from '@nestjs/common';

import { StreaksModule } from '../streaks/streaks.module';
import { FactsService } from './facts.service';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [StreaksModule],
  controllers: [HomeController],
  providers: [FactsService, HomeService],
})
export class HomeModule {}
