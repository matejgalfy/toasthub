import { Module } from '@nestjs/common';

import { SettingsService } from './settings.service';

// No routes: the admin module serves `/admin/settings`. Feature modules import this for the service.
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
