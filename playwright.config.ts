import { defineConfig } from '@playwright/test';
import { env } from './config/env';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // OpenWeather free plan allows 60 calls/minute; two workers keep the suite well below that.
  workers: 2,
  timeout: 30_000,
  reporter: [[isCI ? 'github' : 'list'], ['html', { open: 'never' }], ['allure-playwright']],
  use: {
    extraHTTPHeaders: { Accept: 'application/json' },
  },
  projects: [
    { name: 'openweather', testDir: './tests/openweather', use: { baseURL: env.apiBaseUrl } },
    { name: 'petstore', testDir: './tests/petstore', use: { baseURL: env.petstoreBaseUrl } },
    { name: 'unit', testDir: './tests/unit' },
  ],
});
