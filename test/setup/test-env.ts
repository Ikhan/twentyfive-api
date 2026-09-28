/** Tests always use the dedicated twentyfive_test database, never the dev one. */
export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgresql://twentyfive:twentyfive@localhost:5433/twentyfive_test';

/** Fixed test-only secret; never used outside tests. */
export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

/** MinIO from docker compose (CI runs the same on 9002). */
export const TEST_S3 = {
  bucket: process.env['TEST_S3_BUCKET'] ?? 'twentyfive-test',
  region: 'ap-south-1',
  endpoint: process.env['TEST_S3_ENDPOINT'] ?? 'http://localhost:9002',
  accessKeyId: process.env['TEST_S3_ACCESS_KEY_ID'] ?? 'twentyfive',
  secretAccessKey: process.env['TEST_S3_SECRET_ACCESS_KEY'] ?? 'twentyfive-secret',
  forcePathStyle: true,
};
