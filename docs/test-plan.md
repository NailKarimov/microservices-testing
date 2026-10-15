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

---

# Test plan — Swagger Petstore v3

## 1. Context

- **System under test (SUT):** Swagger Petstore, OpenAPI 3.0 sample server — `https://petstore3.swagger.io/api/v3`
- **Goal of testing:** show a full CRUD resource lifecycle, search, input validation and a check of the
  server against its own OpenAPI document; find places where behaviour and contract diverge.
- **References:** [openapi.json](https://petstore3.swagger.io/api/v3/openapi.json),
  [Swagger UI](https://petstore3.swagger.io).

## 2. Scope

| In scope                                                                       | Out of scope                                        |
| ------------------------------------------------------------------------------ | --------------------------------------------------- |
| `POST/PUT /pet`, `GET/POST/DELETE /pet/{petId}`                                | `POST /pet/{petId}/uploadImage` (binary upload)     |
| `GET /pet/findByStatus`, `GET /pet/findByTags`                                 | Authorization (the sandbox has none)                |
| `GET /user/login`, `GET /user/logout`                                          | Load testing — shared public sandbox                |
| `/store/*` and `POST /user` — as known-defect checks (the sandbox answers 500) | Persistence guarantees across days (data is shared) |
| `GET /openapi.json` — contract checks                                          |                                                     |

## 3. Test approach

- **Level:** API (black box), Playwright `APIRequestContext`; `PetstoreClient` has one method per endpoint.
- **Lifecycle (state transition):** create → read → replace → patch → delete → read gives 404, in one test
  with `test.step` so the report shows which step failed.
- **Equivalence partitioning and negative testing:** valid / unknown / negative / non-numeric ids; valid and
  invalid `status`; valid JSON / malformed JSON / wrong media type.
- **Oracle checks:** a created pet must appear in `findByStatus` and move to another status after an update.
- **Contract checks:** zod schemas written from the OpenAPI document; the document itself is checked for the
  operations and required fields the suite relies on (drift detection).
- **Known defects:** behaviour required by the contract but not delivered is written as a normal test with
  `test.fail(true, 'DEF-n: ...')`. The suite stays green while the defect exists and the test fails loudly
  once the server is fixed, which forces the annotation to be removed.
- **Test data:** every test builds its own pet (`src/petstore/data.ts`) with a unique id and cleans up in
  `finally`; shared seed records are only read, never modified.

## 4. Risks

| Risk                                              | Impact                             | Mitigation                                                           |
| ------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| Shared public data is changed by other people     | Flaky search and count assertions  | Assert only on own records (unique id/tag); never on list sizes      |
| Sandbox is down or returns 500 for some endpoints | Failures that are not product bugs | Affected endpoints are isolated as `DEF-n` tests                     |
| Leftover data from failed runs                    | Pollution of a public service      | Cleanup in `finally`; unique `qa-pet-` names make leftovers findable |

---

# Test plan — Sock Shop microservices

## 1. Context

- **System under test (SUT):** Sock Shop, the Weaveworks microservices demo — 6 business services (catalogue,
  carts, user, orders, payment, shipping) with their databases and a message queue, behind an edge router and a
  front-end. Images `weaveworksdemos/*`, started with Docker Compose from `infra/sock-shop/docker-compose.yml`.
- **Goal of testing:** show how a payment flow is tested when it spans several services: each service on its own,
  the contracts between them, the business rules of money, and what happens when one service is down.
- **References:** [microservices-demo](https://github.com/microservices-demo/microservices-demo).

## 2. Scope

| In scope                                                                               | Out of scope                                             |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| payment: `/paymentAuth`, `/health`                                                     | The AngularJS front-end UI                               |
| catalogue: `/catalogue`, `/catalogue/size`, `/catalogue/{id}`, `/tags`                 | Message consumption by `queue-master` (not started)      |
| carts: `/carts/{id}/items` (add, list, remove), `/carts/{id}` (clear)                  | Load and performance testing                             |
| user: `/register`, `/login`, `/addresses`, `/cards`                                    | Security testing beyond what is visible in API responses |
| orders: `POST /orders` (calls user, carts, payment, shipping), search by customer / id |                                                          |
| gateway: front page, proxied catalogue and tags, register with session cookie          |                                                          |
| fault injection: payment, carts and rabbitmq containers stopped and restarted          |                                                          |
| the `shipping-task` queue a successful order publishes to (RabbitMQ)                   |                                                          |

## 3. Test approach

- **Service level.** Every service is published on its own port, so each can be tested alone (contract, boundary
  values, negative input) without going through the others.
- **Integration across services.** `POST /orders` makes the orders service call user, carts, payment and
  shipping. Tests follow one customer through the whole chain and check what each service contributed:
  customer and address from user, lines from carts, the authorisation from payment, the shipment from shipping.
- **Business rules of money.** Payment authorises up to and including 100.00 (goods plus a flat 4.99 shipping).
  Boundaries are tested at 100.00 and 100.01, on the payment service and again through an order, which also
  proves the order service applies the decision (406 and nothing stored).
- **Fault injection.** `sockshop-chaos` stops a real container and checks the failure is bounded (answer
  within 30 s), consistent (no order stored), isolated (catalogue, carts and payment of other paths keep working)
  and recoverable (the same cart can be ordered after the container is back).
- **Event-driven architecture.** The orders service does not call shipping directly: it publishes a task to
  the `shipping-task` queue on RabbitMQ, and in production `queue-master` consumes it to update the shipment.
  That consumer is not started in this compose file (it needs the Docker socket), which is useful rather than
  a gap: nothing else reads the queue, so a test can assert on the exact message a given order produced.
  `sockshop-events` (`src/sockshop/queue.ts`, a thin `amqplib` client) checks: a successful order publishes
  exactly one message, matching the order's `shipment.id` and `customerId` (contract); a declined payment
  publishes nothing (no task for an order that was never created); and, as fault injection on the broker
  itself, what happens to the order and to the queue when RabbitMQ is stopped. These tests share one queue, so
  they run serially (`mode: 'serial'`) after both `sockshop` and `sockshop-chaos`, and each starts by purging it
  (the `queue` fixture), rather than freely in parallel with everything else that places orders.
- **Known defects.** Behaviour that a payment system must not have is written as a test with `test.fail()` and
  an `SS-n` id; see the test report.
- **OWASP API Security Top 10.** `security-owasp.spec.ts` checks the categories that apply to a service with
  no real authentication: BOLA (API1), brute-force protection on login (API2), resource limits on the
  catalogue (API4), and the Spring Boot actuator endpoints of carts, orders and shipping (API8/API9). Each
  check states the control that should exist; a gap is `test.fail()` with an `SS-n` id, same as the other
  defects. SSRF (API7) is only noted as a manual follow-up (see the test report): the orders service builds
  internal requests from client-supplied URLs, and probing that safely needs a one-off, carefully scoped
  check rather than a repeatable test.
- **Test data.** Each test registers its own customer with address and card, so tests run in parallel and
  never depend on seed users. The catalogue is read-only seed data.

## 4. Risks

| Risk                                                   | Impact                                 | Mitigation                                                                |
| ------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------- |
| Java services need up to 30 s to start                 | Tests run against a half-started stack | `scripts/wait-for-stack.mjs` waits for all 7 endpoints before tests       |
| Docker is not available (no virtualization, no memory) | Tests cannot run locally               | Tests skip with a reason locally; CI sets `REQUIRE_STACK=1` and fails     |
| Fault-injection tests disturb parallel tests           | False failures                         | Separate project that depends on, and therefore runs after, the others    |
| Images are old (2019–2020)                             | Security of the demo itself            | The stack is bound to localhost / a throw-away CI runner, never published |

---

# Test plan — HTTP security headers (cross-cutting)

## 1. Context

- **System under test (SUT):** the HTTP edge of all three systems: OpenWeather, Petstore and the Sock Shop gateway.
- **Goal of testing:** check, with one shared suite, the transport and browser-facing protections every public API
  should have, and record where each system deviates. The checks need no credentials beyond the OpenWeather key.
- **References:** [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/),
  [OWASP API Security Top 10, API8: Security Misconfiguration](https://owasp.org/API-Security/editions/2023/en/0xa8-security-misconfiguration/).

## 2. Scope

| In scope                                                            | Out of scope                                             |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| `Strict-Transport-Security`, `X-Content-Type-Options`               | TLS versions and cipher suites (needs a scanner)         |
| `X-Powered-By` and the version in `Server` (information disclosure) | Content-Security-Policy (the APIs return JSON, not HTML) |
| CORS: reflected origin, `*` combined with credentials               | Authentication and authorisation (planned: OWASP API)    |
| `OPTIONS` that must not describe the API                            | Active attacks and fuzzing of third-party production     |
| Error bodies: no stack trace, no internal class names               |                                                          |

## 3. Test approach

- **One spec, many targets.** `tests/security/headers.spec.ts` holds a list of targets (URL, key, known defects)
  and generates the same 8 tests for each. A new system is one entry in the list.
- **Secure baseline as the oracle.** Every test states the secure behaviour. A deviation the target is known to
  have is listed in that target's `defects` map as `SEC-n`; the test then runs under `test.fail()`, like the
  `DEF-n` and `SS-n` defects of the other suites, and turns red once the server is fixed.
- **Read-only.** Only `GET` and `OPTIONS` requests; no data is created or changed.
- **Transport checks** (HSTS) apply to HTTPS targets only; the Sock Shop gateway is plain HTTP inside Docker.

## 4. Risks

| Risk                                                       | Impact                           | Mitigation                                                        |
| ---------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| Provider adds a header                                     | A `SEC-n` test turns red         | Intended: remove the entry from `defects`                         |
| A server answers differently to `Accept: application/json` | `OPTIONS` check hides the defect | The `OPTIONS` test sends `Accept: */*`                            |
| Sock Shop findings are not yet known                       | First CI run may show failures   | Run with the stack up once, then register the findings as `SEC-n` |

---

# Reporting — Allure

- **Labels.** An auto fixture in `src/fixtures.ts` gives every test `owner`, `layer`, `epic` (system under test)
  and `severity` (`@smoke` and `@security` are critical, the rest normal), so the report can be sliced by them.
- **Categories.** `allure/categories.json` groups failures by cause: known defects, defects that were fixed (the
  `test.fail` marker must go), contract violations, security findings, slow responses, infrastructure, product
  defects and test defects.
- **Metadata.** `scripts/allure-prepare.mjs` writes the environment block (Node, OS, branch, commit, base URLs)
  and, in CI, the executor with links to the run and the published report. `npm run allure:generate` calls it.
- **History.** The workflow restores `history` from `gh-pages` before generating, so the report shows trends.
