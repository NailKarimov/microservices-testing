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
import { docker, waitUntilUp } from '../../src/support/docker';
import type { SockShopClient } from '../../src/sockshop/SockShopClient';

/** The cheapest sock keeps the total under the payment limit. */
async function cheapestSock(shop: SockShopClient) {
  const socks = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body);
  return socks.reduce((a, b) => (b.price < a.price ? b : a));
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
    // "…timeout…" when the call hangs, "unspecified IO error" when the connection is refused at once:
    // both mean payment is unreachable; which one depends on timing, so both are accepted and recorded.
    const message = expectSchema(springErrorSchema, res.body).message;
    test.info().annotations.push({
      type: 'payment down',
      description: `${res.status} "${message}" after ${seconds.toFixed(1)} s`,
    });
    expect(message).toMatch(/timeout|IO error/i);
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

    // payment's /health answering does not mean orders can reach it yet: right after a restart orders
    // sometimes still fails with "unspecified IO error". Measure the time to recover (MTTR) instead of
    // expecting the very first order to succeed; recovery must still happen without manual repair.
    const back = Date.now();
    let res = await shop.placeOrder(checkout);
    let attempts = 1;
    while (res.status !== 201 && Date.now() - back < 90_000) {
      await new Promise((r) => setTimeout(r, 3_000));
      res = await shop.placeOrder(checkout);
      attempts++;
    }
    test.info().annotations.push({
      type: 'time to recover',
      description: `${((Date.now() - back) / 1000).toFixed(1)} s, ${attempts} order attempt(s) after payment was healthy`,
    });

    expect(res.status, 'orders recovers by itself within 90 s').toBe(201);
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
