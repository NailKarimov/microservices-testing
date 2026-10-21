// Shared load profiles for the k6 scripts in this directory.
//
// The numbers are calibrated for this stack as it actually runs for these tests: 7 Java/Go
// services on one laptop, most of them given `-Xmx128m` (see infra/sock-shop/docker-compose.yml).
// They describe how *this* demo behaves under load, not a production-sized deployment — see
// docs/test-plan.md and docs/test-report.md for what each profile found.
//
// Two tiers:
//  - "catalogue": read-only GETs, cheap to repeat, safe at higher concurrency.
//  - "checkout":  register → address → card → add to cart → place order; writes data on every
//    iteration (one customer, one order), so it runs at a fraction of the catalogue tier's load.
const TIERS = {
  catalogue: {
    smoke: {
      stages: [{ duration: '15s', target: 2 }],
      thresholds: { http_req_duration: ['p(95)<300'], http_req_failed: ['rate<0.01'] },
    },
    load: {
      stages: [
        { duration: '30s', target: 20 },
        { duration: '90s', target: 20 },
        { duration: '15s', target: 0 },
      ],
      thresholds: { http_req_duration: ['p(95)<800'], http_req_failed: ['rate<0.05'] },
    },
    stress: {
      stages: [
        { duration: '30s', target: 60 },
        { duration: '90s', target: 60 },
        { duration: '15s', target: 0 },
      ],
      // Deliberately beyond comfortable capacity: these record degradation, they do not gate a release.
      thresholds: { http_req_duration: ['p(95)<2000'], http_req_failed: ['rate<0.2'] },
    },
    // Open model: k6 starts iterations at a set rate whether or not earlier ones finished, the way real visitors
    // arrive. The closed profiles above can never send more than VUs × requests ÷ think time; this one keeps
    // raising the rate until the service (or the runner) gives in. No think time (see catalogue-browse.js).
    capacity: {
      scenarios: {
        capacity: {
          executor: 'ramping-arrival-rate',
          startRate: 50,
          timeUnit: '1s',
          preAllocatedVUs: 50,
          maxVUs: 300,
          stages: [
            { duration: '30s', target: 200 },
            { duration: '60s', target: 800 },
            { duration: '30s', target: 800 },
          ],
        },
      },
      // Recorded, not gating: where p95 crosses the SLO is the finding.
      thresholds: {
        http_req_duration: ['p(95)<800'],
        http_req_failed: ['rate<0.05'],
        dropped_iterations: ['count<1'],
      },
    },
  },
  checkout: {
    smoke: {
      stages: [{ duration: '15s', target: 1 }],
      thresholds: { http_req_duration: ['p(95)<1000'], http_req_failed: ['rate<0.01'] },
    },
    load: {
      stages: [
        { duration: '30s', target: 8 },
        { duration: '90s', target: 8 },
        { duration: '15s', target: 0 },
      ],
      thresholds: { http_req_duration: ['p(95)<2000'], http_req_failed: ['rate<0.05'] },
    },
    stress: {
      stages: [
        { duration: '30s', target: 20 },
        { duration: '90s', target: 20 },
        { duration: '15s', target: 0 },
      ],
      thresholds: { http_req_duration: ['p(95)<4000'], http_req_failed: ['rate<0.2'] },
    },
  },
};

/** Reads `PROFILE` (smoke|load|stress, default smoke) and returns k6 `options` for the given tier. */
export function profile(tier) {
  const name = __ENV.PROFILE || 'smoke';
  const chosen = TIERS[tier]?.[name];
  if (!chosen) throw new Error(`Unknown PROFILE "${name}" for tier "${tier}": use smoke, load or stress`);
  return chosen;
}

/** Request params that name the endpoint in metrics (Prometheus label `name`, Grafana legend). */
export const tag = (name) => ({ tags: { name } });
