import { defineConfig, devices } from '@playwright/test';

import { API_URL, WEB_URL } from './support/env.js';

const CI = Boolean(process.env.CI);

/**
 * Runs against the dev stack: Postgres and Mailpit from `infra/docker`, the built api and the Vite dev
 * server. `bun run e2e` (repo root) builds the api first; a stack that is already running locally is reused.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: WEB_URL,
    locale: 'en-GB',
    trace: 'retain-on-failure',
  },
  // SPEC §9: designed for phones first.
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: [
    {
      // Reads apps/api/.env like `bun run dev` does; variables already in the environment win.
      command: 'node --env-file-if-exists=.env --enable-source-maps dist/main.js',
      cwd: '../apps/api',
      url: `${API_URL}/readyz`,
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: 'bun run dev --strictPort',
      cwd: '../apps/web',
      url: WEB_URL,
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
});
