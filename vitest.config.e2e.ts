import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/** End-to-end tests: boot the whole app and talk HTTP. Run serially; they share the test database. */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/setup/global-db.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
