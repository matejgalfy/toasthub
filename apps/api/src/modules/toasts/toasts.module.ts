import { Module } from '@nestjs/common';

import { ToastsController } from './toasts.controller';
import { ToastsService } from './toasts.service';

@Module({
  controllers: [ToastsController],
  providers: [ToastsService],
})
export class ToastsModule {}
