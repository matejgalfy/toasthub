import { Module } from '@nestjs/common';

import { SettingsModule } from '../settings/settings.module';
import { StorageModule } from '../storage/storage.module';
import { ToastsController } from './toasts.controller';
import { ToastsService } from './toasts.service';

@Module({
  imports: [SettingsModule, StorageModule],
  controllers: [ToastsController],
  providers: [ToastsService],
})
export class ToastsModule {}
