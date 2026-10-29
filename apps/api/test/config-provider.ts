import { ConfigService } from '../src/config/config.service';
import { type Env, parseEnv } from '../src/config/env';

/**
 * A `ConfigService` provider for unit tests that build a small app without `AppModule` (`configureApp`
 * needs one). Nothing connects to the URLs.
 */
export function testConfigProvider(env: Partial<Record<keyof Env, string>> = {}) {
  const config = parseEnv({
    DATABASE_URL: 'postgres://unused@localhost:5432/unused',
    BETTER_AUTH_SECRET: 'unit-test-secret-that-is-long-enough',
    S3_ACCESS_KEY_ID: 'unused',
    S3_SECRET_ACCESS_KEY: 'unused',
    ...env,
  });
  return { provide: ConfigService, useValue: new ConfigService(config) };
}
