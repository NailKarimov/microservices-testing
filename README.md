# microservices-testing

[![Tests](https://github.com/NailKarimov/microservices-testing/actions/workflows/tests.yml/badge.svg)](https://github.com/NailKarimov/microservices-testing/actions/workflows/tests.yml)
[![Allure report](https://img.shields.io/badge/report-Allure-orange)](https://nailkarimov.github.io/microservices-testing/)

Testing a microservices system as it runs in production: the [Sock Shop](https://github.com/microservices-demo/microservices-demo)
demo, **13 containers in Docker Compose** (catalogue, carts, user, orders, payment, shipping, a gateway, MongoDB,
MySQL and RabbitMQ), every service on its own port.

| Area                             | Where                                   | What                                                                                                                                                              |
| -------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service and end-to-end API tests | `tests/sockshop/`                       | payment limits (100.00 authorised, 100.01 declined), cart → order → payment → shipping, totals, cart isolation, catalogue paging and filters, gateway consistency |
| OWASP API Security Top 10        | `tests/sockshop/security-owasp.spec.ts` | BOLA (cards and addresses readable by id alone), no login rate limit, unbounded page size, exposed actuator and `/env`                                            |
| Fault injection (chaos)          | `tests/sockshop-chaos/`                 | payment or carts stopped mid-test: fail fast, nothing stored, the rest stays up, **time to recover** without manual repair                                        |
| Events (RabbitMQ)                | `tests/sockshop-events/`                | an order publishes exactly one `shipping-task`; a declined one publishes nothing; broker down and broker restart (SS-17, SS-18)                                   |
| Security headers                 | `tests/security/`                       | the gateway's headers (SEC-9, SEC-10)                                                                                                                             |
| Load testing (k6)                | `loadtests/`, `loadtest.yml`            | smoke / load / stress profiles with p95 and error-rate thresholds as SLOs                                                                                         |

Defects found in the demo are written as normal tests marked `test.fail()` with an id (`SS-1` … `SS-18`), so they
stay green while the defect exists and turn red when it is fixed. Details: [`docs/test-report.md`](docs/test-report.md),
plan: [`docs/test-plan.md`](docs/test-plan.md). Visual walkthrough from preparing the machine to removing the images:
[`docs/microservices.html`](https://nailkarimov.github.io/microservices-testing/microservices.html).

## Running it

```bash
npm ci
npm run stack:up          # pulls 12 images (~3 GB) once, starts 13 containers, waits until ready
npm test                  # API, chaos, events, security headers
npm run loadtest:load     # k6 in a container on the stack's network
npm run stack:down        # remove containers and data, keep the images (stack:purge removes the images too)
```

Without the stack the tests are skipped locally; in CI they fail (`REQUIRE_STACK=1`).

## Part of a portfolio

REST and GraphQL tests of public APIs: [api-test-automation](https://github.com/NailKarimov/api-test-automation) ·
contract testing: [contract-testing-lab](https://github.com/NailKarimov/contract-testing-lab) ·
database testing: [ledger-api-testing](https://github.com/NailKarimov/ledger-api-testing) ·
overview: [github.com/NailKarimov](https://github.com/NailKarimov).

**Stack:** TypeScript · Playwright Test · amqplib · k6 · Docker Compose · Allure · GitHub Actions.
