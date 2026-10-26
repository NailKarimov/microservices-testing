# microservices-testing

[![Tests](https://github.com/NailKarimov/microservices-testing/actions/workflows/tests.yml/badge.svg)](https://github.com/NailKarimov/microservices-testing/actions/workflows/tests.yml)
[![Load tests](https://github.com/NailKarimov/microservices-testing/actions/workflows/loadtest.yml/badge.svg)](https://github.com/NailKarimov/microservices-testing/actions/workflows/loadtest.yml)
[![Allure report](https://img.shields.io/badge/report-Allure-orange)](https://nailkarimov.github.io/microservices-testing/)
[![Release](https://img.shields.io/github/v/release/NailKarimov/microservices-testing)](https://github.com/NailKarimov/microservices-testing/releases)

### ▶ Open online

| Page                                                                                             | What it is              |
| ------------------------------------------------------------------------------------------------ | ----------------------- |
| **[Allure test report](https://nailkarimov.github.io/microservices-testing/)**                   | latest CI run           |
| [k6 load in Grafana](https://nailkarimov.github.io/microservices-testing/load/grafana/)          | dashboards per load run |
| [Sock Shop test journey](https://nailkarimov.github.io/microservices-testing/microservices.html) | interactive guide       |
| [k6, Prometheus and Grafana](https://nailkarimov.github.io/microservices-testing/grafana.html)   | interactive guide       |

Click these links: opening an `.html` file in the file list shows its source code, GitHub does not run it.

Testing a microservices system the way it runs in production. The system is the
[Sock Shop](https://github.com/microservices-demo/microservices-demo) demo: **13 containers in Docker Compose**,
with every service on its own port.

|                        |                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **System under test**  | Sock Shop (third-party, open source): catalogue, carts, user, orders, payment, shipping, a gateway, MongoDB, MySQL, RabbitMQ                                                                                                                                                                                                             |
| **Language and tools** | TypeScript · Playwright Test · amqplib · k6 · Prometheus · Grafana · Docker Compose · Allure                                                                                                                                                                                                                                             |
| **Types of testing**   | service and end-to-end API, security (OWASP API Top 10), chaos (fault injection), event-driven (RabbitMQ), load and capacity                                                                                                                                                                                                             |
| **Tests**              | 94 Playwright tests + 4 k6 profiles (smoke, load, stress, capacity)                                                                                                                                                                                                                                                                      |
| **Test quality**       | 18 known defects pinned by 31 `test.fail()` tests; each turns red when its defect is fixed                                                                                                                                                                                                                                               |
| **Reports**            | [Allure](https://nailkarimov.github.io/microservices-testing/) · [Grafana panels per run](https://nailkarimov.github.io/microservices-testing/load/grafana/) · [walkthrough](https://nailkarimov.github.io/microservices-testing/microservices.html) · [Grafana guide](https://nailkarimov.github.io/microservices-testing/grafana.html) |

## What is tested

| Suite                                   | Tool                 | What it proves                                                                                                                                                    |
| --------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/sockshop/`                       | Playwright Test      | payment limits (100.00 authorised, 100.01 declined); cart → order → payment → shipping; totals; cart isolation; catalogue paging and filters; gateway consistency |
| `tests/sockshop/security-owasp.spec.ts` | Playwright Test      | BOLA (cards and addresses readable by id alone), no login rate limit, an unbounded page size, an exposed actuator and `/env`                                      |
| `tests/sockshop-chaos/`                 | Docker               | payment or carts stopped mid-test: fail fast, nothing stored, the rest stays up, **time to recover** without manual repair                                        |
| `tests/sockshop-events/`                | amqplib              | an order publishes exactly one `shipping-task`, a declined one publishes nothing; broker down and broker restart                                                  |
| `tests/security/`                       | Playwright Test      | the gateway's security headers                                                                                                                                    |
| `loadtests/`                            | k6                   | smoke, load and stress (closed model) and capacity (open model, arrival rate), with p95 and error-rate thresholds as SLOs                                         |
| `infra/observability/`                  | Prometheus + Grafana | k6 → Prometheus remote write with native histograms → a dashboard built from code; each run's panels published as PNG                                             |

## Findings

Each defect is also a bug report in [Issues](https://github.com/NailKarimov/microservices-testing/issues?q=is%3Aissue+label%3Abug), with steps, expected and actual results, severity and a link to the test that pins it.

- **18 defects, SS-1 to SS-18:**
  - 500 for every invalid payment amount;
  - card data handling;
  - no authorization checks on customer data (BOLA);
  - `shipping-task` lost while RabbitMQ is down;
  - and more, all listed in [`docs/test-report.md`](docs/test-report.md).
- **The 240 req/s plateau of the stress profile is the script, not the server.** A closed model cannot send more
  than VUs ÷ iteration time.
- **The capacity limit is real but not stable.** With the open model, the catalogue held ≈ 3 200 req/s in one run
  and broke at ≈ 2 400 req/s in the next: 500s on every database-backed endpoint, and 42 % of requests failed.

## Running it

Requirements: Node.js 22+, Docker with ~3 GB for the images, Java 17+ for a local Allure report.

```bash
npm ci
npm run stack:up          # pulls 12 images once, starts 13 containers, waits until ready
npm test                  # API, chaos, events, security headers
npm run loadtest:load     # k6 in a container on the stack's network
npm run obs:up && OBSERVE=1 node scripts/run-k6.mjs catalogue-browse load   # with Prometheus + Grafana on :3001
npm run stack:down        # remove containers and data, keep the images (stack:purge removes the images too)
```

Without the stack, the tests are skipped locally. In CI they fail instead (`REQUIRE_STACK=1`).

## Project structure

```text
infra/sock-shop/          Docker Compose file of the 13 containers
infra/observability/      Prometheus, Grafana provisioning, the dashboard JSON
src/                      API clients, Docker and RabbitMQ helpers, fixtures
tests/sockshop/           service, flow and OWASP specs
tests/sockshop-chaos/     fault-injection specs
tests/sockshop-events/    RabbitMQ specs
tests/security/           security headers
loadtests/                k6 scripts and profiles
scripts/                  dashboard builder, Grafana snapshots, k6 runner, stack wait
docs/                     test plan, test report, guides
```

## CI

- `tests.yml` runs on push, pull request, nightly at 03:00 UTC and on demand. It starts the stack, runs lint,
  format, typecheck and all tests, and publishes Allure with history to GitHub Pages.
- `loadtest.yml` runs by hand and every Monday at 04:00 UTC. It runs k6 with Prometheus and Grafana next to the
  stack and publishes every panel of the run under `load/grafana/`.

Releases: committing `.github/releases/<tag>.md` runs the Release workflow, which creates the tag and the GitHub release with that file as its notes.

## Documentation

| Document                                                                                                          | What it is                                                                                   |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`docs/test-plan.md`](docs/test-plan.md)                                                                          | test plan (ISO/IEC/IEEE 29119-3), including the load-testing part                            |
| [`docs/test-report.md`](docs/test-report.md)                                                                      | test summary report: latest run, SS-1…SS-18, load results and observations                   |
| [`docs/grafana.md`](docs/grafana.md) · [visual](https://nailkarimov.github.io/microservices-testing/grafana.html) | k6 → Prometheus → Grafana: native histograms, closed and open models, cardinality, real runs |
| [`docs/microservices.html`](https://nailkarimov.github.io/microservices-testing/microservices.html)               | visual walkthrough, from preparing the machine to removing the images                        |

## Part of a portfolio

One of 13 test automation projects by [Nail Karimov](https://github.com/NailKarimov):
[all projects](https://github.com/NailKarimov) ·
[testing map](https://nailkarimov.github.io/api-test-automation/testing-map.html) ·
[toolbox](https://nailkarimov.github.io/api-test-automation/toolbox.html).
