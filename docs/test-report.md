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

# Test summary report — HTTP security headers (Sock Shop gateway)

- **Date:** 15.10.2026, moved here from api-test-automation on 18.10.2026
- **System under test:** the Sock Shop gateway (`edge-router` → `front-end`, Docker). The same checks for
  OpenWeather and Petstore live in [api-test-automation](https://github.com/NailKarimov/api-test-automation).

## 1. Summary

8 checks, run against the gateway with the stack up. Transport checks (HSTS) do not apply: the gateway is plain
HTTP inside the Docker network. Two findings are recorded as expected failures (`test.fail`).

## 2. Findings

| Id     | Expected                          | Actual                                        |
| ------ | --------------------------------- | --------------------------------------------- |
| SEC-9  | `X-Content-Type-Options: nosniff` | Header missing                                |
| SEC-10 | No framework in `X-Powered-By`    | `X-Powered-By: Express` reveals the framework |

## 3. Recommendations

1. Add `X-Content-Type-Options: nosniff` at the gateway and drop `X-Powered-By` (`app.disable('x-powered-by')` in
   Express).

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

| #      | Observation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Impact on tests                                                                                                                                                                                                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OBS-18 | `catalogue`'s p(95) stays near 2 ms from 2 VUs to 60 VUs: its tiny MySQL seed set and read-only path barely register the extra concurrency                                                                                                                                                                                                                                                                                                                                                                                                | The configured "stress" profile (60 VUs) does not find a limit for this script; the ad hoc burst above does                                                                                                                                                                                                                         |
| OBS-19 | `checkout`'s p(95) rises from 34.7 ms at 1 VU to 277.5 ms at 150 VUs: five chained writes per iteration (user, address, card, carts, orders) queue up under concurrency well before any request fails                                                                                                                                                                                                                                                                                                                                     | Latency, not the error rate, is the first signal this stack is under pressure                                                                                                                                                                                                                                                       |
| OBS-20 | `orders` and `carts` sit at 320–350 MiB of resident memory under load despite `-Xmx128m`: the flag bounds the JVM heap, not the container's total memory, so the containers were never close to the host's memory ceiling in these runs                                                                                                                                                                                                                                                                                                   | Memory was not the limiting factor for any profile run here                                                                                                                                                                                                                                                                         |
| OBS-22 | Open-model `capacity` profile on a GitHub runner (21.10.2026), two runs: the first held 800 iterations/s (≈ 3 200 req/s) with p95 1.1 ms and no errors; the second broke at ≈ 2 400 req/s: within seconds almost every `/catalogue`, `/catalogue/size` and `/tags` call answered **500**, k6 dropped 1 030 iterations and reached its 300-VU cap, and the errors went on until the end of the run (42 % of all requests failed). `/catalogue/{id}` was rarely called then because the script only asks for a sock after a successful list | The limit sits around 2 400–3 200 req/s on that runner and is not stable between runs; everything touching `catalogue-db` failed together, which points at the database connection limit (the service log is in the job's "Sock Shop logs" step). See `docs/grafana.md`; the panels of both runs are on Pages under `load/grafana/` |
| OBS-21 | Every `checkout` iteration writes one customer, address, card and order with no cleanup; the three profile runs for this report alone left 3,112 orders in `orders-db`                                                                                                                                                                                                                                                                                                                                                                    | `npm run stack:down` discards all container data (no named volumes), which is the way to reset between load-testing sessions                                                                                                                                                                                                        |

## 4. Recommendations

1. Treat `checkout`'s rising p(95) as the real stress signal here, not the error rate: investigate connection
   pool / thread pool sizes on `carts` and `orders` before concurrency reaches the triple digits in any
   environment that matters.
2. Re-run periodically after infrastructure changes (more memory, a connection pool change, a newer JVM) to
   see whether the latency curve moves, using the same profiles for a like-for-like comparison.
3. If this ever runs against a shared or production-like environment, rebuild the thresholds for that
   hardware — the numbers above describe one laptop, not a capacity plan.
