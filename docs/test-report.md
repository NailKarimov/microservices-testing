# Test summary report — OpenWeather API

Structure follows ISO/IEC/IEEE 29119-3 (test completion report), shortened.

- **Date:** 13.10.2026
- **System under test:** OpenWeather API, free plan (`https://api.openweathermap.org`)
- **Allure report:** https://nailkarimov.github.io/openweather-api-tests/

## 1. Summary

All 40 tests pass. The endpoints in scope return responses that match their contracts, accept
boundary coordinates, reject out-of-range input with 400 and invalid keys with 401, and convert
units consistently. No defects were found; three observations about API behaviour shaped the
test design and are listed below.

## 2. Results

| Metric                        | Value                                 |
| ----------------------------- | ------------------------------------- |
| Tests run                     | 40 (38 API + 2 unit)                  |
| Passed / failed / skipped     | 40 / 0 / 0                            |
| Pass rate                     | 100 %                                 |
| Flaky tests (passed on retry) | 0                                     |
| Test execution time           | ≈ 2.3 s (2 workers)                   |
| API calls per run             | ≈ 50 (free plan limit: 60 per minute) |

## 3. Coverage

| Endpoint                              | Tests | Techniques                                                                                 |
| ------------------------------------- | ----- | ------------------------------------------------------------------------------------------ |
| `/data/2.5/weather`                   | 16    | contract, boundary values (10), missing parameter, unknown city, `mode=xml`, response time |
| `/data/2.5/forecast`                  | 10    | contract, invariants (40 steps × 3 h), `cnt` 1/8/40, units decision table (4), `lang=de`   |
| `/geo/1.0/direct`, `/geo/1.0/reverse` | 8     | equivalence partitioning (`limit`), empty result, local names, consistency with weather    |
| `/data/2.5/air_pollution`             | 1     | contract (AQI 1–5, pollutants ≥ 0)                                                         |
| Authentication                        | 3     | missing / invalid key on weather and geocoding                                             |
| Key redaction (unit)                  | 2     | —                                                                                          |

## 4. Observations

| #     | Observation                                                                                                                                                   | Impact on tests                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| OBS-1 | Current weather requested at the same moment in different `units` can carry a different measurement time `dt` — responses come from different data snapshots. | Unit conversions and translations are compared on **forecast steps**, which sit on a fixed 3-hour grid, instead of on current weather. |
| OBS-2 | The weather endpoint returns the local spelling `Rīga` for the query `Riga,LV`, while the geocoding API returns `Riga` (with `lv: "Rīga"` in `local_names`).  | Name checks accept both spellings.                                                                                                     |
| OBS-3 | Searching weather by city name (`q=`) uses a built-in geocoder that the documentation marks as deprecated.                                                    | Main tests use coordinates; one test keeps `q=` to detect if it is switched off.                                                       |

## 5. Deviations from the test plan

None. Load testing was out of scope by design (third-party production API).

## 6. Recommendations

1. Keep the daily scheduled run: it detects contract changes on the provider side early.
2. If the project moves to a paid plan, extend the suite to One Call 3.0 with the same contract approach.

---

# Test summary report — Swagger Petstore v3

- **Date:** 14.10.2026
- **System under test:** Swagger Petstore v3 (`https://petstore3.swagger.io/api/v3`), public sandbox

## 1. Summary

All Petstore tests pass. Pet CRUD, search and validation behave as documented, except for the six defects
below, which are recorded as expected failures (`test.fail`) so that the suite turns red once they are fixed.

## 2. Defects

| Id    | Endpoint                     | Expected (OpenAPI document)                            | Actual                                           |
| ----- | ---------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| DEF-1 | `POST /pet`                  | `name` and `photoUrls` are required → 4xx without them | 200, pet stored with empty `photoUrls`           |
| DEF-2 | `POST /pet`                  | `status` is an enum `available / pending / sold`       | Any string is accepted (`"weird"`)               |
| DEF-3 | `GET /store/inventory`       | 200 with counts by status                              | 500 "There was an error processing your request" |
| DEF-4 | `POST /store/order`          | 200 with the created order                             | 500                                              |
| DEF-5 | `POST /user`                 | 200, user is created                                   | 500 (`GET/PUT/DELETE /user/{name}` also 500)     |
| DEF-6 | `POST /pet/{id}?status=sold` | `name` and `status` are both optional                  | 400 "No Name provided"                           |

## 3. Observations

| #     | Observation                                                                                            | Impact on tests                            |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| OBS-4 | `POST /pet` with an existing id overwrites the record instead of returning 409                         | Test documents the overwrite               |
| OBS-5 | `DELETE /pet/{id}` for a missing pet returns 200                                                       | Test treats DELETE as idempotent           |
| OBS-6 | 404 for an unknown pet has `Content-Type: application/xml` but a plain-text body                       | Test checks the text, not the content type |
| OBS-7 | The sandbox is shared: seed pets such as `id=1` can be modified by anyone, so tests never rely on them | All tests create and delete their own pets |
