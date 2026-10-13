import 'dotenv/config';

/** Reads a variable from the environment (or .env) and falls back to a default. */
function read(name: string, fallback = ''): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

/**
 * Test environment settings. The API key is never stored in the repository:
 * locally it comes from .env, in CI from the OPENWEATHER_API_KEY secret.
 */
export const env = {
  apiBaseUrl: read('API_BASE_URL', 'https://api.openweathermap.org'),
  apiKey: read('OPENWEATHER_API_KEY'),
};
