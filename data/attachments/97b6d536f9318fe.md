# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sockshop/cart.spec.ts >> Cart service /carts/{customerId}/items >> known defects: the cart accepts what the catalogue contradicts >> a sock that is not in the catalogue is rejected
- Location: tests/sockshop/cart.spec.ts:115:9

# Error details

```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 400
Received:    201
```

# Test source

```ts
  21  |       unitPrice: sock.price,
  22  |     });
  23  |     const items = expectSchema(cartItemsSchema, (await shop.cartItems(customerId)).body);
  24  |     expect(items).toHaveLength(1);
  25  |   });
  26  | 
  27  |   test('adding the same sock twice raises the quantity instead of adding a second line', async ({ shop }) => {
  28  |     const { customerId } = await shop.newCustomer();
  29  |     const [sock] = await twoSocks(shop);
  30  | 
  31  |     await shop.addToCart(customerId, sock.id, sock.price);
  32  |     await shop.addToCart(customerId, sock.id, sock.price);
  33  | 
  34  |     const items = expectSchema(cartItemsSchema, (await shop.cartItems(customerId)).body);
  35  |     expect(items).toHaveLength(1);
  36  |     expect(items[0].quantity).toBe(2);
  37  |   });
  38  | 
  39  |   test('two different socks make two cart lines', async ({ shop }) => {
  40  |     const { customerId } = await shop.newCustomer();
  41  |     const [a, b] = await twoSocks(shop);
  42  | 
  43  |     await shop.addToCart(customerId, a.id, a.price);
  44  |     await shop.addToCart(customerId, b.id, b.price);
  45  | 
  46  |     const items = expectSchema(cartItemsSchema, (await shop.cartItems(customerId)).body);
  47  |     expect(items.map((i) => i.itemId).sort()).toEqual([a.id, b.id].sort());
  48  |   });
  49  | 
  50  |   test('carts of different customers do not mix', async ({ shop }) => {
  51  |     const first = await shop.newCustomer();
  52  |     const second = await shop.newCustomer();
  53  |     const [sock] = await twoSocks(shop);
  54  | 
  55  |     await shop.addToCart(first.customerId, sock.id, sock.price);
  56  | 
  57  |     expect(expectSchema(cartItemsSchema, (await shop.cartItems(second.customerId)).body)).toEqual([]);
  58  |   });
  59  | 
  60  |   test('a customer who never shopped has an empty cart, not an error', async ({ shop }) => {
  61  |     const { customerId } = await shop.newCustomer();
  62  | 
  63  |     const res = await shop.cartItems(customerId);
  64  | 
  65  |     expect(res.status).toBe(200);
  66  |     expect(res.body).toEqual([]);
  67  |   });
  68  | 
  69  |   test('a sock is removed by its catalogue id (not by the id of the cart line)', async ({ shop }) => {
  70  |     const { customerId } = await shop.newCustomer();
  71  |     const [a, b] = await twoSocks(shop);
  72  |     await shop.addToCart(customerId, a.id, a.price);
  73  |     await shop.addToCart(customerId, b.id, b.price);
  74  | 
  75  |     const res = await shop.removeFromCart(customerId, a.id);
  76  | 
  77  |     expect(res.status).toBe(202);
  78  |     const items = expectSchema(cartItemsSchema, (await shop.cartItems(customerId)).body);
  79  |     expect(items.map((i) => i.itemId)).toEqual([b.id]);
  80  |   });
  81  | 
  82  |   test('clearing the cart removes every line', async ({ shop }) => {
  83  |     const { customerId } = await shop.newCustomer();
  84  |     const [a, b] = await twoSocks(shop);
  85  |     await shop.addToCart(customerId, a.id, a.price);
  86  |     await shop.addToCart(customerId, b.id, b.price);
  87  | 
  88  |     expect((await shop.clearCart(customerId)).status).toBe(202);
  89  | 
  90  |     expect((await shop.cartItems(customerId)).body).toEqual([]);
  91  |   });
  92  | 
  93  |   // The cart trusts everything the client sends. Money is involved, so these matter.
  94  |   test.describe('known defects: the cart accepts what the catalogue contradicts', () => {
  95  |     test('a price that differs from the catalogue price is rejected', async ({ shop }) => {
  96  |       test.fail(true, 'SS-6: POST /carts/{id}/items takes unitPrice from the client (price tampering)');
  97  |       const { customerId } = await shop.newCustomer();
  98  |       const [sock] = await twoSocks(shop);
  99  | 
  100 |       const res = await shop.addToCart(customerId, sock.id, 0.01);
  101 | 
  102 |       expect(res.status).toBeGreaterThanOrEqual(400);
  103 |     });
  104 | 
  105 |     test('a negative price is rejected', async ({ shop }) => {
  106 |       test.fail(true, 'SS-7: POST /carts/{id}/items accepts unitPrice -50');
  107 |       const { customerId } = await shop.newCustomer();
  108 |       const [sock] = await twoSocks(shop);
  109 | 
  110 |       const res = await shop.addToCart(customerId, sock.id, -50);
  111 | 
  112 |       expect(res.status).toBeGreaterThanOrEqual(400);
  113 |     });
  114 | 
  115 |     test('a sock that is not in the catalogue is rejected', async ({ shop }) => {
  116 |       test.fail(true, 'SS-8: POST /carts/{id}/items accepts itemId "does-not-exist"');
  117 |       const { customerId } = await shop.newCustomer();
  118 | 
  119 |       const res = await shop.addToCart(customerId, 'does-not-exist', 5);
  120 | 
> 121 |       expect(res.status).toBeGreaterThanOrEqual(400);
      |                          ^ Error: expect(received).toBeGreaterThanOrEqual(expected)
  122 |     });
  123 |   });
  124 | });
  125 | 
```