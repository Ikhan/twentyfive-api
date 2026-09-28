import { execSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './test-env.js';

/**
 * Vitest globalSetup for integration and e2e tests: brings the test database
 * up to the latest migration and seeds reference data (districts) once per run.
 */
export default function setup(): void {
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('npx prisma db seed', { env, stdio: 'pipe' });
}
