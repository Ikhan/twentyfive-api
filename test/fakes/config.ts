import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { validateEnv } from '../../src/config/env.schema.js';

/** A real AppConfigService over validated test values, for unit tests. */
export function testConfig(overrides: Record<string, string> = {}): AppConfigService {
  const env = validateEnv({
    DATABASE_URL: 'postgresql://u:p@localhost:5433/test',
    JWT_ACCESS_SECRET: 'unit-test-secret-at-least-32-characters!!',
    API_PUBLIC_URL: 'https://api.twentyfive.test',
    WEB_APP_URL: 'https://twentyfive.test',
    ...overrides,
  });
  return new AppConfigService(new ConfigService(env) as never);
}
