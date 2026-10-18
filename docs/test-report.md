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

- **Date:** 14.10.2026, updated 18.10.2026
- **System under test:** Swagger Petstore v3. Until 17.10.2026 the public sandbox
  (`https://petstore3.swagger.io/api/v3`, spec 1.0.27); since 18.10.2026 the private container
  `swaggerapi/petstore3:unstable` (spec 1.0.17) from `infra/petstore`. See `docs/test-environments.md`.

## 1. Summary

All Petstore tests pass. Pet CRUD, search and validation behave as documented, except for the defects below,
which are recorded as expected failures (`test.fail`) so that the suite turns red once they are fixed.
Re-checked on the private container on 18.10.2026: DEF-1, DEF-2 and DEF-6 reproduce, DEF-3, DEF-4 and DEF-5 do
not (closed as environment issues of the shared sandbox), DEF-7 depends on DEF-1 data.

## 2. Defects

| Id    | Endpoint                                       | Expected (OpenAPI document)                            | Actual                                                                                                             |
| ----- | ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| DEF-1 | `POST /pet`                                    | `name` and `photoUrls` are required → 4xx without them | 200, pet stored with empty `photoUrls`                                                                             |
| DEF-2 | `POST /pet`                                    | `status` is an enum `available / pending / sold`       | Any string is accepted (`"weird"`)                                                                                 |
| DEF-3 | `GET /store/inventory`                         | 200 with counts by status                              | **Closed 18.10.2026** — 200 on a clean container; the sandbox itself answered 200 in the nightly run of 18.10.2026 |
| DEF-4 | `POST /store/order`                            | 200 with the created order                             | **Closed 18.10.2026** — 200 on a clean container; the sandbox itself answered 200 in the nightly run of 18.10.2026 |
| DEF-5 | `POST /user`                                   | 200, user is created                                   | **Closed 18.10.2026** — 200 on a clean container; still 500 on the sandbox, so an environment issue there          |
| DEF-6 | `POST /pet/{id}?status=sold`                   | `name` and `status` are both optional                  | 400 "No Name provided"                                                                                             |
| DEF-7 | `GET /pet/findByStatus`, `GET /pet/findByTags` | responses match the `Pet` schema                       | records stored through DEF-1 come back without `name`; `findByTags` answers 500 while such a record exists         |

## 3. Observations

| #     | Observation                                                                                                                           | Impact on tests                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| OBS-4 | `POST /pet` with an existing id overwrites the record instead of returning 409                                                        | Test documents the overwrite                                                         |
| OBS-5 | `DELETE /pet/{id}` for a missing pet returns 200                                                                                      | Test treats DELETE as idempotent                                                     |
| OBS-6 | 404 for an unknown pet has `Content-Type: application/xml` but a plain-text body                                                      | Test checks the text, not the content type                                           |
| OBS-7 | The public sandbox is shared: seed pets such as `id=1` can be modified by anyone, and its data and availability change without notice | The suite moved to a private container; tests still create and delete their own pets |

---

# Test summary report — Sock Shop microservices

- **Date:** 14.10.2026
- **System under test:** Sock Shop (13 containers) started with Docker Compose on the test machine / CI runner

## 1. Summary

All 84 Sock Shop tests pass: 79 service and flow tests, 5 fault-injection tests (3 on a container, 2 on the
message broker). 31 of them are expected failures (`test.fail`) that document 18 defects; they turn red when
the corresponding defect is fixed. The order flow across services, the payment boundary and the isolation of
container failures work as intended. The defects concentrate in input validation, error codes, the handling
of card data, the complete absence of authorization checks on customer data (OWASP pass, 15.10.2026), and —
in the event-driven pass added the same day — what happens to the `shipping-task` message when RabbitMQ
itself is unavailable.

## 2. Defects

| Id    | Service                 | Expected                                                                                 | Actual                                                                                                                                                                                   |
| ----- | ----------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SS-1  | payment                 | Invalid amount (≤ 0, text, missing, bad JSON) → 4xx                                      | HTTP 500 for every invalid input                                                                                                                                                         |
| SS-2  | user                    | Wrong password or unknown user → 401                                                     | HTTP 500 `Do: Unauthorized`                                                                                                                                                              |
| SS-3  | user                    | Duplicate username → 409 and no internals                                                | HTTP 500 with the raw MongoDB error `E11000 duplicate key error collection: users.customers`                                                                                             |
| SS-4  | user, orders            | Card number masked, CCV never returned or stored (PCI DSS)                               | `GET /customers/{id}/cards` and `POST /orders` return the full card number and CCV                                                                                                       |
| SS-5  | catalogue               | Unknown sock id → 404                                                                    | HTTP 500 `Do: not found`                                                                                                                                                                 |
| SS-6  | carts                   | Price is taken from the catalogue; a different price is rejected                         | The client sends `unitPrice`, and a 99.99 sock can be bought for 0.01                                                                                                                    |
| SS-7  | carts, orders           | Negative price rejected                                                                  | Accepted; the order then fails with 500 "unspecified IO error"                                                                                                                           |
| SS-8  | carts                   | A sock that is not in the catalogue is rejected                                          | `itemId: "does-not-exist"` accepted (201)                                                                                                                                                |
| SS-9  | orders                  | Order with an empty cart rejected                                                        | 201 Created, customer is charged for shipping only                                                                                                                                       |
| SS-10 | catalogue               | Every id is a UUID                                                                       | Seed sock "Classic" has the id `zzz4f044-…` (`z` is not a hex digit)                                                                                                                     |
| SS-11 | gateway                 | Proxied JSON keeps `Content-Type: application/json`                                      | `text/plain; charset=utf-8`                                                                                                                                                              |
| SS-12 | gateway                 | `GET /orders` without a session → 401                                                    | HTTP 500                                                                                                                                                                                 |
| SS-13 | user                    | `GET /customers/{id}/cards` and `/addresses` need the owner's session (OWASP API1: BOLA) | Anyone who knows the (sequential, guessable) customer id gets the full card number, CCV and address — no login required                                                                  |
| SS-14 | user                    | Repeated wrong-password logins are rate-limited or lock the account (OWASP API2)         | 5 rapid attempts all answer 500; no attempt is throttled or blocked                                                                                                                      |
| SS-15 | catalogue               | `GET /catalogue` has a maximum page size (OWASP API4)                                    | `size=100000` is served in full, same as `size=1000` (9 socks in this seed data) — no cap at all                                                                                         |
| SS-16 | carts, orders, shipping | No debug/admin endpoint reachable without authentication (OWASP API8/API9)               | Spring Boot's legacy actuator answers on all three at `/actuator` and `/env`: JVM flags, container hostname, and (on `shipping`) links to `/heapdump`, `/restart`, `/pause` and `/dump`  |
| SS-17 | orders, rabbitmq        | An order is not confirmed unless its shipping task is actually queued                    | With RabbitMQ stopped, `POST /orders` still answers 201 after ≈ 5 s (a connect timeout, not a retry); the shipping task for that order is never published and the customer is never told |
| SS-18 | rabbitmq                | `shipping-task` is declared durable, so a queued task survives a broker restart          | The queue is declared `durable=false` (`rabbitmqctl list_queues … durable`); a task still waiting when the broker restarts for any reason (upgrade, OOM, crash) is simply gone           |

SS-6 and SS-13 are the most serious: SS-6 lets the client set any price, and SS-13 lets anyone read every
customer's card number and address without authenticating as them at all. SS-17 and SS-18 together mean a
paid order can silently never ship, with nothing in any service's response hinting that it happened.

**Not automated:** the orders service builds internal requests from the client-supplied `customer`, `address`
and `card` fields of `POST /orders` (OWASP API7: SSRF). Whether a crafted URL can reach a host other than
`user` or `carts` was not probed — that needs a manual, carefully scoped check against this local stack, not
a repeatable test, and is left as a recommendation below.

## 3. Observations

| #      | Observation                                                                                                                                                                                                                                                          | Impact on tests                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| OBS-8  | Total of an order = sum of lines + a flat 4.99 shipping, whatever the content                                                                                                                                                                                        | Totals are computed as goods + 4.99                                                                                              |
| OBS-9  | A payment decline is HTTP 200 on the payment service and HTTP 406 on the orders service                                                                                                                                                                              | Both layers are tested separately                                                                                                |
| OBS-10 | Tags of a sock are a set: their order changes between calls                                                                                                                                                                                                          | Comparisons sort the tags first                                                                                                  |
| OBS-11 | `GET /orders/{id}` omits `id` and `shipment.id` that `POST /orders` returned; the id is only in `_links.self`                                                                                                                                                        | A separate schema for stored orders                                                                                              |
| OBS-12 | `DELETE /carts/{id}/items/{x}` takes the catalogue id of the sock, not the id of the cart line                                                                                                                                                                       | Tests remove by catalogue id                                                                                                     |
| OBS-13 | With payment stopped, an order fails after about 5 s with `timeout from one of the services` and nothing is stored                                                                                                                                                   | Resilience test asserts "fails within 30 s, nothing stored"                                                                      |
| OBS-22 | (18.10.2026) The payment-down message varies with timing: `timeout from one of the services` or `Unable to create order due to unspecified IO error`; right after payment restarts and its `/health` is green, `orders` can still fail with the IO error for a while | Resilience tests accept both messages and measure the time to recover (an order must succeed within 90 s, without manual repair) |
| OBS-14 | Customer ids are MongoDB ObjectIds: the first 4 bytes are a creation timestamp, so ids created close together are numerically close                                                                                                                                  | The BOLA test (SS-13) uses a freshly registered id, never a guessed one; the timestamp property itself is asserted separately    |
| OBS-15 | The orders service declares `shipping-task` itself (exchange `shipping-task-exchange`, routing key `shipping-task`) the first time it publishes; nothing pre-declares it                                                                                             | Tests that check "nothing was published" read `messageCount()`, which treats a queue that does not exist yet as 0, not an error  |
| OBS-16 | No `queue-master` runs in this compose file (it needs the Docker socket), so every message an order produces is still sitting in `shipping-task` for the next test to read                                                                                           | Each test purges the queue first (the `queue` fixture), so the suite's own messages are never confused with another test's       |

## 4. Recommendations

1. Fix SS-6 and SS-13 first: SS-6 lets the client set any price, SS-13 exposes every customer's card and
   address to anyone, with no login at all.
2. Stop returning and storing the card number and CCV; keep a token (SS-4).
3. Return 4xx for every client error (SS-1, SS-2, SS-3, SS-5, SS-12).
4. Disable the legacy actuator in production images, or put it behind authentication (SS-16).
5. Rate-limit or lock out repeated failed logins (SS-14), and cap `size` on list endpoints (SS-15).
6. Declare `shipping-task` durable, and have `POST /orders` fail (or retry) rather than confirm an order whose
   shipping task was never queued (SS-17, SS-18).
7. Schedule a manual, scoped SSRF check of `POST /orders`'s `customer`/`address`/`card` links (OWASP API7).

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

---

# Test summary report — Load testing (k6)

- **Date:** 15.10.2026
- **System under test:** Sock Shop (Docker Compose), single machine — 12 logical CPUs, Docker Desktop given
  7.7 GiB of memory. No other load on the machine during the runs.

## 1. Summary

Both scripts, at every profile including a one-off burst past the configured "stress" tier (150 VUs, ~620
requests/s), ran with **0 % errors**. Nothing crashed, no container needed a restart. The interesting result
is not failure but a clear latency curve: catalogue reads barely move under load, while the checkout flow's
tail latency grows noticeably as concurrency rises — a queueing effect, not an error, and worth knowing
before mistaking "no errors" for "no limit."

## 2. Results

| Script                                       | Profile | VUs (peak) | Duration | Requests | p(95) latency | Error rate |
| -------------------------------------------- | ------- | ---------- | -------- | -------- | ------------- | ---------- |
| catalogue-browse                             | smoke   | 2          | 15 s     | 60       | 1.8 ms        | 0 %        |
| catalogue-browse                             | load    | 20         | 2m15s    | 9,020    | 2.1 ms        | 0 %        |
| catalogue-browse                             | stress  | 60         | 2m15s    | 27,000   | 2.3 ms        | 0 %        |
| checkout                                     | smoke   | 1          | 15 s     | 84       | 34.7 ms       | 0 %        |
| checkout                                     | load    | 8          | 2m15s    | 5,328    | 14.7 ms       | 0 %        |
| checkout                                     | stress  | 20         | 2m15s    | 13,260   | 11.8 ms       | 0 %        |
| checkout (ad hoc burst, not a saved profile) | —       | 150        | 1m20s    | 49,824   | 277.5 ms      | 0 %        |

## 3. Observations

| #      | Observation                                                                                                                                                                                                                             | Impact on tests                                                                                                              |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| OBS-18 | `catalogue`'s p(95) stays near 2 ms from 2 VUs to 60 VUs: its tiny MySQL seed set and read-only path barely register the extra concurrency                                                                                              | The configured "stress" profile (60 VUs) does not find a limit for this script; the ad hoc burst above does                  |
| OBS-19 | `checkout`'s p(95) rises from 34.7 ms at 1 VU to 277.5 ms at 150 VUs: five chained writes per iteration (user, address, card, carts, orders) queue up under concurrency well before any request fails                                   | Latency, not the error rate, is the first signal this stack is under pressure                                                |
| OBS-20 | `orders` and `carts` sit at 320–350 MiB of resident memory under load despite `-Xmx128m`: the flag bounds the JVM heap, not the container's total memory, so the containers were never close to the host's memory ceiling in these runs | Memory was not the limiting factor for any profile run here                                                                  |
| OBS-21 | Every `checkout` iteration writes one customer, address, card and order with no cleanup; the three profile runs for this report alone left 3,112 orders in `orders-db`                                                                  | `npm run stack:down` discards all container data (no named volumes), which is the way to reset between load-testing sessions |

## 4. Recommendations

1. Treat `checkout`'s rising p(95) as the real stress signal here, not the error rate: investigate connection
   pool / thread pool sizes on `carts` and `orders` before concurrency reaches the triple digits in any
   environment that matters.
2. Re-run periodically after infrastructure changes (more memory, a connection pool change, a newer JVM) to
   see whether the latency curve moves, using the same profiles for a like-for-like comparison.
3. If this ever runs against a shared or production-like environment, rebuild the thresholds for that
   hardware — the numbers above describe one laptop, not a capacity plan.
