# api-test-automation

[![Tests](https://github.com/NailKarimov/api-test-automation/actions/workflows/tests.yml/badge.svg)](https://github.com/NailKarimov/api-test-automation/actions/workflows/tests.yml)
[![Allure report](https://img.shields.io/badge/report-Allure-orange)](https://nailkarimov.github.io/api-test-automation/)

API test automation for public REST APIs. One framework, two systems under test:

- **[OpenWeather API](https://openweathermap.org/api)** — read-only API with live data: contract validation,
  boundary values, unit conversions, authentication, geocoding, forecast and air quality.
- **[Swagger Petstore v3](https://petstore3.swagger.io)** — CRUD API with an OpenAPI document: full resource
  lifecycle, search, input validation, negative tests, and checks of the server against its own contract.

**Playwright (API testing) + TypeScript + zod + Allure**, run daily in **GitHub Actions**.

## What is tested

### OpenWeather (`tests/openweather/`)

| Area            | Spec                   | Technique                             | Examples                                                                                                          |
| --------------- | ---------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Current weather | `current-weather.spec` | Contract testing                      | Schema with physical ranges; by coordinates and by city; unknown city → 404; `lang=de`; `mode=xml`; response time |
| Coordinates     | `coordinates.spec`     | Boundary value analysis               | lat ±90, lon ±180 → 200; ±0.01 outside → 400; non-numeric → 400                                                   |
| Units           | `units.spec`           | Decision table                        | K − 273.15 = °C, °F = °C × 9/5 + 32, mph = m/s × 2.23694 for the same measurement                                 |
| Authentication  | `auth.spec`            | Negative testing                      | No key / invalid key → 401 on weather and geocoding                                                               |
| Geocoding       | `geocoding.spec`       | Equivalence partitioning, consistency | `limit` 1/3/5; unknown place → `[]`; Latvian local name; geocoding ↔ weather agree                                |
| Forecast        | `forecast.spec`        | Data invariants                       | 40 steps, exactly 3 h apart; `cnt` 1/8/40; first step not in the past                                             |
| Air pollution   | `air-pollution.spec`   | Contract testing                      | AQI 1–5; all main pollutants present and non-negative                                                             |

### Swagger Petstore (`tests/petstore/`)

| Area             | Spec                    | Technique                         | Examples                                                                                                         |
| ---------------- | ----------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Pet CRUD         | `pet-crud.spec`         | State transition, lifecycle       | create → read → replace (PUT) → patch (form) → delete → 404; minimal body; idempotent DELETE; unicode round trip |
| Input validation | `pet-validation.spec`   | Negative testing, equivalence     | unknown id → 404; `abc` → 400; malformed JSON → 400; `text/plain` → 415                                          |
| Search           | `pet-search.spec`       | Equivalence partitioning, oracle  | `findByStatus` for each status; a new pet appears and moves between statuses; `findByTags`; invalid status → 400 |
| User and store   | `user-and-store.spec`   | Negative testing, known defects   | login / logout session; store and user-write endpoints currently answer 500 (documented, see below)              |
| API contract     | `openapi-contract.spec` | Contract testing against the spec | `openapi.json` is served; every operation the suite uses is declared; `Pet` required fields and status enum      |

**Known defects.** Tests that describe behaviour required by the OpenAPI document but not delivered by the
public sandbox are marked with `test.fail()` and a `DEF-n` id. They stay green while the defect exists and
turn red the moment the server is fixed, so the marker can be removed. See
[`docs/test-report.md`](docs/test-report.md).

### Helpers

| Spec                        | What it checks                                 |
| --------------------------- | ---------------------------------------------- |
| `tests/unit/redact.spec.ts` | The API key never appears in the public report |

Test design, scope, risks and exit criteria: [`docs/test-plan.md`](docs/test-plan.md).

## Design decisions

- **Contracts as code.** Response schemas (zod) live next to each API (`src/openweather/schemas.ts`,
  `src/petstore/schemas.ts`) and include physical or business limits — a humidity of 140 % fails the contract,
  not only a missing field.
- **One HTTP client, one client class per API.** `ApiClient` knows nothing about a specific API; `WeatherClient`
  and `PetstoreClient` expose one method per endpoint. Playwright projects give each API its own `baseURL`.
- **Live data, stable tests.** Weather changes every few minutes, so cross-request comparisons
  (units, translations) run only when the responses share the same measurement time `dt`.
- **Shared sandbox, isolated tests.** The Petstore is public: every test creates its own pet with a unique id
  and removes it afterwards, and never touches records it did not create.
- **The key never leaves the secret store.** `OPENWEATHER_API_KEY` comes from `.env` locally and from a
  repository secret in CI. Every request is attached to the Allure report with `appid=***`.
- **Gentle on third-party APIs.** About 100 requests per run, two workers, one daily scheduled run.
  No load testing against production services.

## Project structure

```
config/env.ts              base URLs and secrets from the environment
src/api/ApiClient.ts       generic HTTP client: GET/POST/PUT/DELETE, redacted request/response in the report
src/openweather/           WeatherClient, zod contracts, reference locations
src/petstore/              PetstoreClient, zod contracts, test data builders
src/fixtures.ts            `weather` and `petstore` fixtures injected into tests
tests/openweather/         OpenWeather specs
tests/petstore/            Petstore specs
tests/unit/                unit tests of helpers
docs/                      test plan, test summary report, static sample of the Allure report
```

## Running locally

Requirements: Node.js 22+, Java 17+ (for the Allure CLI). OpenWeather tests also need a free API key;
the Petstore needs nothing.

```bash
npm ci
cp .env.example .env       # then put your key into OPENWEATHER_API_KEY
npm test                   # everything
npm run test:openweather   # OpenWeather only
npm run test:petstore      # Petstore only (no key needed)
npm run test:smoke         # @smoke tests only
npm run lint && npm run typecheck
npm run allure:generate && npm run allure:open
```

In CI the key is the repository secret `OPENWEATHER_API_KEY`
(Settings → Secrets and variables → Actions).

## Tech stack

Playwright Test (APIRequestContext) · TypeScript · zod · Allure Report · ESLint · Prettier · husky · GitHub Actions
