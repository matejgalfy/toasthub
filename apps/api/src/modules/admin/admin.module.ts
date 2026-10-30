import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClansModule } from '../clans/clans.module';
import { SettingsModule } from '../settings/settings.module';
import { StorageModule } from '../storage/storage.module';
import { TotwModule } from '../totw/totw.module';
import { AdminFlagsService } from './admin-flags.service';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [AuthModule, ClansModule, SettingsModule, StorageModule, TotwModule],
  controllers: [AdminController],
  providers: [AdminFlagsService, AdminMetricsService, AdminUsersService],
})
export class AdminModule {}
