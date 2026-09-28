import { validateEnv } from './env.schema.js';

const DATABASE_URL = 'postgresql://u:p@localhost:5433/db';
const REQUIRED = { DATABASE_URL, JWT_ACCESS_SECRET: 'x'.repeat(32) };

describe('validateEnv', () => {
  it('applies defaults for an empty environment', () => {
    const env = validateEnv(REQUIRED);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      CORS_ORIGINS: ['http://localhost:5173'],
      RATE_LIMIT_TTL_SECONDS: 60,
      RATE_LIMIT_MAX: 120,
    });
  });

  it('coerces numbers and splits CORS origins', () => {
    const env = validateEnv({
      ...REQUIRED,
      PORT: '8080',
      CORS_ORIGINS: 'https://twentyfive.lk, http://localhost:5173',
    });
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['https://twentyfive.lk', 'http://localhost:5173']);
  });

  it('requires a postgres DATABASE_URL', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: REQUIRED.JWT_ACCESS_SECRET })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...REQUIRED, DATABASE_URL: 'mysql://x' })).toThrow(/postgresql:\/\/ connection string/);
  });

  it('requires a strong JWT secret and applies auth defaults', () => {
    expect(() => validateEnv({ DATABASE_URL, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET: must be at least 32 characters/,
    );
    expect(validateEnv(REQUIRED)).toMatchObject({
      ACCESS_TOKEN_TTL_MINUTES: 15,
      REFRESH_TOKEN_TTL_DAYS: 30,
      WEB_APP_URL: 'http://localhost:5173',
    });
  });

  it('lists every problem in one error', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging', PORT: 'abc', CORS_ORIGINS: 'not-a-url' })).toThrow(
      /Invalid environment configuration:[\s\S]*NODE_ENV[\s\S]*PORT[\s\S]*CORS_ORIGINS/,
    );
  });
});
