# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sockshop/payment.spec.ts >> Payment service /paymentAuth >> known defect SS-1: invalid input is answered with 500 instead of 400 >> missing amount is rejected with a client error
- Location: tests/sockshop/payment.spec.ts:69:9

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 500
Received:   500
```

# Test source

```ts
  1  | import {
  2  |   test,
  3  |   expect,
  4  |   expectSchema,
  5  |   healthSchema,
  6  |   paymentAuthSchema,
  7  |   goErrorSchema,
  8  |   PAYMENT_LIMIT,
  9  | } from '../../src';
  10 | 
  11 | test.describe('Payment service /paymentAuth', () => {
  12 |   test('health endpoint reports the service as OK', { tag: '@smoke' }, async ({ shop }) => {
  13 |     const res = await shop.health('payment');
  14 | 
  15 |     expect(res.status).toBe(200);
  16 |     expect(expectSchema(healthSchema, res.body).health[0].service).toBe('payment');
  17 |   });
  18 | 
  19 |   // Business rule: every amount up to and including 100.00 is authorised, anything above is declined.
  20 |   for (const amount of [0.01, 1, 50, 99.99, PAYMENT_LIMIT]) {
  21 |     test(`amount ${amount} is authorised`, async ({ shop }) => {
  22 |       const res = await shop.authorisePayment(amount);
  23 | 
  24 |       expect(res.status).toBe(200);
  25 |       const body = expectSchema(paymentAuthSchema, res.body);
  26 |       expect(body.authorised).toBe(true);
  27 |       expect(body.message).toBe('Payment authorised');
  28 |     });
  29 |   }
  30 | 
  31 |   for (const amount of [100.01, 101, 250, 10_000]) {
  32 |     test(`amount ${amount} is declined, and a decline is not an HTTP error`, async ({ shop }) => {
  33 |       const res = await shop.authorisePayment(amount);
  34 | 
  35 |       expect(res.status).toBe(200);
  36 |       const body = expectSchema(paymentAuthSchema, res.body);
  37 |       expect(body.authorised).toBe(false);
  38 |       expect(body.message).toContain('exceeds 100.00');
  39 |     });
  40 |   }
  41 | 
  42 |   // Invalid input must be answered with a 4xx. The service answers 500 for every one of these
  43 |   // (SS-1). test.fail() records the defect: the suite stays green now and turns red once it is fixed.
  44 |   test.describe('known defect SS-1: invalid input is answered with 500 instead of 400', () => {
  45 |     test('amount below zero is rejected with a client error', async ({ shop }) => {
  46 |       test.fail(true, 'SS-1: POST /paymentAuth {"amount":-5} → 500 "Invalid payment amount"');
  47 |       const res = await shop.authorisePayment(-5);
  48 | 
  49 |       expect(res.status).toBeGreaterThanOrEqual(400);
  50 |       expect(res.status).toBeLessThan(500);
  51 |     });
  52 | 
  53 |     test('amount zero is rejected with a client error', async ({ shop }) => {
  54 |       test.fail(true, 'SS-1: POST /paymentAuth {"amount":0} → 500');
  55 |       const res = await shop.authorisePayment(0);
  56 | 
  57 |       expect(res.status).toBeGreaterThanOrEqual(400);
  58 |       expect(res.status).toBeLessThan(500);
  59 |     });
  60 | 
  61 |     test('amount of the wrong type is rejected with a client error', async ({ shop }) => {
  62 |       test.fail(true, 'SS-1: POST /paymentAuth {"amount":"abc"} → 500');
  63 |       const res = await shop.authorisePayment('abc');
  64 | 
  65 |       expect(res.status).toBeGreaterThanOrEqual(400);
  66 |       expect(res.status).toBeLessThan(500);
  67 |     });
  68 | 
  69 |     test('missing amount is rejected with a client error', async ({ shop }) => {
  70 |       test.fail(true, 'SS-1: POST /paymentAuth {} → 500');
  71 |       const res = await shop.authorisePaymentRaw('{}');
  72 | 
  73 |       expect(res.status).toBeGreaterThanOrEqual(400);
> 74 |       expect(res.status).toBeLessThan(500);
     |                          ^ Error: expect(received).toBeLessThan(expected)
  75 |     });
  76 | 
  77 |     test('malformed JSON is rejected with a client error', async ({ shop }) => {
  78 |       test.fail(true, 'SS-1: POST /paymentAuth {bad → 500');
  79 |       const res = await shop.authorisePaymentRaw('{bad');
  80 | 
  81 |       expect(res.status).toBeGreaterThanOrEqual(400);
  82 |       expect(res.status).toBeLessThan(500);
  83 |     });
  84 | 
  85 |     test('the error body at least has a stable shape and a readable reason', async ({ shop }) => {
  86 |       const res = await shop.authorisePayment(-5);
  87 | 
  88 |       expect(expectSchema(goErrorSchema, res.json).error).toContain('Invalid payment amount');
  89 |     });
  90 |   });
  91 | });
  92 | 
```