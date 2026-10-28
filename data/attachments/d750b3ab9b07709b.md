# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: security/headers.spec.ts >> Security headers: Sock Shop gateway >> X-Powered-By does not reveal the framework
- Location: tests/security/headers.spec.ts:82:9

# Error details

```
Error: expect(received).toBeUndefined()

Received: "Express"
```

# Test source

```ts
  1   | import { test, expect, env } from '../../src';
  2   | import { ApiClient, type ApiResult } from '../../src/api/ApiClient';
  3   | 
  4   | /** One system under test: an absolute URL of a cheap, valid GET endpoint. */
  5   | type Target = {
  6   |   name: string;
  7   |   url: string;
  8   |   /** Appended as `appid` to every request. */
  9   |   apiKey?: string;
  10  |   /** Collection endpoint used for the OPTIONS check (defaults to `url`). */
  11  |   optionsUrl?: string;
  12  |   /** A request the server must reject, used to inspect its error body. */
  13  |   errorUrl: string;
  14  |   needsStack?: boolean;
  15  |   /** Known deviations: check id → defect id. The test is expected to fail until the server is fixed. */
  16  |   defects: Record<string, string>;
  17  | };
  18  | 
  19  | const TARGETS: Target[] = [
  20  |   {
  21  |     // The gateway is plain HTTP inside the Docker network, so transport checks do not apply to it.
  22  |     name: 'Sock Shop gateway',
  23  |     url: `${env.sockShop.gateway}/catalogue?size=1`,
  24  |     errorUrl: `${env.sockShop.gateway}/customers/x%27%22%3C%3E`,
  25  |     needsStack: true,
  26  |     defects: {
  27  |       nosniff: 'SEC-9: no X-Content-Type-Options header',
  28  |       'powered-by': 'SEC-10: X-Powered-By: Express reveals the framework',
  29  |     },
  30  |   },
  31  | ];
  32  | 
  33  | const EVIL_ORIGIN = 'https://evil.example';
  34  | const STACK_TRACE =
  35  |   /\bat [\w$.]+\([\w$.]+\.(java|js|ts):\d+|java\.lang\.|Traceback \(most recent|node_modules|\.java:\d+/;
  36  | 
  37  | for (const target of TARGETS) {
  38  |   test.describe(`Security headers: ${target.name}`, { tag: '@security' }, () => {
  39  |     const isHttps = target.url.startsWith('https://');
  40  | 
  41  |     let client: ApiClient;
  42  | 
  43  |     test.beforeEach(async ({ request }) => {
  44  |       if (target.needsStack) {
  45  |         const up = await fetch(`${env.sockShop.payment}/health`, { signal: AbortSignal.timeout(3_000) })
  46  |           .then((r) => r.ok)
  47  |           .catch(() => false);
  48  |         if (!up && env.requireStack) throw new Error('Sock Shop is not running');
  49  |         test.skip(!up, 'Sock Shop is not running: start it with `npm run stack:up`.');
  50  |       }
  51  |       client = new ApiClient(request, target.apiKey);
  52  |     });
  53  | 
  54  |     /** Marks the test as a known defect when the target lists one for this check. */
  55  |     function knownDefect(check: string): void {
  56  |       const defect = target.defects[check];
  57  |       if (defect) test.fail(true, defect);
  58  |     }
  59  | 
  60  |     const get = (headers: Record<string, string> = {}): Promise<ApiResult> =>
  61  |       client.send('GET', target.url, { headers });
  62  | 
  63  |     test('sanity: the endpoint answers 200', async () => {
  64  |       expect((await get()).status).toBe(200);
  65  |     });
  66  | 
  67  |     test('Strict-Transport-Security is set with a max-age of at least 180 days', async () => {
  68  |       test.skip(!isHttps, 'HSTS only applies to HTTPS');
  69  |       knownDefect('hsts');
  70  |       const hsts = (await get()).response.headers()['strict-transport-security'];
  71  | 
  72  |       expect(hsts, 'Strict-Transport-Security header').toBeDefined();
  73  |       expect(Number(/max-age=(\d+)/.exec(hsts ?? '')?.[1])).toBeGreaterThanOrEqual(15_552_000);
  74  |     });
  75  | 
  76  |     test('X-Content-Type-Options is "nosniff"', async () => {
  77  |       knownDefect('nosniff');
  78  | 
  79  |       expect((await get()).response.headers()['x-content-type-options']).toBe('nosniff');
  80  |     });
  81  | 
  82  |     test('X-Powered-By does not reveal the framework', async () => {
  83  |       knownDefect('powered-by');
  84  | 
> 85  |       expect((await get()).response.headers()['x-powered-by']).toBeUndefined();
      |                                                                ^ Error: expect(received).toBeUndefined()
  86  |     });
  87  | 
  88  |     test('Server header does not reveal a version', async () => {
  89  |       knownDefect('server-version');
  90  |       const server = (await get()).response.headers()['server'] ?? '';
  91  | 
  92  |       expect(server).not.toMatch(/\d+\.\d+/);
  93  |     });
  94  | 
  95  |     test('CORS does not reflect an arbitrary origin or combine "*" with credentials', async () => {
  96  |       knownDefect('cors');
  97  |       const h = (await get({ Origin: EVIL_ORIGIN })).response.headers();
  98  |       const allowOrigin = h['access-control-allow-origin'];
  99  |       const allowCredentials = h['access-control-allow-credentials'];
  100 | 
  101 |       // Credentials may be allowed only for a specific, trusted origin: never for "*" or for any origin sent.
  102 |       expect(allowCredentials === 'true' && allowOrigin === '*', '"*" combined with credentials').toBe(false);
  103 |       expect(allowOrigin).not.toBe(EVIL_ORIGIN);
  104 |     });
  105 | 
  106 |     test('OPTIONS does not return a description of the API', async () => {
  107 |       knownDefect('options-body');
  108 |       const res = await client.send('OPTIONS', target.optionsUrl ?? target.url, {
  109 |         // No JSON preference: a server may describe itself (WADL) to clients that accept anything.
  110 |         headers: { Accept: '*/*', Origin: EVIL_ORIGIN, 'Access-Control-Request-Method': 'GET' },
  111 |       });
  112 | 
  113 |       expect(res.contentType).not.toMatch(/wadl|xml/);
  114 |       expect(res.text).not.toMatch(/<application\b|<resources\b/);
  115 |     });
  116 | 
  117 |     test('an error response does not leak internals (stack trace, class names)', async () => {
  118 |       knownDefect('stack-trace');
  119 |       const res = await client.send('GET', target.errorUrl);
  120 | 
  121 |       expect(res.text).not.toMatch(STACK_TRACE);
  122 |     });
  123 |   });
  124 | }
  125 | 
```