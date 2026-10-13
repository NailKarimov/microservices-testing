import { defineConfig } from '@playwright/test';
import { env } from './config/env';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Free plan allows 60 calls/minute; two workers keep the suite well below that.
  workers: 2,
  timeout: 30_000,
  reporter: [[isCI ? 'github' : 'list'], ['html', { open: 'never' }], ['allure-playwright']],
  use: {
    baseURL: env.apiBaseUrl,
    extraHTTPHeaders: { Accept: 'application/json' },
  },
  projects: [{ name: 'api' }],
});
