import { test, expect, env } from '../../src';
import { ApiClient, type ApiResult } from '../../src/api/ApiClient';

/** One system under test: an absolute URL of a cheap, valid GET endpoint. */
type Target = {
  name: string;
  url: string;
  /** Appended as `appid` to every request. */
  apiKey?: string;
  /** Collection endpoint used for the OPTIONS check (defaults to `url`). */
  optionsUrl?: string;
  /** A request the server must reject, used to inspect its error body. */
  errorUrl: string;
  needsStack?: boolean;
  /** Known deviations: check id → defect id. The test is expected to fail until the server is fixed. */
  defects: Record<string, string>;
};

const TARGETS: Target[] = [
  {
    // The gateway is plain HTTP inside the Docker network, so transport checks do not apply to it.
    name: 'Sock Shop gateway',
    url: `${env.sockShop.gateway}/catalogue?size=1`,
    errorUrl: `${env.sockShop.gateway}/customers/x%27%22%3C%3E`,
    needsStack: true,
    defects: {
      nosniff: 'SEC-9: no X-Content-Type-Options header',
      'powered-by': 'SEC-10: X-Powered-By: Express reveals the framework',
    },
  },
];

const EVIL_ORIGIN = 'https://evil.example';
const STACK_TRACE =
  /\bat [\w$.]+\([\w$.]+\.(java|js|ts):\d+|java\.lang\.|Traceback \(most recent|node_modules|\.java:\d+/;

for (const target of TARGETS) {
  test.describe(`Security headers: ${target.name}`, { tag: '@security' }, () => {
    const isHttps = target.url.startsWith('https://');

    let client: ApiClient;

    test.beforeEach(async ({ request }) => {
      if (target.needsStack) {
        const up = await fetch(`${env.sockShop.payment}/health`, { signal: AbortSignal.timeout(3_000) })
          .then((r) => r.ok)
          .catch(() => false);
        if (!up && env.requireStack) throw new Error('Sock Shop is not running');
        test.skip(!up, 'Sock Shop is not running: start it with `npm run stack:up`.');
      }
      client = new ApiClient(request, target.apiKey);
    });

    /** Marks the test as a known defect when the target lists one for this check. */
    function knownDefect(check: string): void {
      const defect = target.defects[check];
      if (defect) test.fail(true, defect);
    }

    const get = (headers: Record<string, string> = {}): Promise<ApiResult> =>
      client.send('GET', target.url, { headers });

    test('sanity: the endpoint answers 200', async () => {
      expect((await get()).status).toBe(200);
    });

    test('Strict-Transport-Security is set with a max-age of at least 180 days', async () => {
      test.skip(!isHttps, 'HSTS only applies to HTTPS');
      knownDefect('hsts');
      const hsts = (await get()).response.headers()['strict-transport-security'];

      expect(hsts, 'Strict-Transport-Security header').toBeDefined();
      expect(Number(/max-age=(\d+)/.exec(hsts ?? '')?.[1])).toBeGreaterThanOrEqual(15_552_000);
    });

    test('X-Content-Type-Options is "nosniff"', async () => {
      knownDefect('nosniff');

      expect((await get()).response.headers()['x-content-type-options']).toBe('nosniff');
    });

    test('X-Powered-By does not reveal the framework', async () => {
      knownDefect('powered-by');

      expect((await get()).response.headers()['x-powered-by']).toBeUndefined();
    });

    test('Server header does not reveal a version', async () => {
      knownDefect('server-version');
      const server = (await get()).response.headers()['server'] ?? '';

      expect(server).not.toMatch(/\d+\.\d+/);
    });

    test('CORS does not reflect an arbitrary origin or combine "*" with credentials', async () => {
      knownDefect('cors');
      const h = (await get({ Origin: EVIL_ORIGIN })).response.headers();
      const allowOrigin = h['access-control-allow-origin'];
      const allowCredentials = h['access-control-allow-credentials'];

      // Credentials may be allowed only for a specific, trusted origin: never for "*" or for any origin sent.
      expect(allowCredentials === 'true' && allowOrigin === '*', '"*" combined with credentials').toBe(false);
      expect(allowOrigin).not.toBe(EVIL_ORIGIN);
    });

    test('OPTIONS does not return a description of the API', async () => {
      knownDefect('options-body');
      const res = await client.send('OPTIONS', target.optionsUrl ?? target.url, {
        // No JSON preference: a server may describe itself (WADL) to clients that accept anything.
        headers: { Accept: '*/*', Origin: EVIL_ORIGIN, 'Access-Control-Request-Method': 'GET' },
      });

      expect(res.contentType).not.toMatch(/wadl|xml/);
      expect(res.text).not.toMatch(/<application\b|<resources\b/);
    });

    test('an error response does not leak internals (stack trace, class names)', async () => {
      knownDefect('stack-trace');
      const res = await client.send('GET', target.errorUrl);

      expect(res.text).not.toMatch(STACK_TRACE);
    });
  });
}
