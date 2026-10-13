import { APIRequestContext, APIResponse, test } from '@playwright/test';
import { redact } from './redact';

export type Query = Record<string, string | number | undefined>;

export type ApiResult<T = unknown> = {
  status: number;
  body: T;
  text: string;
  contentType: string;
  /** Wall-clock duration of the request in milliseconds. */
  durationMs: number;
  response: APIResponse;
};

/**
 * Thin HTTP client over Playwright's APIRequestContext.
 * - adds the API key as `appid` (or a deliberately wrong/missing one for negative tests);
 * - attaches every request and response to the report with the key redacted;
 * - parses JSON when the server returns JSON.
 */
export class ApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly apiKey: string,
  ) {}

  /**
   * @param apiKey `undefined` → use the configured key, `null` → send no key, string → send that key.
   */
  async get<T = unknown>(path: string, query: Query = {}, apiKey?: string | null): Promise<ApiResult<T>> {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(query)) if (v !== undefined) params[k] = String(v);
    const key = apiKey === undefined ? this.apiKey : apiKey;
    if (key !== null) params.appid = key;

    const started = Date.now();
    let response: APIResponse;
    try {
      response = await this.request.get(path, { params });
    } catch (error) {
      // Network errors include the full URL — rethrow without the key. The original error is
      // deliberately not attached as `cause`: it would print the key into the public report.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(redact(String(error), this.apiKey));
    }
    const durationMs = Date.now() - started;
    const text = await response.text();
    const contentType = response.headers()['content-type'] ?? '';
    let body: unknown = text;
    if (contentType.includes('json')) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    const shownQuery = { ...params, ...(key !== null ? { appid: '***' } : {}) };
    await test.info().attach(`GET ${path}`, {
      contentType: 'text/plain',
      body: [
        `GET ${redact(response.url(), this.apiKey)}`,
        `Query: ${JSON.stringify(shownQuery)}`,
        `Status: ${response.status()} (${durationMs} ms)`,
        `Content-Type: ${contentType}`,
        `Body:\n${redact(text, this.apiKey).slice(0, 5_000)}`,
      ].join('\n'),
    });

    return { status: response.status(), body: body as T, text, contentType, durationMs, response };
  }
}
