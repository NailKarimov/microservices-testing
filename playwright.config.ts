import { defineConfig } from '@playwright/test';
import { env } from './config/env';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 2,
  timeout: 30_000,
  reporter: [[isCI ? 'github' : 'list'], ['html', { open: 'never' }], ['allure-playwright']],
  use: {
    extraHTTPHeaders: { Accept: 'application/json' },
  },
  projects: [
    // Microservices in Docker: `npm run stack:up` first. Skipped locally when the stack is down.
    { name: 'sockshop', testDir: './tests/sockshop', use: { baseURL: env.sockShop.gateway } },
    // Fault injection (stops and restarts containers), so it runs only after the other Sock Shop tests.
    {
      name: 'sockshop-chaos',
      testDir: './tests/sockshop-chaos',
      dependencies: ['sockshop'],
      use: { baseURL: env.sockShop.gateway },
    },
    // RabbitMQ `shipping-task` queue: runs serially, after sockshop and sockshop-chaos so the
    // queue is not shared with their order placements.
    {
      name: 'sockshop-events',
      testDir: './tests/sockshop-events',
      dependencies: ['sockshop', 'sockshop-chaos'],
      use: { baseURL: env.sockShop.gateway },
    },
    // HTTP security headers of the gateway; requests use absolute URLs.
    { name: 'security', testDir: './tests/security' },
    { name: 'unit', testDir: './tests/unit' },
  ],
});
