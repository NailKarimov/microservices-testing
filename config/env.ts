import 'dotenv/config';

/** Reads a variable from the environment (or .env) and falls back to a default. */
function read(name: string, fallback = ''): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

/**
 * Test environment settings. Secrets are never stored in the repository:
 * locally they come from .env, in CI from repository secrets.
 */
export const env = {
  /** OpenWeather */
  apiBaseUrl: read('API_BASE_URL', 'https://api.openweathermap.org'),
  apiKey: read('OPENWEATHER_API_KEY'),
  /** Swagger Petstore v3 (public sandbox, no key). The trailing slash matters for relative paths. */
  petstoreBaseUrl: read('PETSTORE_BASE_URL', 'https://petstore3.swagger.io/api/v3/'),
};
