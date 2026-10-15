import {
  test,
  expect,
  expectSchema,
  sockSchema,
  sockListSchema,
  catalogueSizeSchema,
  tagsSchema,
  healthSchema,
  normaliseSocks,
} from '../../src';

test.describe('Catalogue service /catalogue, /tags', () => {
  test('health endpoint reports the service and its database as OK', async ({ shop }) => {
    const res = await shop.health('catalogue');

    expect(res.status).toBe(200);
    const services = expectSchema(healthSchema, res.body).health.map((h) => h.service);
    expect(services).toEqual(expect.arrayContaining(['catalogue', 'catalogue-db']));
  });

  test('every sock matches the contract and has a unique id', { tag: '@smoke' }, async ({ shop }) => {
    const res = await shop.catalogue();

    expect(res.status).toBe(200);
    const socks = expectSchema(sockListSchema, res.body);
    expect(socks.length).toBeGreaterThan(0);
    expect(new Set(socks.map((s) => s.id)).size).toBe(socks.length);
  });

  test('/catalogue/size equals the number of socks in the list', async ({ shop }) => {
    const size = expectSchema(catalogueSizeSchema, (await shop.catalogueSize()).body).size;
    const socks = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body);

    expect(socks).toHaveLength(size);
  });

  for (const size of [1, 3, 5]) {
    test(`size=${size} limits the page`, async ({ shop }) => {
      const socks = expectSchema(sockListSchema, (await shop.catalogue({ size })).body);

      expect(socks).toHaveLength(size);
    });
  }

  test('page 1 and page 2 do not overlap', async ({ shop }) => {
    const first = expectSchema(sockListSchema, (await shop.catalogue({ size: 3, page: 1 })).body);
    const second = expectSchema(sockListSchema, (await shop.catalogue({ size: 3, page: 2 })).body);

    const firstIds = new Set(first.map((s) => s.id));
    expect(second.length).toBeGreaterThan(0);
    expect(second.filter((s) => firstIds.has(s.id))).toEqual([]);
  });

  test('a sock requested by id equals its entry in the list', async ({ shop }) => {
    const [first] = expectSchema(sockListSchema, (await shop.catalogue({ size: 1 })).body);

    const res = await shop.sock(first.id);

    expect(res.status).toBe(200);
    expect(normaliseSocks([expectSchema(sockSchema, res.body)])).toEqual(normaliseSocks([first]));
  });

  test('every advertised tag filters the list to socks that carry it', async ({ shop }) => {
    const { tags } = expectSchema(tagsSchema, (await shop.tags()).body);

    for (const tag of tags.slice(0, 4)) {
      const socks = expectSchema(sockListSchema, (await shop.catalogue({ tags: tag, size: 1000 })).body);
      expect(socks.length, `tag ${tag}`).toBeGreaterThan(0);
      expect(
        socks.every((s) => s.tag.includes(tag)),
        `all results carry tag ${tag}`,
      ).toBe(true);
    }
  });

  test.describe('known defects', () => {
    test('every sock id is a valid UUID', async ({ shop }) => {
      test.fail(
        true,
        'SS-10: the seed data contains the id "zzz4f044-b040-410d-8ead-4de0446aec7e" ("z" is not hex)',
      );
      const socks = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body);

      const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
      expect(socks.filter((s) => !uuid.test(s.id)).map((s) => s.id)).toEqual([]);
    });

    test('an unknown sock id is answered with 404', async ({ shop }) => {
      test.fail(true, 'SS-5: GET /catalogue/{unknown id} → 500 "Do: not found"');
      const res = await shop.sock('00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
    });
  });
});
