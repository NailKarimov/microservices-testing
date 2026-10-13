# Test plan — OpenWeather API

Structure follows ISO/IEC/IEEE 29119-3 (test plan), shortened for a single project.

## 1. Context

- **System under test (SUT):** OpenWeather public REST API, free plan — `https://api.openweathermap.org`
- **Goal of testing:** show that the endpoints a weather application depends on return correct,
  consistent and well-formed data, and reject invalid requests in a predictable way.
- **References:** [Current weather](https://openweathermap.org/current),
  [5 day / 3 hour forecast](https://openweathermap.org/forecast5),
  [Geocoding](https://openweathermap.org/api/geocoding-api),
  [Air pollution](https://openweathermap.org/api/air-pollution),
  [Pricing and limits](https://openweathermap.org/price).

## 2. Scope

| In scope                                                                        | Out of scope                                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `GET /data/2.5/weather` (by coordinates, by city name, `units`, `lang`, `mode`) | Paid APIs (One Call 3.0, history, 16-day forecast)              |
| `GET /data/2.5/forecast` (`cnt`)                                                | Weather maps (tile images)                                      |
| `GET /geo/1.0/direct`, `GET /geo/1.0/reverse` (`limit`)                         | Accuracy of the forecast itself (needs ground-truth data)       |
| `GET /data/2.5/air_pollution`                                                   | Load testing — not allowed against a third-party production API |
| Authentication (`appid`)                                                        |                                                                 |

## 3. Quality characteristics (ISO/IEC 25010)

| Characteristic                   | Covered by                                                                | Notes                                    |
| -------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| Functional correctness           | contract (zod schemas), unit conversions, geocoding ↔ weather consistency | Physical ranges are part of the contract |
| Functional completeness          | forecast has 40 steps, air pollution has all main pollutants              |                                          |
| Security                         | 401 without / with an invalid key; key redaction in reports               | Key lives only in secrets / `.env`       |
| Performance efficiency           | response time under 3 s (single request)                                  | Indicative only, not a load test         |
| Compatibility / interoperability | `mode=xml`, `lang=de`                                                     |                                          |

## 4. Test approach

- **Level:** API (black box), through Playwright `APIRequestContext`.
- **Contract testing:** every successful response is validated against a zod schema
  (`src/schemas/weather.ts`) that encodes types, required fields and physical ranges
  (humidity 0–100 %, wind direction 0–360°, AQI 1–5).
- **Test design techniques:**

| Technique                   | Where                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Boundary value analysis     | Latitude −90 / 90 and longitude −180 / 180 accepted; ±0.01 outside rejected (`coordinates.spec.ts`)            |
| Equivalence partitioning    | Valid / unknown / non-numeric inputs; known vs unknown city; `limit` 1, 3, 5                                   |
| Decision table              | Same location in `standard` / `metric` / `imperial` → K − 273.15 = °C, °F = °C × 9/5 + 32, mph = m/s × 2.23694 |
| Negative testing            | Missing or invalid key, missing parameter, unknown city                                                        |
| Consistency (oracle) checks | Coordinates from geocoding match `coord` in the weather response                                               |

- **Live data:** values change every few minutes. Comparisons across requests run only when all
  responses carry the same measurement time (`dt`); otherwise the test is skipped with a reason.
- **Test data:** reference locations and boundary values in `src/data/locations.ts`.

## 5. Risks

| Risk                                                         | Impact                                  | Mitigation                                                                          |
| ------------------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------- |
| Live data changes between requests                           | False failures in comparisons           | Compare only responses with the same `dt`                                           |
| Rate limit (60 calls/min)                                    | 429 responses                           | ~40 calls per run, 2 workers, daily schedule                                        |
| API key leak through public reports                          | Key abuse                               | Key from secrets only; `redact()` masks it in every attachment and error            |
| Provider changes undocumented behaviour (error texts, codes) | Test failures that are not product bugs | Error contract checks `cod` + `message` presence; exact texts only where documented |

## 6. Entry and exit criteria

- **Entry:** API key active; lint, format and type checks pass.
- **Exit:** all smoke tests pass; every failure is either fixed in the suite or documented as a
  finding in `docs/test-report.md`.

## 7. Deliverables

- Automated suite in this repository, Allure report on GitHub Pages
- Test summary report: [`test-report.md`](test-report.md)
