import { test as base, expect } from '@playwright/test';
import * as allure from 'allure-js-commons';
import { ApiClient } from './api/ApiClient';
import { SockShopClient } from './sockshop/SockShopClient';
import { ShippingQueue } from './sockshop/queue';
import { env } from '../config/env';

let stack: Promise<boolean> | undefined;
/** One cheap probe per worker: is the payment service of the Sock Shop answering? */
function stackIsUp(): Promise<boolean> {
  stack ??= fetch(`${env.sockShop.payment}/health`, { signal: AbortSignal.timeout(3_000) })
    .then((r) => r.ok)
    .catch(() => false);
  return stack;
}

type Fixtures = {
  shop: SockShopClient;
  /** A connection to the `shipping-task` queue, purged before each test for isolation. */
  queue: ShippingQueue;
  /** Auto fixture: labels every test in the Allure report. */
  allureLabels: void;
};

const OWNER = 'Nail Karimov';
const EPICS: Record<string, string> = {
  sockshop: 'Sock Shop',
  'sockshop-chaos': 'Sock Shop — resilience',
  'sockshop-events': 'Sock Shop — events (RabbitMQ)',
  security: 'Security',
};

/** @smoke → critical, @security → critical, everything else → normal. */
function severityOf(tags: string[]): 'critical' | 'normal' {
  return tags.includes('@smoke') || tags.includes('@security') ? 'critical' : 'normal';
}

/** Without the stack the tests are skipped locally, and fail when REQUIRE_STACK=1 (CI). */
async function requireStack(): Promise<void> {
  if (await stackIsUp()) return;
  const reason = 'Sock Shop is not running: start it with `npm run stack:up`.';
  if (env.requireStack) throw new Error(reason);
  test.skip(true, reason);
}

export const test = base.extend<Fixtures>({
  allureLabels: [
    // Playwright requires a destructuring pattern for the fixtures argument.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      await allure.owner(OWNER);
      await allure.layer('api');
      await allure.severity(severityOf(testInfo.tags));
      const epic = EPICS[testInfo.project.name];
      if (epic) await allure.epic(epic);
      await use();
    },
    { auto: true },
  ],
  shop: async ({ request }, use) => {
    await requireStack();
    await use(new SockShopClient(new ApiClient(request)));
  },
  // eslint-disable-next-line no-empty-pattern
  queue: async ({}, use) => {
    await requireStack();
    const queue = new ShippingQueue();
    await queue.connect();
    await queue.purge();
    await use(queue);
    await queue.close();
  },
});

export { expect };
