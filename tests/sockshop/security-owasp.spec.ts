import { test, expect, expectSchema, cardListSchema, addressListSchema, sockListSchema } from '../../src';

/**
 * Checks mapped to the OWASP API Security Top 10 (2023 edition): https://owasp.org/API-Security/
 * Each test states the control that should exist. A gap found in the running stack is marked
 * `test.fail()` with an `SS-n` id, exactly like the other known defects in this suite, so the test
 * turns red once the service is fixed. Read-only: no destructive actuator endpoint (`/restart`,
 * `/dump`, `/heapdump`, …) is ever called, only `/actuator` (its link list) and `/env`.
 */
test.describe('OWASP API Security Top 10', () => {
  test.describe('API1:2023 Broken Object Level Authorization', () => {
    test('a card is readable by id alone, without ever authenticating as its owner', async ({ shop }) => {
      test.fail(true, "SS-13: GET /customers/{id}/cards needs no session for that customer's account");
      const victim = await shop.newCustomer();

      // A fresh client with no cookie or token for `victim` — only their (sequential, guessable) id.
      const res = await shop.cards(victim.customerId);

      expect(res.status).toBe(401);
    });

    test('an address is readable by id alone, without ever authenticating as its owner', async ({ shop }) => {
      test.fail(true, 'SS-13: GET /customers/{id}/addresses needs no session for that customer’s account');
      const victim = await shop.newCustomer();

      const res = await shop.addresses(victim.customerId);

      expect(res.status).toBe(401);
    });

    test('customer ids are sequential, which turns the BOLA above into a full scrape', async ({ shop }) => {
      const a = await shop.newCustomer();
      const b = await shop.newCustomer();

      // MongoDB ObjectIds encode a creation timestamp in their first 4 bytes, in seconds: two ids
      // created moments apart are close together, so an id for one customer predicts the
      // neighbourhood of every other one created around the same time.
      const createdAt = (id: string) => parseInt(id.slice(0, 8), 16);
      expect(Math.abs(createdAt(b.customerId) - createdAt(a.customerId))).toBeLessThan(60);
    });
  });

  test.describe('API2:2023 Broken Authentication', () => {
    test('repeated failed logins for the same account are not rate-limited or locked out', async ({
      shop,
    }) => {
      test.fail(true, 'SS-14: no lockout/backoff after repeated wrong passwords on GET /login');
      const { username } = await shop.newCustomer();

      const attempts = await Promise.all(
        Array.from({ length: 5 }, () => shop.login(username, 'wrong-password')),
      );

      // A protected login answers at least one of five rapid, wrong attempts with 429 (or blocks the account).
      expect(attempts.map((r) => r.status)).toContain(429);
    });
  });

  test.describe('API4:2023 Unrestricted Resource Consumption', () => {
    test('the catalogue page size has an upper bound', async ({ shop }) => {
      test.fail(true, 'SS-15: GET /catalogue?size=100000 is served in full, with no maximum page size');
      const unbounded = expectSchema(sockListSchema, (await shop.catalogue({ size: 100_000 })).body);
      const real = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body).length;

      expect(unbounded.length).toBeLessThan(real);
    });
  });

  test.describe('API8:2023 Security Misconfiguration / API9:2023 Improper Inventory Management', () => {
    for (const service of ['carts', 'orders', 'shipping'] as const) {
      test(`${service}: the Spring Boot actuator is not reachable without authentication`, async ({
        shop,
      }) => {
        test.fail(true, `SS-16: ${service} exposes /actuator (and /env) with no authentication`);

        const res = await shop.actuator(service, 'actuator');

        expect(res.status).toBe(401);
      });
    }

    test('carts: /env does not disclose container and JVM internals', async ({ shop }) => {
      test.fail(true, 'SS-16: carts GET /env returns systemProperties and systemEnvironment unauthenticated');
      const res = await shop.actuator('carts', 'env');

      expect(res.status).toBe(401);
    });
  });

  // Not automated here: the orders service builds internal requests from client-supplied `customer`,
  // `address` and `card` URLs (see SockShopClient.placeOrder). Whether a crafted URL can reach a host
  // other than `user`/`carts` (API7:2023 SSRF) needs a manual, carefully scoped check against this
  // local stack rather than a repeatable test, and is left as a recommendation in the test report.

  test.describe('sanity (no finding)', () => {
    test('a customer does see their own card and address', async ({ shop }) => {
      const me = await shop.newCustomer();

      const cards = expectSchema(cardListSchema, (await shop.cards(me.customerId)).body);
      const addresses = expectSchema(addressListSchema, (await shop.addresses(me.customerId)).body);

      expect(cards._embedded.card.map((c) => c.id)).toContain(me.cardId);
      expect(addresses._embedded.address.map((a) => a.id)).toContain(me.addressId);
    });
  });
});
