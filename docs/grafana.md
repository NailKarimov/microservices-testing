# k6 metrics in Prometheus and Grafana

The k6 summary at the end of a run says _how much_: 27 088 requests, p95 0.7 ms. It does not say _when_: did
latency grow with the load, did errors start at a certain number of users, was the slow minute at the start or at
the end? For that the metrics have to be stored as time series and drawn.

```
k6 (container on the Sock Shop network)
  └─ experimental-prometheus-rw ─► Prometheus 3.5 (remote-write receiver, native histograms)
                                        └─► Grafana 12, dashboard provisioned from JSON
                                               └─► Playwright: each panel as PNG ─► GitHub Pages (load/grafana/)
k6 also exports its own HTML report (web dashboard) next to the JSON summary.
```

| Piece                | Where                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Prometheus + Grafana | `infra/observability/docker-compose.yml` (`npm run obs:up`, Grafana on :3001, anonymous viewer)                      |
| Dashboard            | `scripts/build-dashboard.mjs` generates `infra/observability/grafana/dashboards/k6-sock-shop.json`                   |
| Sending metrics      | `OBSERVE=1 node scripts/run-k6.mjs catalogue-browse load`                                                            |
| PNG panels + page    | `scripts/grafana-snapshots.mjs` → [load/grafana/](https://nailkarimov.github.io/microservices-testing/load/grafana/) |
| CI                   | `.github/workflows/loadtest.yml`: by hand (script, profile, observe) and every Monday                                |

## 1. Decisions that matter

**Native histograms, not averaged percentiles.** By default k6 sends p95 per flush as a ready number. A p95 of a
longer window cannot be computed from those: averaging percentiles is mathematically wrong (two endpoints with
p95 of 1 ms and 100 ms, one of them called 100 times more often, do not have a combined p95 of 50 ms). With
`K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true` k6 sends the distribution itself, and PromQL computes an exact
percentile over any range: `histogram_quantile(0.95, sum(increase(k6_http_req_duration_seconds[$__range])))`.

**Name every request.** A metric's labels make a series; k6 labels by URL. `/catalogue/3395a43e-…` for each
sock and `/carts/<customer id>/items` for each new customer would create thousands of series (and a useless
legend). Each request carries `tags: { name: 'GET /catalogue/{id}' }` (`tag()` in `loadtests/lib/profiles.js`),
so the dashboard groups by endpoint.

**A test id per run.** Every run is tagged `testid=<script>-<profile>-<time>`; the dashboard has a "Test run"
variable, and the snapshots open exactly the time span of that run.

**The dashboard is code.** Panels and PromQL live in a 150-line script; the 600-line JSON is generated. Every
query was checked against a real Prometheus fed by k6 before it went into the dashboard.

## 2. The dashboard (11 panels)

| Panel                                                   | PromQL (shortened)                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Requests, failed %, p95 over the run, checks passed     | `increase(...[$__range])`, `histogram_quantile` over the range                      |
| Virtual users                                           | `sum(k6_vus)`                                                                       |
| Requests per second by status                           | `sum by (status) (rate(k6_http_reqs_total[...]))`                                   |
| p95 by endpoint, with the SLO as a dashed line          | `histogram_quantile(0.95, sum by (name) (rate(k6_http_req_duration_seconds[...])))` |
| p50 / p95 / p99, all endpoints                          | same, three quantiles                                                               |
| Failed requests per second by endpoint                  | `expected_response="false"`                                                         |
| Where the time goes: waiting vs connecting vs receiving | `k6_http_req_waiting_seconds` etc.                                                  |
| Iterations started vs dropped (open model)              | `k6_iterations_total`, `k6_dropped_iterations_total`                                |

## 3. What the graphs showed

Runs on a GitHub runner (2 vCPU), catalogue-browse:

| Profile                          | Model  | Requests |                              Throughput |     p50 |     p95 |          Failed |
| -------------------------------- | ------ | -------: | --------------------------------------: | ------: | ------: | --------------: |
| load (20 VUs)                    | closed |    9 032 |                                67 req/s | 0.70 ms | 1.18 ms |               0 |
| stress (60 VUs)                  | closed |   27 088 |                       240 req/s plateau | 0.41 ms | 0.71 ms |               0 |
| capacity (50 → 800 iterations/s) | open   |  231 000 | 1 879 req/s average, ≈ 3 200 at the top | 0.40 ms |  1.1 ms | 0, none dropped |

- **The stress plateau was not the server.** 60 VUs × 4 requests ÷ ~1 s per iteration (the script sleeps 1 s to
  imitate a person) = 240 req/s, exactly the flat line on "Requests per second". A closed model can never send
  more than VUs ÷ iteration time, so it measured the script, not the catalogue. That is why the open-model
  `capacity` profile exists: k6 starts iterations at a set rate (`ramping-arrival-rate`), with no think time.
- **The catalogue broke on the second try.** In the first capacity run it held ≈ 3 200 req/s at p95 1.1 ms. In
  the second, at ≈ 2 400 req/s, "Requests per second, by status" flips from 200 to 500 within seconds: almost
  every call that reads `catalogue-db` (`/catalogue`, `/catalogue/size`, `/tags`) fails, "Iterations started vs
  dropped" shows k6 out of VUs for a moment, and the errors do not stop while the load continues. All
  database-backed endpoints failing together points at the MySQL connection limit; the service log is in the
  job's "Sock Shop logs" step. Two runs, two answers: the limit is near 2 400–3 200 req/s on a 2-vCPU runner and
  not stable, which is exactly why a single green capacity run proves little (`docs/test-report.md`, OBS-22).
- **A spike at the very end is noise.** Every run ends with p99 jumping (to 12 ms in stress, to 3.9 s in
  capacity) in the last 5 s window, while the whole-run p95 is ~1 ms. In that window k6 is stopping and a few
  requests remain, so one slow request _is_ the p99. A percentile of a tiny sample says little; check the request
  rate in the same window before reading the latency.

## 4. Running it

```bash
npm run stack:up                                   # the Sock Shop (its network must exist first)
npm run obs:up                                     # Prometheus :9090, Grafana :3001
OBSERVE=1 node scripts/run-k6.mjs catalogue-browse load
node scripts/grafana-snapshots.mjs                 # PNG panels + loadtests-results/grafana/index.html
npm run obs:down && npm run stack:down
npm run obs:dashboard                              # after changing scripts/build-dashboard.mjs
```

Visual guide: [`grafana.html`](https://nailkarimov.github.io/microservices-testing/grafana.html).
