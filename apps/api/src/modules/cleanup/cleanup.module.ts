import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';
import { CleanupService } from './cleanup.service';

// No routes: only the worker's jobs call it.
@Module({
  imports: [StorageModule],
  providers: [CleanupService],
  exports: [CleanupService],
})
export class CleanupModule {}
