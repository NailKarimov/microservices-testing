import {
  test,
  expect,
  expectSchema,
  orderSchema,
  sockListSchema,
  springErrorSchema,
  PAYMENT_LIMIT,
} from '../../src';
import { ShippingQueue } from '../../src/sockshop/queue';
import { docker } from '../../src/support/docker';
import type { SockShopClient } from '../../src/sockshop/SockShopClient';

/** Real catalogue prices, cheapest first. */
async function cheapSocks(shop: SockShopClient) {
  const socks = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body);
  return [...socks].sort((a, b) => a.price - b.price);
}

/**
 * No queue-master runs in this compose file, so a message the orders service publishes stays in
 * `shipping-task` until a test reads it: the broker is a verifiable, asynchronous side effect of
 * placing an order, not just an implementation detail.
 *
 * These tests share one broker-wide queue, so they run one after another (`mode: 'serial'`) and
 * each starts by purging it (the `queue` fixture does this), rather than in parallel with the
 * other Sock Shop projects that also place orders.
 */
test.describe.configure({ mode: 'serial', timeout: 60_000 });

test.describe('Orders → shipping-task queue (RabbitMQ)', () => {
  test(
    'a successful order publishes exactly one shipping task',
    { tag: '@smoke' },
    async ({ shop, queue }) => {
      const checkout = await shop.newCustomer();
      const [sock] = await cheapSocks(shop);
      await shop.addToCart(checkout.customerId, sock.id, sock.price);

      const order = expectSchema(orderSchema, (await shop.placeOrder(checkout)).body);

      const task = await queue.take();
      expect(task).toBeDefined();
      expect(task).toMatchObject({
        routingKey: 'shipping-task',
        contentType: 'application/json',
        body: { id: order.shipment.id, name: order.customerId },
      });
      // exactly one message: nothing else was published for this order
      expect(await queue.take()).toBeUndefined();
    },
  );

  test('a declined payment publishes nothing', async ({ shop, queue }) => {
    const checkout = await shop.newCustomer();
    const [sock] = await cheapSocks(shop);
    const quantity = Math.ceil((PAYMENT_LIMIT + 1) / sock.price);
    for (let i = 0; i < quantity; i++) await shop.addToCart(checkout.customerId, sock.id, sock.price);

    const res = await shop.placeOrder(checkout);

    expect(res.status).toBe(406);
    expect(expectSchema(springErrorSchema, res.body).message).toContain('Payment declined');
    expect(await queue.messageCount()).toBe(0);
  });

  // Fault injection: the broker itself is unreachable while an order is placed. Does not use the
  // `queue` fixture, whose connection would not survive the broker going down; a fresh connection
  // is made once it is back, to read the queue without racing other tests.
  test.describe('known defects', () => {
    test.afterEach(async () => {
      await docker('start', 'rabbitmq');
    });

    test('an order succeeds even when RabbitMQ is down, and its shipping task is lost', async ({ shop }) => {
      test.fail(
        true,
        'SS-17: placing an order never checks that the shipping task was actually queued; with the ' +
          'broker down the order is still created (just slower) and the shipping task silently disappears',
      );
      const checkout = await shop.newCustomer();
      const [sock] = await cheapSocks(shop);
      await shop.addToCart(checkout.customerId, sock.id, sock.price);
      await docker('stop', 'rabbitmq');

      const started = Date.now();
      const res = await shop.placeOrder(checkout);
      const seconds = (Date.now() - started) / 1_000;

      // A system that depends on the shipping task reaching its queue would refuse the order
      // (or retry) rather than confirm it and lose the task.
      expect(res.status, `took ${seconds.toFixed(1)} s`).not.toBe(201);

      await docker('start', 'rabbitmq');
      const queue = await ShippingQueue.connectWithRetry();
      expect(await queue.messageCount()).toBe(0);
      await queue.close();
    });

    test('the shipping-task queue is declared durable, so a broker restart cannot drop a pending task', async ({
      shop,
    }) => {
      test.fail(true, 'SS-18: shipping-task is declared with durable=false (rabbitmqctl list_queues)');
      const checkout = await shop.newCustomer();
      const [sock] = await cheapSocks(shop);
      await shop.addToCart(checkout.customerId, sock.id, sock.price);
      await shop.placeOrder(checkout); // publishes one message, left unread on purpose

      await docker('stop', 'rabbitmq');
      await docker('start', 'rabbitmq');

      const survived = await ShippingQueue.connectWithRetry();
      expect(await survived.messageCount()).toBe(1);
      await survived.close();
    });
  });
});
