import { defineConfig, devices } from '@playwright/test';

/**
 * Performance checks (SPEC §10), not part of `bun run e2e` or CI: they need the production build and a
 * filled database, so they run against a stack that is already up, by default the local k3d cluster or
 * the compose `prod` profile at http://localhost:8080. How to run them: docs/DEPLOY.md → Performance.
 */
export default defineConfig({
  testDir: './perf',
  testMatch: '*.perf.ts',
  workers: 1,
  timeout: 300_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.PERF_URL ?? 'http://localhost:8080',
    locale: 'en-GB',
  },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
});
