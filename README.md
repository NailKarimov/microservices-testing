# openweather-api-tests

[![Tests](https://github.com/NailKarimov/openweather-api-tests/actions/workflows/tests.yml/badge.svg)](https://github.com/NailKarimov/openweather-api-tests/actions/workflows/tests.yml)
[![Allure report](https://img.shields.io/badge/report-Allure-orange)](https://nailkarimov.github.io/openweather-api-tests/)

API test automation for the public [OpenWeather API](https://openweathermap.org/api):
contract validation, boundary values, unit conversions, authentication, geocoding, forecast and air quality.
**Playwright (API testing) + TypeScript + zod + Allure**, run daily in **GitHub Actions**.

## What is tested

| Area            | Spec                            | Technique                             | Examples                                                                                                          |
| --------------- | ------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Current weather | `tests/current-weather.spec.ts` | Contract testing                      | Schema with physical ranges; by coordinates and by city; unknown city → 404; `lang=de`; `mode=xml`; response time |
| Coordinates     | `tests/coordinates.spec.ts`     | Boundary value analysis               | lat ±90, lon ±180 → 200; ±0.01 outside → 400; non-numeric → 400                                                   |
| Units           | `tests/units.spec.ts`           | Decision table                        | K − 273.15 = °C, °F = °C × 9/5 + 32, mph = m/s × 2.23694 for the same measurement                                 |
| Authentication  | `tests/auth.spec.ts`            | Negative testing                      | No key / invalid key → 401 on weather and geocoding                                                               |
| Geocoding       | `tests/geocoding.spec.ts`       | Equivalence partitioning, consistency | `limit` 1/3/5; unknown place → `[]`; Latvian local name; geocoding ↔ weather agree                                |
| Forecast        | `tests/forecast.spec.ts`        | Data invariants                       | 40 steps, exactly 3 h apart; `cnt` 1/8/40; first step not in the past                                             |
| Air pollution   | `tests/air-pollution.spec.ts`   | Contract testing                      | AQI 1–5; all main pollutants present and non-negative                                                             |
| Key redaction   | `tests/unit/redact.spec.ts`     | Unit test                             | The API key never appears in the public report                                                                    |

Test design, scope, risks and exit criteria: [`docs/test-plan.md`](docs/test-plan.md).

## Design decisions

- **Contracts as code.** Response schemas live in `src/schemas/weather.ts` (zod) and include physical
  limits — a humidity of 140 % fails the contract, not only a missing field.
- **Live data, stable tests.** Weather changes every few minutes, so cross-request comparisons
  (units, translations) run only when the responses share the same measurement time `dt`.
- **The key never leaves the secret store.** `OPENWEATHER_API_KEY` comes from `.env` locally and from a
  repository secret in CI. Every request is attached to the Allure report with `appid=***`.
- **Gentle on a free plan.** About 40 requests per run, two workers, one daily scheduled run —
  far below the 60 calls/minute limit. No load testing against a third-party production API.

## Project structure

```
config/env.ts            base URL and API key from the environment
src/api/ApiClient.ts     HTTP client: adds the key, attaches redacted request/response to the report
src/api/WeatherClient.ts one method per endpoint
src/schemas/weather.ts   zod contracts for every response
src/data/locations.ts    reference cities and coordinate boundary values
src/fixtures.ts          `weather` fixture injected into tests
tests/                   specs by endpoint; tests/unit for helpers
docs/                    test plan and test summary report
```

## Running locally

Requirements: Node.js 22+, Java 17+ (for the Allure CLI), an OpenWeather API key (free plan is enough).

```bash
npm ci
cp .env.example .env     # then put your key into OPENWEATHER_API_KEY
npm test                 # all tests
npm run test:smoke       # @smoke tests only
npm run lint && npm run typecheck
npm run allure:generate && npm run allure:open
```

In CI the key is the repository secret `OPENWEATHER_API_KEY`
(Settings → Secrets and variables → Actions).

## Tech stack

Playwright Test (APIRequestContext) · TypeScript · zod · Allure Report · ESLint · Prettier · husky · GitHub Actions
