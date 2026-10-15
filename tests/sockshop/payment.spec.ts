import {
  test,
  expect,
  expectSchema,
  healthSchema,
  paymentAuthSchema,
  goErrorSchema,
  PAYMENT_LIMIT,
} from '../../src';

test.describe('Payment service /paymentAuth', () => {
  test('health endpoint reports the service as OK', { tag: '@smoke' }, async ({ shop }) => {
    const res = await shop.health('payment');

    expect(res.status).toBe(200);
    expect(expectSchema(healthSchema, res.body).health[0].service).toBe('payment');
  });

  // Business rule: every amount up to and including 100.00 is authorised, anything above is declined.
  for (const amount of [0.01, 1, 50, 99.99, PAYMENT_LIMIT]) {
    test(`amount ${amount} is authorised`, async ({ shop }) => {
      const res = await shop.authorisePayment(amount);

      expect(res.status).toBe(200);
      const body = expectSchema(paymentAuthSchema, res.body);
      expect(body.authorised).toBe(true);
      expect(body.message).toBe('Payment authorised');
    });
  }

  for (const amount of [100.01, 101, 250, 10_000]) {
    test(`amount ${amount} is declined, and a decline is not an HTTP error`, async ({ shop }) => {
      const res = await shop.authorisePayment(amount);

      expect(res.status).toBe(200);
      const body = expectSchema(paymentAuthSchema, res.body);
      expect(body.authorised).toBe(false);
      expect(body.message).toContain('exceeds 100.00');
    });
  }

  // Invalid input must be answered with a 4xx. The service answers 500 for every one of these
  // (SS-1). test.fail() records the defect: the suite stays green now and turns red once it is fixed.
  test.describe('known defect SS-1: invalid input is answered with 500 instead of 400', () => {
    test('amount below zero is rejected with a client error', async ({ shop }) => {
      test.fail(true, 'SS-1: POST /paymentAuth {"amount":-5} → 500 "Invalid payment amount"');
      const res = await shop.authorisePayment(-5);

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    test('amount zero is rejected with a client error', async ({ shop }) => {
      test.fail(true, 'SS-1: POST /paymentAuth {"amount":0} → 500');
      const res = await shop.authorisePayment(0);

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    test('amount of the wrong type is rejected with a client error', async ({ shop }) => {
      test.fail(true, 'SS-1: POST /paymentAuth {"amount":"abc"} → 500');
      const res = await shop.authorisePayment('abc');

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    test('missing amount is rejected with a client error', async ({ shop }) => {
      test.fail(true, 'SS-1: POST /paymentAuth {} → 500');
      const res = await shop.authorisePaymentRaw('{}');

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    test('malformed JSON is rejected with a client error', async ({ shop }) => {
      test.fail(true, 'SS-1: POST /paymentAuth {bad → 500');
      const res = await shop.authorisePaymentRaw('{bad');

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    test('the error body at least has a stable shape and a readable reason', async ({ shop }) => {
      const res = await shop.authorisePayment(-5);

      expect(expectSchema(goErrorSchema, res.json).error).toContain('Invalid payment amount');
    });
  });
});
