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
      // prisma.service.ts needs a real database: covered by src/prisma/prisma.service.int-spec.ts.
      exclude: [
        'src/main.ts',
        'src/app.setup.ts',
        'src/prisma/prisma.service.ts',
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
