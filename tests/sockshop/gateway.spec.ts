import { test, expect, expectSchema, sockListSchema, tagsSchema, idSchema, normaliseSocks } from '../../src';
import { env } from '../../config/env';

/** The edge router + front-end is what a browser talks to; it forwards to the same microservices. */
test.describe('Gateway (edge router → front-end)', () => {
  const uniqueName = () => `qa_gw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  test('serves the shop front page', async ({ shop }) => {
    const res = await shop.api.get(`${env.sockShop.gateway}/`);

    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/html');
  });

  test('the catalogue through the gateway equals the catalogue from the service', async ({ shop }) => {
    const direct = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body);
    const viaGateway = expectSchema(
      sockListSchema,
      (await shop.api.get(`${env.sockShop.gateway}/catalogue`, { size: 1000 })).json,
    );

    expect(normaliseSocks(viaGateway)).toEqual(normaliseSocks(direct));
  });

  test('tags through the gateway equal tags from the service', async ({ shop }) => {
    const direct = expectSchema(tagsSchema, (await shop.tags()).body);
    const viaGateway = expectSchema(tagsSchema, (await shop.api.get(`${env.sockShop.gateway}/tags`)).json);

    expect([...viaGateway.tags].sort()).toEqual([...direct.tags].sort());
  });

  test('registering through the gateway creates a customer and starts a session', async ({ shop }) => {
    const username = uniqueName();

    const res = await shop.api.post(`${env.sockShop.gateway}/register`, {
      body: { username, password: 'secret123', email: `${username}@example.com` },
    });

    expect(res.status).toBe(200);
    expectSchema(idSchema, res.body);
    const cookies = res.response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
    expect(cookies.some((c) => c.value.startsWith('logged_in='))).toBe(true);
    // the session cookie must not be readable by scripts
    expect(cookies.find((c) => c.value.startsWith('md.sid='))?.value).toContain('HttpOnly');
  });

  test('a customer created through the gateway exists in the user service', async ({ shop }) => {
    const username = uniqueName();
    await shop.api.post(`${env.sockShop.gateway}/register`, {
      body: { username, password: 'secret123', email: `${username}@example.com` },
    });

    const login = await shop.login(username, 'secret123');

    expect(login.status).toBe(200);
  });

  test.describe('known defects', () => {
    test('JSON proxied from a service keeps its application/json content type', async ({ shop }) => {
      test.fail(true, 'SS-11: the gateway answers JSON with Content-Type text/plain');
      const res = await shop.api.get(`${env.sockShop.gateway}/tags`);

      expect(res.contentType).toContain('application/json');
    });

    test('orders of a visitor without a session are answered with 401', async ({ shop }) => {
      test.fail(true, 'SS-12: GET /orders without a session → 500');
      const res = await shop.api.get(`${env.sockShop.gateway}/orders`);

      expect(res.status).toBe(401);
    });
  });
});
