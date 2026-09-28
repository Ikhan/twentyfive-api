import { validateEnv } from './env.schema.js';

const DATABASE_URL = 'postgresql://u:p@localhost:5433/db';

describe('validateEnv', () => {
  it('applies defaults for an empty environment', () => {
    const env = validateEnv({ DATABASE_URL });
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
      DATABASE_URL,
      PORT: '8080',
      CORS_ORIGINS: 'https://twentyfive.lk, http://localhost:5173',
    });
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['https://twentyfive.lk', 'http://localhost:5173']);
  });

  it('requires a postgres DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/postgresql:\/\/ connection string/);
  });

  it('lists every problem in one error', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging', PORT: 'abc', CORS_ORIGINS: 'not-a-url' })).toThrow(
      /Invalid environment configuration:[\s\S]*NODE_ENV[\s\S]*PORT[\s\S]*CORS_ORIGINS/,
    );
  });
});
