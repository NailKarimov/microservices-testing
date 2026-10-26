# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sockshop/orders.spec.ts >> Orders: cart → order → payment → shipping >> known defects >> the order response does not contain the full card number or CCV
- Location: tests/sockshop/orders.spec.ts:149:9

# Error details

```
Error: expect(received).not.toContain(expected) // indexOf

Expected substring: not "4111111111111111"
Received string:        "{
  \"id\" : \"6adf69b22e6bc20007f35e8d\",
  \"customerId\" : \"6adf69b2ee11cb00013ab95f\",
  \"customer\" : {
    \"id\" : null,
    \"firstName\" : \"\",
    \"lastName\" : \"\",
    \"username\" : \"qa_mvpdo80oj6v615\",
    \"addresses\" : [ ],
    \"cards\" : [ ]
  },
  \"address\" : {
    \"id\" : null,
    \"number\" : \"1\",
    \"street\" : \"Brivibas\",
    \"city\" : \"Riga\",
    \"postcode\" : \"LV-1010\",
    \"country\" : \"Latvia\"
  },
  \"card\" : {
    \"id\" : null,
    \"longNum\" : \"4111111111111111\",
    \"expires\" : \"12/30\",
    \"ccv\" : \"123\"
  },
  \"items\" : [ {
    \"id\" : \"6adf69b225d27c0006ca38f2\",
    \"itemId\" : \"a0a4f044-b040-410d-8ead-4de0446aec7e\",
    \"quantity\" : 1,
    \"unitPrice\" : 7.99
  } ],
  \"shipment\" : {
    \"id\" : \"5e26e331-a918-40af-a576-74eb9f3230ab\",
    \"name\" : \"6adf69b2ee11cb00013ab95f\"
  },
  \"date\" : \"2026-10-26T14:54:42.166+0000\",
  \"total\" : 12.98
}"
```

# Test source

```ts
  57  |     expect(stored.shipment.name).toBe(order.shipment.name);
  58  |   });
  59  | 
  60  |   test('the total adds up several lines and quantities', async ({ shop }) => {
  61  |     const checkout = await shop.newCustomer();
  62  |     const [a, b] = await cheapSocks(shop);
  63  |     await shop.addToCart(checkout.customerId, a.id, a.price);
  64  |     await shop.addToCart(checkout.customerId, a.id, a.price); // quantity 2
  65  |     await shop.addToCart(checkout.customerId, b.id, b.price);
  66  | 
  67  |     const order = expectSchema(orderSchema, (await shop.placeOrder(checkout)).body);
  68  | 
  69  |     expect(order.items).toHaveLength(2);
  70  |     expect(order.total).toBeCloseTo(cents(2 * a.price + b.price + SHIPPING_FEE), 2);
  71  |   });
  72  | 
  73  |   test('every order gets its own shipment', async ({ shop }) => {
  74  |     const first = await shop.newCustomer();
  75  |     const second = await shop.newCustomer();
  76  |     const [sock] = await cheapSocks(shop);
  77  |     await shop.addToCart(first.customerId, sock.id, sock.price);
  78  |     await shop.addToCart(second.customerId, sock.id, sock.price);
  79  | 
  80  |     const a = expectSchema(orderSchema, (await shop.placeOrder(first)).body);
  81  |     const b = expectSchema(orderSchema, (await shop.placeOrder(second)).body);
  82  | 
  83  |     expect(a.shipment.id).not.toBe(b.shipment.id);
  84  |     expect(a.id).not.toBe(b.id);
  85  |   });
  86  | 
  87  |   test('an unknown order id is answered with 404', async ({ shop }) => {
  88  |     expect((await shop.order('000000000000000000000000')).status).toBe(404);
  89  |   });
  90  | 
  91  |   // Payment limit across the service boundary: orders asks payment to authorise goods + shipping.
  92  |   // Catalogue prices cannot hit 100.00 exactly, so the boundary is built with a cart price
  93  |   // (the cart accepts any price, see SS-6). The expected amounts are in the test names.
  94  |   test.describe('payment decision is applied to the order total', () => {
  95  |     test(`total of exactly ${PAYMENT_LIMIT}.00 (95.01 + ${SHIPPING_FEE}) is authorised`, async ({ shop }) => {
  96  |       const checkout = await shop.newCustomer();
  97  |       await shop.addToCart(checkout.customerId, 'boundary-item', 95.01);
  98  | 
  99  |       const res = await shop.placeOrder(checkout);
  100 | 
  101 |       expect(res.status).toBe(201);
  102 |       expect(expectSchema(orderSchema, res.body).total).toBeCloseTo(PAYMENT_LIMIT, 2);
  103 |     });
  104 | 
  105 |     test(`total of ${PAYMENT_LIMIT}.01 (95.02 + ${SHIPPING_FEE}) is declined with 406`, async ({ shop }) => {
  106 |       const checkout = await shop.newCustomer();
  107 |       await shop.addToCart(checkout.customerId, 'boundary-item', 95.02);
  108 | 
  109 |       const res = await shop.placeOrder(checkout);
  110 | 
  111 |       expect(res.status).toBe(406);
  112 |       expect(expectSchema(springErrorSchema, res.body).message).toContain('Payment declined');
  113 |     });
  114 | 
  115 |     test('a real sock that is too expensive together with shipping is declined', async ({ shop }) => {
  116 |       const checkout = await shop.newCustomer();
  117 |       const socks = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body);
  118 |       const priciest = socks.reduce((a, b) => (b.price > a.price ? b : a));
  119 |       // precondition: the catalogue still has a sock that cannot be bought together with shipping
  120 |       expect(priciest.price + SHIPPING_FEE).toBeGreaterThan(PAYMENT_LIMIT);
  121 |       await shop.addToCart(checkout.customerId, priciest.id, priciest.price);
  122 | 
  123 |       const res = await shop.placeOrder(checkout);
  124 | 
  125 |       expect(res.status).toBe(406);
  126 |     });
  127 | 
  128 |     test('a declined order leaves nothing behind', async ({ shop }) => {
  129 |       const checkout = await shop.newCustomer();
  130 |       await shop.addToCart(checkout.customerId, 'boundary-item', 95.02);
  131 | 
  132 |       await shop.placeOrder(checkout);
  133 | 
  134 |       const stored = expectSchema(customerOrdersSchema, (await shop.ordersOf(checkout.customerId)).body);
  135 |       expect(stored._embedded.customerOrders).toEqual([]);
  136 |     });
  137 |   });
  138 | 
  139 |   test.describe('known defects', () => {
  140 |     test('an order with an empty cart is rejected', async ({ shop }) => {
  141 |       test.fail(true, 'SS-9: POST /orders with an empty cart → 201, the customer is charged only shipping');
  142 |       const checkout = await shop.newCustomer();
  143 | 
  144 |       const res = await shop.placeOrder(checkout);
  145 | 
  146 |       expect(res.status).toBeGreaterThanOrEqual(400);
  147 |     });
  148 | 
  149 |     test('the order response does not contain the full card number or CCV', async ({ shop }) => {
  150 |       test.fail(true, 'SS-4: POST /orders echoes and stores the full PAN and CCV in clear text');
  151 |       const checkout = await shop.newCustomer();
  152 |       const [sock] = await cheapSocks(shop);
  153 |       await shop.addToCart(checkout.customerId, sock.id, sock.price);
  154 | 
  155 |       const res = await shop.placeOrder(checkout);
  156 | 
> 157 |       expect(res.text).not.toContain('4111111111111111');
      |                            ^ Error: expect(received).not.toContain(expected) // indexOf
  158 |       expect(res.text).not.toMatch(/"ccv"\s*:\s*"123"/);
  159 |     });
  160 | 
  161 |     test('an order with a negative total is answered with a client error', async ({ shop }) => {
  162 |       test.fail(true, 'SS-7: a negative cart price leads to 500 "unspecified IO error" instead of 4xx');
  163 |       const checkout = await shop.newCustomer();
  164 |       await shop.addToCart(checkout.customerId, 'boundary-item', -50);
  165 | 
  166 |       const res = await shop.placeOrder(checkout);
  167 | 
  168 |       expect(res.status).toBeGreaterThanOrEqual(400);
  169 |       expect(res.status).toBeLessThan(500);
  170 |     });
  171 |   });
  172 | });
  173 | 
```