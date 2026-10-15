import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  test,
  expect,
  expectSchema,
  orderSchema,
  customerOrdersSchema,
  sockListSchema,
  springErrorSchema,
} from '../../src';
import { env } from '../../config/env';
import type { SockShopClient } from '../../src/sockshop/SockShopClient';

const run = promisify(execFile);
const COMPOSE = ['compose', '-f', 'infra/sock-shop/docker-compose.yml'];
const docker = (...args: string[]) => run('docker', [...COMPOSE, ...args]);

/** The cheapest sock keeps the total under the payment limit. */
async function cheapestSock(shop: SockShopClient) {
  const socks = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body);
  return socks.reduce((a, b) => (b.price < a.price ? b : a));
}

async function waitUntilUp(url: string, seconds: number) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2_000) })).ok) return;
    } catch {
      /* still starting */
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`${url} did not come back within ${seconds} s`);
}

/**
 * Fault injection: a container is stopped on purpose and the rest of the system must behave.
 * These tests change the running stack, so they run serially and only after every other
 * Sock Shop test (see the `sockshop-chaos` project). Each test puts the container back.
 */
test.describe.configure({ mode: 'serial', timeout: 150_000 });

test.describe('Resilience: one microservice goes down', () => {
  test.afterEach(async () => {
    await docker('start', 'payment', 'carts');
    await waitUntilUp(`${env.sockShop.payment}/health`, 60);
    await waitUntilUp(`${env.sockShop.carts}/health`, 120);
  });

  test('payment down: the order fails fast, nothing is stored, and the other services stay up', async ({
    shop,
  }) => {
    const checkout = await shop.newCustomer();
    const sock = await cheapestSock(shop);
    await shop.addToCart(checkout.customerId, sock.id, sock.price);

    await docker('stop', 'payment');
    const started = Date.now();
    const res = await shop.placeOrder(checkout);
    const seconds = (Date.now() - started) / 1000;

    expect(res.status).toBe(500);
    expect(expectSchema(springErrorSchema, res.body).message).toContain('timeout');
    expect(seconds, 'the caller is not left hanging').toBeLessThan(30);
    expect(
      expectSchema(customerOrdersSchema, (await shop.ordersOf(checkout.customerId)).body)._embedded
        .customerOrders,
    ).toEqual([]);
    // everything that does not need payment keeps working
    expect((await shop.catalogue()).status).toBe(200);
    expect((await shop.cartItems(checkout.customerId)).status).toBe(200);
  });

  test('payment comes back: the same cart can be ordered without any manual repair', async ({ shop }) => {
    const checkout = await shop.newCustomer();
    const sock = await cheapestSock(shop);
    await shop.addToCart(checkout.customerId, sock.id, sock.price);
    await docker('stop', 'payment');
    expect((await shop.placeOrder(checkout)).status).toBe(500);

    await docker('start', 'payment');
    await waitUntilUp(`${env.sockShop.payment}/health`, 60);
    const res = await shop.placeOrder(checkout);

    expect(res.status).toBe(201);
    expect(expectSchema(orderSchema, res.body).customerId).toBe(checkout.customerId);
  });

  test('carts down: browsing and payment are not affected', async ({ shop }) => {
    await docker('stop', 'carts');

    const catalogue = await shop.catalogue();
    const payment = await shop.authorisePayment(10);
    const cart = await shop.api.get(`${env.sockShop.carts}/carts/anyone/items`).catch(() => null);

    expect(catalogue.status).toBe(200);
    expect(payment.status).toBe(200);
    expect(cart, 'the stopped service really is unreachable').toBeNull();
  });
});
