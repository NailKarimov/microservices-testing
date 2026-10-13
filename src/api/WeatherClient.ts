import { ApiClient, ApiResult } from './ApiClient';

export type Units = 'standard' | 'metric' | 'imperial';
export type Coords = { lat: number | string; lon: number | string };

/** OpenWeather endpoints available on the free plan. */
export class WeatherClient {
  constructor(readonly api: ApiClient) {}

  /** Current weather by coordinates — /data/2.5/weather */
  current(
    coords: Coords,
    opts: { units?: Units; lang?: string; mode?: 'xml' | 'html' } = {},
  ): Promise<ApiResult> {
    return this.api.get('/data/2.5/weather', { lat: coords.lat, lon: coords.lon, ...opts });
  }

  /** Current weather by city name (built-in geocoder, deprecated but still served). */
  currentByCity(q: string, opts: { units?: Units } = {}): Promise<ApiResult> {
    return this.api.get('/data/2.5/weather', { q, ...opts });
  }

  /** 5 day / 3 hour forecast — /data/2.5/forecast */
  forecast(coords: Coords, opts: { cnt?: number; units?: Units } = {}): Promise<ApiResult> {
    return this.api.get('/data/2.5/forecast', { lat: coords.lat, lon: coords.lon, ...opts });
  }

  /** Current air pollution — /data/2.5/air_pollution */
  airPollution(coords: Coords): Promise<ApiResult> {
    return this.api.get('/data/2.5/air_pollution', { lat: coords.lat, lon: coords.lon });
  }

  /** Direct geocoding: name → coordinates — /geo/1.0/direct */
  geocode(q: string, limit?: number): Promise<ApiResult> {
    return this.api.get('/geo/1.0/direct', { q, limit });
  }

  /** Reverse geocoding: coordinates → names — /geo/1.0/reverse */
  reverseGeocode(coords: Coords, limit?: number): Promise<ApiResult> {
    return this.api.get('/geo/1.0/reverse', { lat: coords.lat, lon: coords.lon, limit });
  }
}
