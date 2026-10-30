import { RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { ConfigService } from '../config/config.service';
import { pinoHttpOptions } from './logging';

/** pino for the api and the worker, configured from the env. */
export const AppLoggerModule = LoggerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    pinoHttp: pinoHttpOptions({
      LOG_LEVEL: config.get('LOG_LEVEL'),
      NODE_ENV: config.get('NODE_ENV'),
    }),
    // Kubernetes polls these every few seconds; logging each probe is noise.
    exclude: [
      { path: 'healthz', method: RequestMethod.GET },
      { path: 'readyz', method: RequestMethod.GET },
    ],
  }),
});
