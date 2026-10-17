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

      const task = await queue.takeWithin(10_000);
      expect(task, 'no shipping task within 10 s of the order').toBeDefined();
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

    // SS-17 does not reproduce on every run: with the broker down the orders service sometimes
    // refuses the order and sometimes confirms it (depends on whether its cached AMQP connection is
    // already known to be dead). Both outcomes are checked; only the confirmed-order path is the
    // defect, so `test.fail` is switched on for that path alone, and each run records which one it saw.
    test('an order placed while RabbitMQ is down is either refused or keeps its shipping task', async ({
      shop,
    }) => {
      const checkout = await shop.newCustomer();
      const [sock] = await cheapSocks(shop);
      await shop.addToCart(checkout.customerId, sock.id, sock.price);
      await docker('stop', 'rabbitmq');

      const started = Date.now();
      const res = await shop.placeOrder(checkout);
      const seconds = (Date.now() - started) / 1_000;
      const confirmed = res.status === 201;
      test.info().annotations.push({
        type: 'SS-17 observed',
        description: `HTTP ${res.status} after ${seconds.toFixed(1)} s — order ${confirmed ? 'confirmed' : 'refused'}`,
      });
      test.fail(
        confirmed,
        'SS-17: the order is confirmed although the shipping task could not be queued, and the task is lost',
      );

      await docker('start', 'rabbitmq');
      const queue = await ShippingQueue.connectWithRetry();
      const queued = await queue.messageCount();
      await queue.close();

      // Refused → nothing may be queued. Confirmed → its shipping task must not be lost.
      expect(queued, `HTTP ${res.status}, ${queued} message(s) in shipping-task`).toBe(confirmed ? 1 : 0);
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
