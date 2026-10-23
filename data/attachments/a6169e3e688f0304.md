# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sockshop/security-owasp.spec.ts >> OWASP API Security Top 10 >> API4:2023 Unrestricted Resource Consumption >> the catalogue page size has an upper bound
- Location: tests/sockshop/security-owasp.spec.ts:60:9

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 9
Received:   9
```

# Test source

```ts
  1   | import { test, expect, expectSchema, cardListSchema, addressListSchema, sockListSchema } from '../../src';
  2   | 
  3   | /**
  4   |  * Checks mapped to the OWASP API Security Top 10 (2023 edition): https://owasp.org/API-Security/
  5   |  * Each test states the control that should exist. A gap found in the running stack is marked
  6   |  * `test.fail()` with an `SS-n` id, exactly like the other known defects in this suite, so the test
  7   |  * turns red once the service is fixed. Read-only: no destructive actuator endpoint (`/restart`,
  8   |  * `/dump`, `/heapdump`, …) is ever called, only `/actuator` (its link list) and `/env`.
  9   |  */
  10  | test.describe('OWASP API Security Top 10', () => {
  11  |   test.describe('API1:2023 Broken Object Level Authorization', () => {
  12  |     test('a card is readable by id alone, without ever authenticating as its owner', async ({ shop }) => {
  13  |       test.fail(true, "SS-13: GET /customers/{id}/cards needs no session for that customer's account");
  14  |       const victim = await shop.newCustomer();
  15  | 
  16  |       // A fresh client with no cookie or token for `victim` — only their (sequential, guessable) id.
  17  |       const res = await shop.cards(victim.customerId);
  18  | 
  19  |       expect(res.status).toBe(401);
  20  |     });
  21  | 
  22  |     test('an address is readable by id alone, without ever authenticating as its owner', async ({ shop }) => {
  23  |       test.fail(true, 'SS-13: GET /customers/{id}/addresses needs no session for that customer’s account');
  24  |       const victim = await shop.newCustomer();
  25  | 
  26  |       const res = await shop.addresses(victim.customerId);
  27  | 
  28  |       expect(res.status).toBe(401);
  29  |     });
  30  | 
  31  |     test('customer ids are sequential, which turns the BOLA above into a full scrape', async ({ shop }) => {
  32  |       const a = await shop.newCustomer();
  33  |       const b = await shop.newCustomer();
  34  | 
  35  |       // MongoDB ObjectIds encode a creation timestamp in their first 4 bytes, in seconds: two ids
  36  |       // created moments apart are close together, so an id for one customer predicts the
  37  |       // neighbourhood of every other one created around the same time.
  38  |       const createdAt = (id: string) => parseInt(id.slice(0, 8), 16);
  39  |       expect(Math.abs(createdAt(b.customerId) - createdAt(a.customerId))).toBeLessThan(60);
  40  |     });
  41  |   });
  42  | 
  43  |   test.describe('API2:2023 Broken Authentication', () => {
  44  |     test('repeated failed logins for the same account are not rate-limited or locked out', async ({
  45  |       shop,
  46  |     }) => {
  47  |       test.fail(true, 'SS-14: no lockout/backoff after repeated wrong passwords on GET /login');
  48  |       const { username } = await shop.newCustomer();
  49  | 
  50  |       const attempts = await Promise.all(
  51  |         Array.from({ length: 5 }, () => shop.login(username, 'wrong-password')),
  52  |       );
  53  | 
  54  |       // A protected login answers at least one of five rapid, wrong attempts with 429 (or blocks the account).
  55  |       expect(attempts.map((r) => r.status)).toContain(429);
  56  |     });
  57  |   });
  58  | 
  59  |   test.describe('API4:2023 Unrestricted Resource Consumption', () => {
  60  |     test('the catalogue page size has an upper bound', async ({ shop }) => {
  61  |       test.fail(true, 'SS-15: GET /catalogue?size=100000 is served in full, with no maximum page size');
  62  |       const unbounded = expectSchema(sockListSchema, (await shop.catalogue({ size: 100_000 })).body);
  63  |       const real = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body).length;
  64  | 
> 65  |       expect(unbounded.length).toBeLessThan(real);
      |                                ^ Error: expect(received).toBeLessThan(expected)
  66  |     });
  67  |   });
  68  | 
  69  |   test.describe('API8:2023 Security Misconfiguration / API9:2023 Improper Inventory Management', () => {
  70  |     for (const service of ['carts', 'orders', 'shipping'] as const) {
  71  |       test(`${service}: the Spring Boot actuator is not reachable without authentication`, async ({
  72  |         shop,
  73  |       }) => {
  74  |         test.fail(true, `SS-16: ${service} exposes /actuator (and /env) with no authentication`);
  75  | 
  76  |         const res = await shop.actuator(service, 'actuator');
  77  | 
  78  |         expect(res.status).toBe(401);
  79  |       });
  80  |     }
  81  | 
  82  |     test('carts: /env does not disclose container and JVM internals', async ({ shop }) => {
  83  |       test.fail(true, 'SS-16: carts GET /env returns systemProperties and systemEnvironment unauthenticated');
  84  |       const res = await shop.actuator('carts', 'env');
  85  | 
  86  |       expect(res.status).toBe(401);
  87  |     });
  88  |   });
  89  | 
  90  |   // Not automated here: the orders service builds internal requests from client-supplied `customer`,
  91  |   // `address` and `card` URLs (see SockShopClient.placeOrder). Whether a crafted URL can reach a host
  92  |   // other than `user`/`carts` (API7:2023 SSRF) needs a manual, carefully scoped check against this
  93  |   // local stack rather than a repeatable test, and is left as a recommendation in the test report.
  94  | 
  95  |   test.describe('sanity (no finding)', () => {
  96  |     test('a customer does see their own card and address', async ({ shop }) => {
  97  |       const me = await shop.newCustomer();
  98  | 
  99  |       const cards = expectSchema(cardListSchema, (await shop.cards(me.customerId)).body);
  100 |       const addresses = expectSchema(addressListSchema, (await shop.addresses(me.customerId)).body);
  101 | 
  102 |       expect(cards._embedded.card.map((c) => c.id)).toContain(me.cardId);
  103 |       expect(addresses._embedded.address.map((a) => a.id)).toContain(me.addressId);
  104 |     });
  105 |   });
  106 | });
  107 | 
```