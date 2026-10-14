import { test as base, expect } from '@playwright/test';
import { ApiClient } from './api/ApiClient';
import { WeatherClient } from './openweather/WeatherClient';
import { PetstoreClient } from './petstore/PetstoreClient';
import { env } from '../config/env';

type Fixtures = {
  weather: WeatherClient;
  petstore: PetstoreClient;
};

/** Tests receive ready clients: async ({ weather }) => { ... } / async ({ petstore }) => { ... } */
export const test = base.extend<Fixtures>({
  weather: async ({ request }, use) => {
    if (!env.apiKey) {
      throw new Error(
        'OPENWEATHER_API_KEY is not set: add it to .env locally or as a repository secret in CI.',
      );
    }
    await use(new WeatherClient(new ApiClient(request, env.apiKey)));
  },
  // The Petstore sandbox needs no key.
  petstore: async ({ request }, use) => {
    await use(new PetstoreClient(new ApiClient(request)));
  },
});

export { expect };
