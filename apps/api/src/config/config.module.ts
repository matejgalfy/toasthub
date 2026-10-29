import { Global, Module } from '@nestjs/common';

import { ConfigService } from './config.service';
import { parseEnv } from './env';

// Parsed once at startup, so a bad env fails the boot instead of the first request.
@Global()
@Module({
  providers: [
    { provide: ConfigService, useFactory: () => new ConfigService(parseEnv(process.env)) },
  ],
  exports: [ConfigService],
})
export class ConfigModule {}
