import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/** Unit tests: fast, no database or network. Integration (*.int-spec.ts) and e2e have their own configs. */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // main.ts and app.setup.ts are bootstrap wiring, covered end-to-end by test/e2e/app.e2e-spec.ts.
      // Code that needs a real database is covered by the integration suite (*.int-spec.ts) instead:
      // prisma.service.ts and every prisma-*.repository.ts.
      exclude: [
        'src/main.ts',
        'src/export-openapi.ts',
        'src/app.setup.ts',
        'src/prisma/prisma.service.ts',
        'src/**/prisma-*.repository.ts',
        // Talks to real S3/MinIO: covered by s3-object-storage.int-spec.ts.
        'src/modules/media/storage/s3-object-storage.ts',
        'src/generated/**',
        'src/**/*.module.ts',
        'src/**/*.spec.ts',
        'src/**/*.int-spec.ts',
        'src/**/dto/**',
        'src/**/*.d.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
