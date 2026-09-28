/** Tests always use the dedicated twentyfive_test database, never the dev one. */
export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgresql://twentyfive:twentyfive@localhost:5433/twentyfive_test';

/** Fixed test-only secret; never used outside tests. */
export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
