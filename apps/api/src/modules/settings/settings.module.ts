import { Module } from '@nestjs/common';

import { SettingsService } from './settings.service';

// No routes yet: the admin endpoints come in M16. Feature modules import this for the service.
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
