# microservices-testing

[![Tests](https://github.com/NailKarimov/microservices-testing/actions/workflows/tests.yml/badge.svg)](https://github.com/NailKarimov/microservices-testing/actions/workflows/tests.yml)
[![Allure report](https://img.shields.io/badge/report-Allure-orange)](https://nailkarimov.github.io/microservices-testing/)

Testing a microservices system as it runs in production: the [Sock Shop](https://github.com/microservices-demo/microservices-demo)
demo, **13 containers in Docker Compose** (catalogue, carts, user, orders, payment, shipping, a gateway, MongoDB,
MySQL and RabbitMQ), every service on its own port.

| Area                             | Where                                                 | What                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service and end-to-end API tests | `tests/sockshop/`                                     | payment limits (100.00 authorised, 100.01 declined), cart → order → payment → shipping, totals, cart isolation, catalogue paging and filters, gateway consistency |
| OWASP API Security Top 10        | `tests/sockshop/security-owasp.spec.ts`               | BOLA (cards and addresses readable by id alone), no login rate limit, unbounded page size, exposed actuator and `/env`                                            |
| Fault injection (chaos)          | `tests/sockshop-chaos/`                               | payment or carts stopped mid-test: fail fast, nothing stored, the rest stays up, **time to recover** without manual repair                                        |
| Events (RabbitMQ)                | `tests/sockshop-events/`                              | an order publishes exactly one `shipping-task`; a declined one publishes nothing; broker down and broker restart (SS-17, SS-18)                                   |
| Security headers                 | `tests/security/`                                     | the gateway's headers (SEC-9, SEC-10)                                                                                                                             |
| Load testing (k6)                | `loadtests/`, `loadtest.yml`                          | smoke / load / stress (closed model) and capacity (open model, arrival rate) profiles with p95 and error-rate thresholds as SLOs                                  |
| Load in Grafana                  | `infra/observability/`, `scripts/build-dashboard.mjs` | k6 → Prometheus remote write with native histograms → a Grafana dashboard built from code; each run's panels published as PNG                                     |

Defects found in the demo are written as normal tests marked `test.fail()` with an id (`SS-1` … `SS-18`), so they
stay green while the defect exists and turn red when it is fixed. Details: [`docs/test-report.md`](docs/test-report.md),
plan: [`docs/test-plan.md`](docs/test-plan.md). Visual walkthrough from preparing the machine to removing the images:
[`docs/microservices.html`](https://nailkarimov.github.io/microservices-testing/microservices.html).

## Load tests in Grafana

`loadtest.yml` (by hand, and every Monday) runs k6 with Prometheus and Grafana next to the Sock Shop, then saves
every panel of the dashboard as a picture: [load/grafana/](https://nailkarimov.github.io/microservices-testing/load/grafana/).
Findings: the 240 req/s plateau of the stress profile is the script's think time, not the server (a closed model
cannot send more than VUs ÷ iteration time); with the open-model capacity profile the catalogue held ≈ 3 200 req/s in
one run and broke at ≈ 2 400 req/s in the next (500s on every database-backed endpoint, 42 % failed): the limit is
real and not stable. Details: [`docs/grafana.md`](docs/grafana.md) · visual guide:
[`docs/grafana.html`](https://nailkarimov.github.io/microservices-testing/grafana.html).

## Running it

```bash
npm ci
npm run stack:up          # pulls 12 images (~3 GB) once, starts 13 containers, waits until ready
npm test                  # API, chaos, events, security headers
npm run loadtest:load     # k6 in a container on the stack's network
npm run obs:up && OBSERVE=1 node scripts/run-k6.mjs catalogue-browse load   # with Prometheus + Grafana on :3001
npm run stack:down        # remove containers and data, keep the images (stack:purge removes the images too)
```

Without the stack the tests are skipped locally; in CI they fail (`REQUIRE_STACK=1`).

## Part of a portfolio

REST and GraphQL tests of public APIs: [api-test-automation](https://github.com/NailKarimov/api-test-automation) ·
contract testing: [contract-testing-lab](https://github.com/NailKarimov/contract-testing-lab) ·
database testing: [ledger-api-testing](https://github.com/NailKarimov/ledger-api-testing) ·
overview: [github.com/NailKarimov](https://github.com/NailKarimov).

**Stack:** TypeScript · Playwright Test · amqplib · k6 · Prometheus · Grafana · Docker Compose · Allure · GitHub Actions.
