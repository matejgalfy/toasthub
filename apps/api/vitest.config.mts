import { defineConfig } from 'vitest/config';

// Read @toasthub/shared from source (see docs/AGENTS.md) on top of Vite's default server conditions.
const conditions = ['@toasthub/source', 'module', 'node', 'development|production'];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.int.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'int',
          include: ['src/**/*.int.test.ts'],
          globalSetup: ['test/global-setup.ts'],
          setupFiles: ['test/setup-int.ts'],
          // One database for the whole run, truncated between tests, so files must not overlap.
          fileParallelism: false,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
