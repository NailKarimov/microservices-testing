import {
  test,
  expect,
  expectSchema,
  idSchema,
  loginSchema,
  addressListSchema,
  cardListSchema,
  goErrorSchema,
} from '../../src';

const uniqueName = () => `qa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

test.describe('User service /register, /login, addresses, cards', () => {
  test('register creates a customer who can then log in', { tag: '@smoke' }, async ({ shop }) => {
    const username = uniqueName();

    const reg = await shop.register(username, 'secret123');
    expect(reg.status).toBe(200);
    const { id } = expectSchema(idSchema, reg.body);

    const login = await shop.login(username, 'secret123');
    expect(login.status).toBe(200);
    const { user } = expectSchema(loginSchema, login.body);
    expect(user).toMatchObject({ id, username });
  });

  test('an address is stored and listed for its customer', async ({ shop }) => {
    const { customerId, addressId } = await shop.newCustomer();

    const res = await shop.addresses(customerId);

    expect(res.status).toBe(200);
    const list = expectSchema(addressListSchema, res.body)._embedded.address;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: addressId, city: 'Riga', country: 'Latvia', postcode: 'LV-1010' });
  });

  test('a card is stored and listed for its customer', async ({ shop }) => {
    const { customerId, cardId } = await shop.newCustomer();

    const res = await shop.cards(customerId);

    expect(res.status).toBe(200);
    const list = expectSchema(cardListSchema, res.body)._embedded.card;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(cardId);
  });

  test("a customer's addresses are not visible to another customer", async ({ shop }) => {
    const first = await shop.newCustomer();
    const second = await shop.newCustomer();

    const res = await shop.addresses(second.customerId);

    const ids = expectSchema(addressListSchema, res.body)._embedded.address.map((a) => a.id);
    expect(ids).toEqual([second.addressId]);
    expect(ids).not.toContain(first.addressId);
  });

  test('the registered password is not returned by the login response', async ({ shop }) => {
    const username = uniqueName();
    await shop.register(username, 'secret123');

    const res = await shop.login(username, 'secret123');

    expect(res.text).not.toContain('secret123');
    expect(res.text).not.toMatch(/"password"/i);
  });

  // The user service is the only one that holds card data, so these are the checks that matter
  // most for a payment system. test.fail() records each defect until the service is fixed.
  test.describe('known defects', () => {
    test('wrong password is answered with 401', async ({ shop }) => {
      test.fail(true, 'SS-2: GET /login with a wrong password → 500 "Unauthorized"');
      const username = uniqueName();
      await shop.register(username, 'secret123');

      const res = await shop.login(username, 'wrong-password');

      expect(res.status).toBe(401);
    });

    test('unknown user is answered with 401', async ({ shop }) => {
      test.fail(true, 'SS-2: GET /login for an unknown user → 500 "Unauthorized"');
      const res = await shop.login(uniqueName(), 'secret123');

      expect(res.status).toBe(401);
    });

    test('registering an existing username is answered with 409', async ({ shop }) => {
      test.fail(true, 'SS-3: duplicate username → 500 with the raw MongoDB error E11000');
      const username = uniqueName();
      await shop.register(username, 'secret123');

      const res = await shop.register(username, 'secret123');

      expect(res.status).toBe(409);
    });

    test('a duplicate registration does not leak database internals', async ({ shop }) => {
      test.fail(
        true,
        'SS-3: the error message contains "E11000 duplicate key error collection: users.customers"',
      );
      const username = uniqueName();
      await shop.register(username, 'secret123');

      const res = await shop.register(username, 'secret123');

      expect(expectSchema(goErrorSchema, res.body).error).not.toMatch(/E11000|collection|index/i);
    });

    test('card listing does not return the full card number', async ({ shop }) => {
      test.fail(true, 'SS-4: GET /customers/{id}/cards returns the full PAN in clear text (PCI DSS 3.4)');
      const { customerId } = await shop.newCustomer();

      const card = expectSchema(cardListSchema, (await shop.cards(customerId)).body)._embedded.card[0];

      expect(card.longNum).not.toBe('4111111111111111');
      expect(card.longNum).toMatch(/^\D*\d{0,4}$/);
    });

    test('card listing does not return the CCV', async ({ shop }) => {
      test.fail(true, 'SS-4: GET /customers/{id}/cards returns the CCV (PCI DSS 3.2: never store it)');
      const { customerId } = await shop.newCustomer();

      const res = await shop.cards(customerId);

      expect(res.text).not.toContain('"ccv":"123"');
    });
  });
});
