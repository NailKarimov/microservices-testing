import {
  test,
  expect,
  expectSchema,
  orderSchema,
  storedOrderSchema,
  customerOrdersSchema,
  sockListSchema,
  springErrorSchema,
  SHIPPING_FEE,
  PAYMENT_LIMIT,
} from '../../src';
import type { SockShopClient } from '../../src/sockshop/SockShopClient';

const cents = (n: number) => Math.round(n * 100) / 100;

/** Real catalogue prices, cheapest first, so that totals stay under the payment limit. */
async function cheapSocks(shop: SockShopClient) {
  const socks = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body);
  return [...socks].sort((a, b) => a.price - b.price);
}

test.describe('Orders: cart → order → payment → shipping', () => {
  test('a customer buys one sock end to end', { tag: '@smoke' }, async ({ shop }) => {
    const checkout = await shop.newCustomer();
    const [sock] = await cheapSocks(shop);
    await shop.addToCart(checkout.customerId, sock.id, sock.price);

    const res = await shop.placeOrder(checkout);

    expect(res.status).toBe(201);
    const order = expectSchema(orderSchema, res.body);
    expect(order.customerId).toBe(checkout.customerId);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ itemId: sock.id, quantity: 1, unitPrice: sock.price });
    // the shipping service has been called and booked a shipment for this customer
    expect(order.shipment.name).toBe(checkout.customerId);
    // total = goods + flat shipping fee
    expect(order.total).toBeCloseTo(sock.price + SHIPPING_FEE, 2);
  });

  test('the new order can be found again by customer and by id', async ({ shop }) => {
    const checkout = await shop.newCustomer();
    const [sock] = await cheapSocks(shop);
    await shop.addToCart(checkout.customerId, sock.id, sock.price);
    const order = expectSchema(orderSchema, (await shop.placeOrder(checkout)).body);

    const byCustomer = expectSchema(customerOrdersSchema, (await shop.ordersOf(checkout.customerId)).body);
    const byId = await shop.order(order.id);

    expect(byCustomer._embedded.customerOrders).toHaveLength(1);
    expect(byCustomer._embedded.customerOrders[0].total).toBe(order.total);
    expect(byId.status).toBe(200);
    const stored = expectSchema(storedOrderSchema, byId.body);
    expect(stored._links.self.href).toMatch(new RegExp(`/orders/${order.id}$`));
    expect(stored).toMatchObject({ customerId: checkout.customerId, total: order.total });
    expect(stored.shipment.name).toBe(order.shipment.name);
  });

  test('the total adds up several lines and quantities', async ({ shop }) => {
    const checkout = await shop.newCustomer();
    const [a, b] = await cheapSocks(shop);
    await shop.addToCart(checkout.customerId, a.id, a.price);
    await shop.addToCart(checkout.customerId, a.id, a.price); // quantity 2
    await shop.addToCart(checkout.customerId, b.id, b.price);

    const order = expectSchema(orderSchema, (await shop.placeOrder(checkout)).body);

    expect(order.items).toHaveLength(2);
    expect(order.total).toBeCloseTo(cents(2 * a.price + b.price + SHIPPING_FEE), 2);
  });

  test('every order gets its own shipment', async ({ shop }) => {
    const first = await shop.newCustomer();
    const second = await shop.newCustomer();
    const [sock] = await cheapSocks(shop);
    await shop.addToCart(first.customerId, sock.id, sock.price);
    await shop.addToCart(second.customerId, sock.id, sock.price);

    const a = expectSchema(orderSchema, (await shop.placeOrder(first)).body);
    const b = expectSchema(orderSchema, (await shop.placeOrder(second)).body);

    expect(a.shipment.id).not.toBe(b.shipment.id);
    expect(a.id).not.toBe(b.id);
  });

  test('an unknown order id is answered with 404', async ({ shop }) => {
    expect((await shop.order('000000000000000000000000')).status).toBe(404);
  });

  // Payment limit across the service boundary: orders asks payment to authorise goods + shipping.
  // Catalogue prices cannot hit 100.00 exactly, so the boundary is built with a cart price
  // (the cart accepts any price, see SS-6). The expected amounts are in the test names.
  test.describe('payment decision is applied to the order total', () => {
    test(`total of exactly ${PAYMENT_LIMIT}.00 (95.01 + ${SHIPPING_FEE}) is authorised`, async ({ shop }) => {
      const checkout = await shop.newCustomer();
      await shop.addToCart(checkout.customerId, 'boundary-item', 95.01);

      const res = await shop.placeOrder(checkout);

      expect(res.status).toBe(201);
      expect(expectSchema(orderSchema, res.body).total).toBeCloseTo(PAYMENT_LIMIT, 2);
    });

    test(`total of ${PAYMENT_LIMIT}.01 (95.02 + ${SHIPPING_FEE}) is declined with 406`, async ({ shop }) => {
      const checkout = await shop.newCustomer();
      await shop.addToCart(checkout.customerId, 'boundary-item', 95.02);

      const res = await shop.placeOrder(checkout);

      expect(res.status).toBe(406);
      expect(expectSchema(springErrorSchema, res.body).message).toContain('Payment declined');
    });

    test('a real sock that is too expensive together with shipping is declined', async ({ shop }) => {
      const checkout = await shop.newCustomer();
      const socks = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body);
      const priciest = socks.reduce((a, b) => (b.price > a.price ? b : a));
      // precondition: the catalogue still has a sock that cannot be bought together with shipping
      expect(priciest.price + SHIPPING_FEE).toBeGreaterThan(PAYMENT_LIMIT);
      await shop.addToCart(checkout.customerId, priciest.id, priciest.price);

      const res = await shop.placeOrder(checkout);

      expect(res.status).toBe(406);
    });

    test('a declined order leaves nothing behind', async ({ shop }) => {
      const checkout = await shop.newCustomer();
      await shop.addToCart(checkout.customerId, 'boundary-item', 95.02);

      await shop.placeOrder(checkout);

      const stored = expectSchema(customerOrdersSchema, (await shop.ordersOf(checkout.customerId)).body);
      expect(stored._embedded.customerOrders).toEqual([]);
    });
  });

  test.describe('known defects', () => {
    test('an order with an empty cart is rejected', async ({ shop }) => {
      test.fail(true, 'SS-9: POST /orders with an empty cart → 201, the customer is charged only shipping');
      const checkout = await shop.newCustomer();

      const res = await shop.placeOrder(checkout);

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('the order response does not contain the full card number or CCV', async ({ shop }) => {
      test.fail(true, 'SS-4: POST /orders echoes and stores the full PAN and CCV in clear text');
      const checkout = await shop.newCustomer();
      const [sock] = await cheapSocks(shop);
      await shop.addToCart(checkout.customerId, sock.id, sock.price);

      const res = await shop.placeOrder(checkout);

      expect(res.text).not.toContain('4111111111111111');
      expect(res.text).not.toMatch(/"ccv"\s*:\s*"123"/);
    });

    test('an order with a negative total is answered with a client error', async ({ shop }) => {
      test.fail(true, 'SS-7: a negative cart price leads to 500 "unspecified IO error" instead of 4xx');
      const checkout = await shop.newCustomer();
      await shop.addToCart(checkout.customerId, 'boundary-item', -50);

      const res = await shop.placeOrder(checkout);

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });
});
