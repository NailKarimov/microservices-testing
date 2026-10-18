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

# Test plan — Load testing (k6)

## 1. Context

- **System under test (SUT):** the same Sock Shop stack, on the same machine: 7 Java/Go services, most
  with `-Xmx128m` (see `infra/sock-shop/docker-compose.yml`), no horizontal scaling.
- **Goal of testing:** find out how this specific stack, on this specific hardware, behaves as concurrency
  grows — not to size a production deployment. The numbers in `docs/test-report.md` describe one laptop.
- **Tool:** [k6](https://k6.io), run from `grafana/k6:1.8.2` in a throw-away container on the stack's own
  Docker network (`scripts/run-k6.mjs`), so scripts reach services by their compose hostname exactly like
  the orders service does — no port mapping, no extra setup.

## 2. Scope

| In scope                                                                                     | Out of scope                                                               |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `loadtests/catalogue-browse.js`: `/catalogue`, `/catalogue/{id}`, `/tags`, `/catalogue/size` | The front-end UI (browser rendering, JS, assets)                           |
| `loadtests/checkout.js`: register → address → card → add to cart → order                     | Load testing OpenWeather or Petstore (third-party, shared public services) |
| Three profiles per script: smoke, load, stress (`loadtests/lib/profiles.js`)                 | Sizing recommendations for a real deployment                               |

## 3. Test approach

- **Two tiers, matched to what each script does.** `catalogue-browse` is read-only and cheap to repeat, so
  it runs at higher concurrency (up to 60 VUs). `checkout` writes one customer and one order per iteration,
  so it runs at a fraction of that (up to 20 VUs) — otherwise the test's own data growth, not the services,
  would dominate the result.
- **Three profiles, one purpose each:**
  - **smoke** — 1–2 VUs for 15 s: the scenario itself works and the baseline latency is sane.
  - **load** — ramps to the tier's normal concurrency and holds it for 90 s: the expected day-to-day level.
  - **stress** — ramps well past that: looking for where latency or the error rate turns, not confirming a
    number. Thresholds here are loose on purpose (`abortOnFail` is never set): the run completes and reports
    the degradation instead of stopping at the first slow request.
- **Thresholds** (`p(95)` response time, `http_req_failed` rate) are the pass/fail signal for smoke and load;
  for stress they are a recorded expectation, not a release gate — see the test report for what was found.
- **Idempotent read load** (`catalogue-browse`) is safe to run any number of times. **Checkout load** writes
  real MongoDB documents with no cleanup step; `npm run stack:down` (no named volumes) is the way to reclaim
  that data between sessions, by throwing the containers away.

## 4. Risks

| Risk                                                     | Impact                                  | Mitigation                                                                                                            |
| -------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Results depend on the machine running them               | Numbers are not comparable across runs  | Every number in the report states the hardware and is read as a shape (where latency turns), not an absolute capacity |
| `checkout` load fills the Mongo databases with test data | Slower services over many repeated runs | `npm run stack:down && npm run stack:up` discards all container data                                                  |
| A stress run pushes a service into real failure          | Could leave the stack in a bad state    | Run against a disposable local/CI stack only, never a shared one; `stack:down` always recovers it                     |

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
