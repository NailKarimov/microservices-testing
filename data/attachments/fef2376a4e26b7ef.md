# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sockshop-events/orders-queue.spec.ts >> Orders → shipping-task queue (RabbitMQ) >> known defects >> the shipping-task queue is declared durable, so a broker restart cannot drop a pending task
- Location: tests/sockshop-events/orders-queue.spec.ts:109:9

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 0
```

# Test source

```ts
  22  |  * `shipping-task` until a test reads it: the broker is a verifiable, asynchronous side effect of
  23  |  * placing an order, not just an implementation detail.
  24  |  *
  25  |  * These tests share one broker-wide queue, so they run one after another (`mode: 'serial'`) and
  26  |  * each starts by purging it (the `queue` fixture does this), rather than in parallel with the
  27  |  * other Sock Shop projects that also place orders.
  28  |  */
  29  | test.describe.configure({ mode: 'serial', timeout: 60_000 });
  30  | 
  31  | test.describe('Orders → shipping-task queue (RabbitMQ)', () => {
  32  |   test(
  33  |     'a successful order publishes exactly one shipping task',
  34  |     { tag: '@smoke' },
  35  |     async ({ shop, queue }) => {
  36  |       const checkout = await shop.newCustomer();
  37  |       const [sock] = await cheapSocks(shop);
  38  |       await shop.addToCart(checkout.customerId, sock.id, sock.price);
  39  | 
  40  |       const order = expectSchema(orderSchema, (await shop.placeOrder(checkout)).body);
  41  | 
  42  |       const task = await queue.takeWithin(10_000);
  43  |       expect(task, 'no shipping task within 10 s of the order').toBeDefined();
  44  |       expect(task).toMatchObject({
  45  |         routingKey: 'shipping-task',
  46  |         contentType: 'application/json',
  47  |         body: { id: order.shipment.id, name: order.customerId },
  48  |       });
  49  |       // exactly one message: nothing else was published for this order
  50  |       expect(await queue.take()).toBeUndefined();
  51  |     },
  52  |   );
  53  | 
  54  |   test('a declined payment publishes nothing', async ({ shop, queue }) => {
  55  |     const checkout = await shop.newCustomer();
  56  |     const [sock] = await cheapSocks(shop);
  57  |     const quantity = Math.ceil((PAYMENT_LIMIT + 1) / sock.price);
  58  |     for (let i = 0; i < quantity; i++) await shop.addToCart(checkout.customerId, sock.id, sock.price);
  59  | 
  60  |     const res = await shop.placeOrder(checkout);
  61  | 
  62  |     expect(res.status).toBe(406);
  63  |     expect(expectSchema(springErrorSchema, res.body).message).toContain('Payment declined');
  64  |     expect(await queue.messageCount()).toBe(0);
  65  |   });
  66  | 
  67  |   // Fault injection: the broker itself is unreachable while an order is placed. Does not use the
  68  |   // `queue` fixture, whose connection would not survive the broker going down; a fresh connection
  69  |   // is made once it is back, to read the queue without racing other tests.
  70  |   test.describe('known defects', () => {
  71  |     test.afterEach(async () => {
  72  |       await docker('start', 'rabbitmq');
  73  |     });
  74  | 
  75  |     // SS-17 does not reproduce on every run: with the broker down the orders service sometimes
  76  |     // refuses the order and sometimes confirms it (depends on whether its cached AMQP connection is
  77  |     // already known to be dead). Both outcomes are checked; only the confirmed-order path is the
  78  |     // defect, so `test.fail` is switched on for that path alone, and each run records which one it saw.
  79  |     test('an order placed while RabbitMQ is down is either refused or keeps its shipping task', async ({
  80  |       shop,
  81  |     }) => {
  82  |       const checkout = await shop.newCustomer();
  83  |       const [sock] = await cheapSocks(shop);
  84  |       await shop.addToCart(checkout.customerId, sock.id, sock.price);
  85  |       await docker('stop', 'rabbitmq');
  86  | 
  87  |       const started = Date.now();
  88  |       const res = await shop.placeOrder(checkout);
  89  |       const seconds = (Date.now() - started) / 1_000;
  90  |       const confirmed = res.status === 201;
  91  |       test.info().annotations.push({
  92  |         type: 'SS-17 observed',
  93  |         description: `HTTP ${res.status} after ${seconds.toFixed(1)} s — order ${confirmed ? 'confirmed' : 'refused'}`,
  94  |       });
  95  |       test.fail(
  96  |         confirmed,
  97  |         'SS-17: the order is confirmed although the shipping task could not be queued, and the task is lost',
  98  |       );
  99  | 
  100 |       await docker('start', 'rabbitmq');
  101 |       const queue = await ShippingQueue.connectWithRetry();
  102 |       const queued = await queue.messageCount();
  103 |       await queue.close();
  104 | 
  105 |       // Refused → nothing may be queued. Confirmed → its shipping task must not be lost.
  106 |       expect(queued, `HTTP ${res.status}, ${queued} message(s) in shipping-task`).toBe(confirmed ? 1 : 0);
  107 |     });
  108 | 
  109 |     test('the shipping-task queue is declared durable, so a broker restart cannot drop a pending task', async ({
  110 |       shop,
  111 |     }) => {
  112 |       test.fail(true, 'SS-18: shipping-task is declared with durable=false (rabbitmqctl list_queues)');
  113 |       const checkout = await shop.newCustomer();
  114 |       const [sock] = await cheapSocks(shop);
  115 |       await shop.addToCart(checkout.customerId, sock.id, sock.price);
  116 |       await shop.placeOrder(checkout); // publishes one message, left unread on purpose
  117 | 
  118 |       await docker('stop', 'rabbitmq');
  119 |       await docker('start', 'rabbitmq');
  120 | 
  121 |       const survived = await ShippingQueue.connectWithRetry();
> 122 |       expect(await survived.messageCount()).toBe(1);
      |                                             ^ Error: expect(received).toBe(expected) // Object.is equality
  123 |       await survived.close();
  124 |     });
  125 |   });
  126 | });
  127 | 
```