import { test as base, expect } from '@playwright/test';
import { ApiClient } from './api/ApiClient';
import { WeatherClient } from './api/WeatherClient';
import { env } from '../config/env';

type Fixtures = {
  weather: WeatherClient;
};

/** Tests receive a ready client: async ({ weather }) => { ... } */
export const test = base.extend<Fixtures>({
  weather: async ({ request }, use) => {
    if (!env.apiKey) {
      throw new Error(
        'OPENWEATHER_API_KEY is not set: add it to .env locally or as a repository secret in CI.',
      );
    }
    await use(new WeatherClient(new ApiClient(request, env.apiKey)));
  },
});

export { expect };
