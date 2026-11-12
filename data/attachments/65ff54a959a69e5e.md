# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sockshop/catalogue.spec.ts >> Catalogue service /catalogue, /tags >> known defects >> an unknown sock id is answered with 404
- Location: tests/sockshop/catalogue.spec.ts:89:9

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 404
Received: 500
```

# Test source

```ts
  1  | import {
  2  |   test,
  3  |   expect,
  4  |   expectSchema,
  5  |   sockSchema,
  6  |   sockListSchema,
  7  |   catalogueSizeSchema,
  8  |   tagsSchema,
  9  |   healthSchema,
  10 |   normaliseSocks,
  11 | } from '../../src';
  12 | 
  13 | test.describe('Catalogue service /catalogue, /tags', () => {
  14 |   test('health endpoint reports the service and its database as OK', async ({ shop }) => {
  15 |     const res = await shop.health('catalogue');
  16 | 
  17 |     expect(res.status).toBe(200);
  18 |     const services = expectSchema(healthSchema, res.body).health.map((h) => h.service);
  19 |     expect(services).toEqual(expect.arrayContaining(['catalogue', 'catalogue-db']));
  20 |   });
  21 | 
  22 |   test('every sock matches the contract and has a unique id', { tag: '@smoke' }, async ({ shop }) => {
  23 |     const res = await shop.catalogue();
  24 | 
  25 |     expect(res.status).toBe(200);
  26 |     const socks = expectSchema(sockListSchema, res.body);
  27 |     expect(socks.length).toBeGreaterThan(0);
  28 |     expect(new Set(socks.map((s) => s.id)).size).toBe(socks.length);
  29 |   });
  30 | 
  31 |   test('/catalogue/size equals the number of socks in the list', async ({ shop }) => {
  32 |     const size = expectSchema(catalogueSizeSchema, (await shop.catalogueSize()).body).size;
  33 |     const socks = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body);
  34 | 
  35 |     expect(socks).toHaveLength(size);
  36 |   });
  37 | 
  38 |   for (const size of [1, 3, 5]) {
  39 |     test(`size=${size} limits the page`, async ({ shop }) => {
  40 |       const socks = expectSchema(sockListSchema, (await shop.catalogue({ size })).body);
  41 | 
  42 |       expect(socks).toHaveLength(size);
  43 |     });
  44 |   }
  45 | 
  46 |   test('page 1 and page 2 do not overlap', async ({ shop }) => {
  47 |     const first = expectSchema(sockListSchema, (await shop.catalogue({ size: 3, page: 1 })).body);
  48 |     const second = expectSchema(sockListSchema, (await shop.catalogue({ size: 3, page: 2 })).body);
  49 | 
  50 |     const firstIds = new Set(first.map((s) => s.id));
  51 |     expect(second.length).toBeGreaterThan(0);
  52 |     expect(second.filter((s) => firstIds.has(s.id))).toEqual([]);
  53 |   });
  54 | 
  55 |   test('a sock requested by id equals its entry in the list', async ({ shop }) => {
  56 |     const [first] = expectSchema(sockListSchema, (await shop.catalogue({ size: 1 })).body);
  57 | 
  58 |     const res = await shop.sock(first.id);
  59 | 
  60 |     expect(res.status).toBe(200);
  61 |     expect(normaliseSocks([expectSchema(sockSchema, res.body)])).toEqual(normaliseSocks([first]));
  62 |   });
  63 | 
  64 |   test('every advertised tag filters the list to socks that carry it', async ({ shop }) => {
  65 |     const { tags } = expectSchema(tagsSchema, (await shop.tags()).body);
  66 | 
  67 |     for (const tag of tags.slice(0, 4)) {
  68 |       const socks = expectSchema(sockListSchema, (await shop.catalogue({ tags: tag, size: 1000 })).body);
  69 |       expect(socks.length, `tag ${tag}`).toBeGreaterThan(0);
  70 |       expect(
  71 |         socks.every((s) => s.tag.includes(tag)),
  72 |         `all results carry tag ${tag}`,
  73 |       ).toBe(true);
  74 |     }
  75 |   });
  76 | 
  77 |   test.describe('known defects', () => {
  78 |     test('every sock id is a valid UUID', async ({ shop }) => {
  79 |       test.fail(
  80 |         true,
  81 |         'SS-10: the seed data contains the id "zzz4f044-b040-410d-8ead-4de0446aec7e" ("z" is not hex)',
  82 |       );
  83 |       const socks = expectSchema(sockListSchema, (await shop.catalogue({ size: 1000 })).body);
  84 | 
  85 |       const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  86 |       expect(socks.filter((s) => !uuid.test(s.id)).map((s) => s.id)).toEqual([]);
  87 |     });
  88 | 
  89 |     test('an unknown sock id is answered with 404', async ({ shop }) => {
  90 |       test.fail(true, 'SS-5: GET /catalogue/{unknown id} → 500 "Do: not found"');
  91 |       const res = await shop.sock('00000000-0000-0000-0000-000000000000');
  92 | 
> 93 |       expect(res.status).toBe(404);
     |                          ^ Error: expect(received).toBe(expected) // Object.is equality
  94 |     });
  95 |   });
  96 | });
  97 | 
```