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

---

# Test summary report — Sock Shop microservices

- **Date:** 14.10.2026
- **System under test:** Sock Shop (13 containers) started with Docker Compose on the test machine / CI runner

## 1. Summary

All 70 Sock Shop tests pass: 67 service and flow tests, 3 fault-injection tests. 21 of them are expected failures
(`test.fail`) that document 12 defects; they turn red when the corresponding defect is fixed. The order flow across
services, the payment boundary and the isolation of failures work as intended. The defects concentrate in
input validation, error codes and the handling of card data.

## 2. Defects

| Id    | Service       | Expected                                                         | Actual                                                                                       |
| ----- | ------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| SS-1  | payment       | Invalid amount (≤ 0, text, missing, bad JSON) → 4xx              | HTTP 500 for every invalid input                                                             |
| SS-2  | user          | Wrong password or unknown user → 401                             | HTTP 500 `Do: Unauthorized`                                                                  |
| SS-3  | user          | Duplicate username → 409 and no internals                        | HTTP 500 with the raw MongoDB error `E11000 duplicate key error collection: users.customers` |
| SS-4  | user, orders  | Card number masked, CCV never returned or stored (PCI DSS)       | `GET /customers/{id}/cards` and `POST /orders` return the full card number and CCV           |
| SS-5  | catalogue     | Unknown sock id → 404                                            | HTTP 500 `Do: not found`                                                                     |
| SS-6  | carts         | Price is taken from the catalogue; a different price is rejected | The client sends `unitPrice`, and a 99.99 sock can be bought for 0.01                        |
| SS-7  | carts, orders | Negative price rejected                                          | Accepted; the order then fails with 500 "unspecified IO error"                               |
| SS-8  | carts         | A sock that is not in the catalogue is rejected                  | `itemId: "does-not-exist"` accepted (201)                                                    |
| SS-9  | orders        | Order with an empty cart rejected                                | 201 Created, customer is charged for shipping only                                           |
| SS-10 | catalogue     | Every id is a UUID                                               | Seed sock "Classic" has the id `zzz4f044-…` (`z` is not a hex digit)                         |
| SS-11 | gateway       | Proxied JSON keeps `Content-Type: application/json`              | `text/plain; charset=utf-8`                                                                  |
| SS-12 | gateway       | `GET /orders` without a session → 401                            | HTTP 500                                                                                     |

SS-6 is the most serious: with it the payment limit and every price can be bypassed by the client.

## 3. Observations

| #      | Observation                                                                                                        | Impact on tests                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| OBS-8  | Total of an order = sum of lines + a flat 4.99 shipping, whatever the content                                      | Totals are computed as goods + 4.99                         |
| OBS-9  | A payment decline is HTTP 200 on the payment service and HTTP 406 on the orders service                            | Both layers are tested separately                           |
| OBS-10 | Tags of a sock are a set: their order changes between calls                                                        | Comparisons sort the tags first                             |
| OBS-11 | `GET /orders/{id}` omits `id` and `shipment.id` that `POST /orders` returned; the id is only in `_links.self`      | A separate schema for stored orders                         |
| OBS-12 | `DELETE /carts/{id}/items/{x}` takes the catalogue id of the sock, not the id of the cart line                     | Tests remove by catalogue id                                |
| OBS-13 | With payment stopped, an order fails after about 5 s with `timeout from one of the services` and nothing is stored | Resilience test asserts "fails within 30 s, nothing stored" |

## 4. Recommendations

1. Fix SS-6 first: the order service should price the cart from the catalogue, never from the client.
2. Stop returning and storing the card number and CCV; keep a token (SS-4).
3. Return 4xx for every client error (SS-1, SS-2, SS-3, SS-5, SS-12).

---

# Test summary report — HTTP security headers

- **Date:** 15.10.2026
- **System under test:** OpenWeather API, Swagger Petstore v3 (public) and the Sock Shop gateway (Docker)

## 1. Summary

The suite has 24 tests: 8 checks for each of 3 systems. Locally 16 run and pass; 8 (the Sock Shop gateway) are
skipped because Docker was not running. 8 of the passing tests are expected failures (`test.fail`) that document
8 findings in the two public APIs; they turn red when the provider fixes the issue. Neither public API sets the
two basic browser protections, and Petstore additionally discloses its server version and internals.

## 2. Findings

| Id    | System      | Expected                                                     | Actual                                                             |
| ----- | ----------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| SEC-1 | OpenWeather | `Strict-Transport-Security` with max-age ≥ 180 days          | Header missing                                                     |
| SEC-2 | OpenWeather | `X-Content-Type-Options: nosniff`                            | Header missing                                                     |
| SEC-3 | OpenWeather | No `Allow-Credentials: true` together with `Allow-Origin: *` | Both sent on every response (browsers ignore the combination)      |
| SEC-4 | Petstore    | `Strict-Transport-Security`                                  | Header missing                                                     |
| SEC-5 | Petstore    | `X-Content-Type-Options: nosniff`                            | Header missing                                                     |
| SEC-6 | Petstore    | No version in `Server`                                       | `Server: Jetty(9.4.53.v20231009)`                                  |
| SEC-7 | Petstore    | `OPTIONS` does not describe the API                          | `OPTIONS /pet` with `Accept: */*` returns a WADL document (Jersey) |
| SEC-8 | Petstore    | Error text without internals                                 | 400 message contains `java.lang.Long`                              |

## 3. Observations

| #      | Observation                                                                                      | Impact on tests                                       |
| ------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| OBS-14 | The WADL on `OPTIONS` appears only when the client does not ask for JSON                         | The `OPTIONS` test overrides `Accept` with `*/*`      |
| OBS-15 | WADL is returned for the collection `/pet`, not for `/pet/{id}`                                  | The target has a separate `optionsUrl`                |
| OBS-16 | Neither public API reflects an arbitrary `Origin`; both answer `*`                               | Only `*` with credentials is a finding (SEC-3)        |
| OBS-17 | Sock Shop gateway results are not yet known: Docker was not available when the suite was written | Run once with `npm run stack:up`, then record `SEC-n` |

## 4. Recommendations

1. Add `Strict-Transport-Security` and `X-Content-Type-Options: nosniff` on both public APIs (SEC-1, 2, 4, 5).
2. Do not send `Allow-Credentials: true` with a wildcard origin (SEC-3).
3. Hide the server version and the generated WADL, and return generic error messages (SEC-6, 7, 8).
4. Start the Sock Shop locally once and register what the gateway returns.
