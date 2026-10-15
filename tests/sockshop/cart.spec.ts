import { test, expect, expectSchema, cartItemSchema, cartItemsSchema, sockListSchema } from '../../src';
import type { SockShopClient } from '../../src/sockshop/SockShopClient';

/** Two different real socks with their catalogue prices. */
async function twoSocks(shop: SockShopClient) {
  const socks = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body);
  return socks.slice(0, 2);
}

test.describe('Cart service /carts/{customerId}/items', () => {
  test('adding a sock creates one cart line', { tag: '@smoke' }, async ({ shop }) => {
    const { customerId } = await shop.newCustomer();
    const [sock] = await twoSocks(shop);

    const res = await shop.addToCart(customerId, sock.id, sock.price);

    expect(res.status).toBe(201);
    expect(expectSchema(cartItemSchema, res.body)).toMatchObject({
      itemId: sock.id,
      quantity: 1,
      unitPrice: sock.price,
    });
    const items = expectSchema(cartItemsSchema, (await shop.cartItems(customerId)).body);
    expect(items).toHaveLength(1);
  });

  test('adding the same sock twice raises the quantity instead of adding a second line', async ({ shop }) => {
    const { customerId } = await shop.newCustomer();
    const [sock] = await twoSocks(shop);

    await shop.addToCart(customerId, sock.id, sock.price);
    await shop.addToCart(customerId, sock.id, sock.price);

    const items = expectSchema(cartItemsSchema, (await shop.cartItems(customerId)).body);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  test('two different socks make two cart lines', async ({ shop }) => {
    const { customerId } = await shop.newCustomer();
    const [a, b] = await twoSocks(shop);

    await shop.addToCart(customerId, a.id, a.price);
    await shop.addToCart(customerId, b.id, b.price);

    const items = expectSchema(cartItemsSchema, (await shop.cartItems(customerId)).body);
    expect(items.map((i) => i.itemId).sort()).toEqual([a.id, b.id].sort());
  });

  test('carts of different customers do not mix', async ({ shop }) => {
    const first = await shop.newCustomer();
    const second = await shop.newCustomer();
    const [sock] = await twoSocks(shop);

    await shop.addToCart(first.customerId, sock.id, sock.price);

    expect(expectSchema(cartItemsSchema, (await shop.cartItems(second.customerId)).body)).toEqual([]);
  });

  test('a customer who never shopped has an empty cart, not an error', async ({ shop }) => {
    const { customerId } = await shop.newCustomer();

    const res = await shop.cartItems(customerId);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('a sock is removed by its catalogue id (not by the id of the cart line)', async ({ shop }) => {
    const { customerId } = await shop.newCustomer();
    const [a, b] = await twoSocks(shop);
    await shop.addToCart(customerId, a.id, a.price);
    await shop.addToCart(customerId, b.id, b.price);

    const res = await shop.removeFromCart(customerId, a.id);

    expect(res.status).toBe(202);
    const items = expectSchema(cartItemsSchema, (await shop.cartItems(customerId)).body);
    expect(items.map((i) => i.itemId)).toEqual([b.id]);
  });

  test('clearing the cart removes every line', async ({ shop }) => {
    const { customerId } = await shop.newCustomer();
    const [a, b] = await twoSocks(shop);
    await shop.addToCart(customerId, a.id, a.price);
    await shop.addToCart(customerId, b.id, b.price);

    expect((await shop.clearCart(customerId)).status).toBe(202);

    expect((await shop.cartItems(customerId)).body).toEqual([]);
  });

  // The cart trusts everything the client sends. Money is involved, so these matter.
  test.describe('known defects: the cart accepts what the catalogue contradicts', () => {
    test('a price that differs from the catalogue price is rejected', async ({ shop }) => {
      test.fail(true, 'SS-6: POST /carts/{id}/items takes unitPrice from the client (price tampering)');
      const { customerId } = await shop.newCustomer();
      const [sock] = await twoSocks(shop);

      const res = await shop.addToCart(customerId, sock.id, 0.01);

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('a negative price is rejected', async ({ shop }) => {
      test.fail(true, 'SS-7: POST /carts/{id}/items accepts unitPrice -50');
      const { customerId } = await shop.newCustomer();
      const [sock] = await twoSocks(shop);

      const res = await shop.addToCart(customerId, sock.id, -50);

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('a sock that is not in the catalogue is rejected', async ({ shop }) => {
      test.fail(true, 'SS-8: POST /carts/{id}/items accepts itemId "does-not-exist"');
      const { customerId } = await shop.newCustomer();

      const res = await shop.addToCart(customerId, 'does-not-exist', 5);

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
