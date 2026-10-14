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

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type RequestOptions = {
  query?: Query;
  /** JSON request body. */
  body?: unknown;
  /** Raw body with an explicit content type, for negative tests (malformed JSON, wrong media type). */
  raw?: { data: string; contentType: string };
  headers?: Record<string, string>;
};

/**
 * Thin HTTP client over Playwright's APIRequestContext.
 * - adds the API key as `appid` when one is configured (or a deliberately wrong/missing one for negative tests);
 * - attaches every request and response to the report with the key redacted;
 * - parses JSON when the server returns JSON.
 */
export class ApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly apiKey: string = '',
  ) {}

  /**
   * @param apiKey `undefined` → use the configured key, `null` → send no key, string → send that key.
   */
  get<T = unknown>(path: string, query: Query = {}, apiKey?: string | null): Promise<ApiResult<T>> {
    return this.send<T>('GET', path, { query }, apiKey);
  }

  post<T = unknown>(path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
    return this.send<T>('POST', path, opts);
  }

  put<T = unknown>(path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
    return this.send<T>('PUT', path, opts);
  }

  delete<T = unknown>(path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
    return this.send<T>('DELETE', path, opts);
  }

  async send<T = unknown>(
    method: Method,
    path: string,
    opts: RequestOptions = {},
    apiKey?: string | null,
  ): Promise<ApiResult<T>> {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) params[k] = String(v);
    const key = apiKey === undefined ? this.apiKey : apiKey;
    if (key) params.appid = key;

    const headers = { ...opts.headers };
    let data: string | undefined;
    if (opts.raw) {
      data = opts.raw.data;
      headers['Content-Type'] = opts.raw.contentType;
    } else if (opts.body !== undefined) {
      data = JSON.stringify(opts.body);
      headers['Content-Type'] = 'application/json';
    }

    const started = Date.now();
    let response: APIResponse;
    try {
      response = await this.request.fetch(path, { method, params, headers, data });
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

    const shownQuery = { ...params, ...(key ? { appid: '***' } : {}) };
    await test.info().attach(`${method} ${path}`, {
      contentType: 'text/plain',
      body: [
        `${method} ${redact(response.url(), this.apiKey)}`,
        `Query: ${JSON.stringify(shownQuery)}`,
        ...(data !== undefined ? [`Request body: ${redact(data, this.apiKey).slice(0, 2_000)}`] : []),
        `Status: ${response.status()} (${durationMs} ms)`,
        `Content-Type: ${contentType}`,
        `Body:\n${redact(text, this.apiKey).slice(0, 5_000)}`,
      ].join('\n'),
    });

    return { status: response.status(), body: body as T, text, contentType, durationMs, response };
  }
}
