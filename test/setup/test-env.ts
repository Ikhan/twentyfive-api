/** Tests always use the dedicated twentyfive_test database, never the dev one. */
export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgresql://twentyfive:twentyfive@localhost:5433/twentyfive_test';
