import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/** Integration tests: repositories and services against the real twentyfive_test Postgres. */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.int-spec.ts'],
    globalSetup: ['./test/setup/global-db.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
