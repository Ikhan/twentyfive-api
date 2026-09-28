import { ConfigService } from '@nestjs/config';
import { AppConfigService } from './app-config.service.js';
import { validateEnv } from './env.schema.js';

const configFor = (raw: Record<string, string>) =>
  new AppConfigService(
    new ConfigService(validateEnv({ DATABASE_URL: 'postgresql://u:p@localhost/db', ...raw })) as never,
  );

describe('AppConfigService', () => {
  it('returns typed, validated values', () => {
    const config = configFor({ PORT: '4000' });
    expect(config.get('PORT')).toBe(4000);
    expect(config.get('CORS_ORIGINS')).toEqual(['http://localhost:5173']);
  });

  it('knows when it is running in production', () => {
    expect(configFor({ NODE_ENV: 'production' }).isProduction).toBe(true);
    expect(configFor({ NODE_ENV: 'development' }).isProduction).toBe(false);
  });
});
