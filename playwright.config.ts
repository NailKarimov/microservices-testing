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
    // Microservices in Docker: `npm run stack:up` first. Skipped locally when the stack is down.
    { name: 'sockshop', testDir: './tests/sockshop', use: { baseURL: env.sockShop.gateway } },
    // Fault injection (stops and restarts containers), so it runs only after the other Sock Shop tests.
    {
      name: 'sockshop-chaos',
      testDir: './tests/sockshop-chaos',
      dependencies: ['sockshop'],
      use: { baseURL: env.sockShop.gateway },
    },
    // Cross-cutting HTTP security checks; every request uses an absolute URL, so there is no baseURL.
    { name: 'security', testDir: './tests/security' },
    { name: 'unit', testDir: './tests/unit' },
  ],
});
