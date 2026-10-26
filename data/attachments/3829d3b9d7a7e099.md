# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sockshop/gateway.spec.ts >> Gateway (edge router → front-end) >> known defects >> JSON proxied from a service keeps its application/json content type
- Location: tests/sockshop/gateway.spec.ts:59:9

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "application/json"
Received string:    "text/plain; charset=utf-8"
```

# Test source

```ts
  1  | import { test, expect, expectSchema, sockListSchema, tagsSchema, idSchema, normaliseSocks } from '../../src';
  2  | import { env } from '../../config/env';
  3  | 
  4  | /** The edge router + front-end is what a browser talks to; it forwards to the same microservices. */
  5  | test.describe('Gateway (edge router → front-end)', () => {
  6  |   const uniqueName = () => `qa_gw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  7  | 
  8  |   test('serves the shop front page', async ({ shop }) => {
  9  |     const res = await shop.api.get(`${env.sockShop.gateway}/`);
  10 | 
  11 |     expect(res.status).toBe(200);
  12 |     expect(res.contentType).toContain('text/html');
  13 |   });
  14 | 
  15 |   test('the catalogue through the gateway equals the catalogue from the service', async ({ shop }) => {
  16 |     const direct = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body);
  17 |     const viaGateway = expectSchema(
  18 |       sockListSchema,
  19 |       (await shop.api.get(`${env.sockShop.gateway}/catalogue`, { size: 1000 })).json,
  20 |     );
  21 | 
  22 |     expect(normaliseSocks(viaGateway)).toEqual(normaliseSocks(direct));
  23 |   });
  24 | 
  25 |   test('tags through the gateway equal tags from the service', async ({ shop }) => {
  26 |     const direct = expectSchema(tagsSchema, (await shop.tags()).body);
  27 |     const viaGateway = expectSchema(tagsSchema, (await shop.api.get(`${env.sockShop.gateway}/tags`)).json);
  28 | 
  29 |     expect([...viaGateway.tags].sort()).toEqual([...direct.tags].sort());
  30 |   });
  31 | 
  32 |   test('registering through the gateway creates a customer and starts a session', async ({ shop }) => {
  33 |     const username = uniqueName();
  34 | 
  35 |     const res = await shop.api.post(`${env.sockShop.gateway}/register`, {
  36 |       body: { username, password: 'secret123', email: `${username}@example.com` },
  37 |     });
  38 | 
  39 |     expect(res.status).toBe(200);
  40 |     expectSchema(idSchema, res.body);
  41 |     const cookies = res.response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
  42 |     expect(cookies.some((c) => c.value.startsWith('logged_in='))).toBe(true);
  43 |     // the session cookie must not be readable by scripts
  44 |     expect(cookies.find((c) => c.value.startsWith('md.sid='))?.value).toContain('HttpOnly');
  45 |   });
  46 | 
  47 |   test('a customer created through the gateway exists in the user service', async ({ shop }) => {
  48 |     const username = uniqueName();
  49 |     await shop.api.post(`${env.sockShop.gateway}/register`, {
  50 |       body: { username, password: 'secret123', email: `${username}@example.com` },
  51 |     });
  52 | 
  53 |     const login = await shop.login(username, 'secret123');
  54 | 
  55 |     expect(login.status).toBe(200);
  56 |   });
  57 | 
  58 |   test.describe('known defects', () => {
  59 |     test('JSON proxied from a service keeps its application/json content type', async ({ shop }) => {
  60 |       test.fail(true, 'SS-11: the gateway answers JSON with Content-Type text/plain');
  61 |       const res = await shop.api.get(`${env.sockShop.gateway}/tags`);
  62 | 
> 63 |       expect(res.contentType).toContain('application/json');
     |                               ^ Error: expect(received).toContain(expected) // indexOf
  64 |     });
  65 | 
  66 |     test('orders of a visitor without a session are answered with 401', async ({ shop }) => {
  67 |       test.fail(true, 'SS-12: GET /orders without a session → 500');
  68 |       const res = await shop.api.get(`${env.sockShop.gateway}/orders`);
  69 | 
  70 |       expect(res.status).toBe(401);
  71 |     });
  72 |   });
  73 | });
  74 | 
```