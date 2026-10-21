// Runs a k6 load test from loadtests/ in a throw-away container on the Sock Shop's own Docker
// network, so it reaches the services by their compose hostnames (catalogue, carts, …) exactly
// like the orders service does — no port mapping or extra setup needed.
//
// With OBSERVE=1 the metrics also go to Prometheus (npm run obs:up) for the Grafana dashboard, tagged with a
// test id. Every run also writes k6's own HTML report (web dashboard export) next to the JSON summary.
//
// Usage: node scripts/run-k6.mjs <script> [profile]
//   node scripts/run-k6.mjs catalogue-browse load
//   node scripts/run-k6.mjs checkout stress
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const K6_IMAGE = 'grafana/k6:1.8.2';
const NETWORK = 'sock-shop_default';
const RESULTS_DIR = 'loadtests-results';

const [, , script = 'catalogue-browse', profile = 'smoke'] = process.argv;
const scriptPath = `loadtests/${script}.js`;

if (!existsSync(scriptPath)) {
  console.error(
    `No such load test: ${scriptPath} (scripts live in loadtests/, without the .js suffix here).`,
  );
  process.exit(1);
}

mkdirSync(RESULTS_DIR, { recursive: true });
const summaryFile = `${script}-${profile}.json`;
const observe = process.env.OBSERVE === '1';
const testid =
  process.env.TESTID ?? `${script}-${profile}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
const observeArgs = observe
  ? [
      '-e',
      'K6_PROMETHEUS_RW_SERVER_URL=http://prometheus:9090/api/v1/write',
      // Trends (durations) as native histograms: Prometheus then computes exact p95/p99 over any window.
      '-e',
      'K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true',
    ]
  : [];
const started = Date.now();

console.log(`Running loadtests/${script}.js with PROFILE=${profile} against the Sock Shop...`);
const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '-i',
    '--network',
    NETWORK,
    // Run as the current user: the k6 image's own user cannot write into a results folder the CI runner owns.
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '-e',
    `PROFILE=${profile}`,
    '-e',
    'K6_WEB_DASHBOARD=true',
    '-e',
    `K6_WEB_DASHBOARD_EXPORT=/results/${script}-${profile}.html`,
    ...observeArgs,
    '-v',
    `${process.cwd()}/loadtests:/scripts:ro`,
    '-v',
    `${process.cwd()}/${RESULTS_DIR}:/results`,
    K6_IMAGE,
    'run',
    `--summary-export=/results/${summaryFile}`,
    '--tag',
    `testid=${testid}`,
    ...(observe ? ['-o', 'experimental-prometheus-rw'] : []),
    `/scripts/${script}.js`,
  ],
  { stdio: 'inherit' },
);
if (!result.error) {
  // When the run happened, for the Grafana snapshots (scripts/grafana-snapshots.mjs).
  writeFileSync(
    `${RESULTS_DIR}/${script}-${profile}.run.json`,
    JSON.stringify({ script, profile, testid, from: started, to: Date.now() }),
  );
  console.log(
    `Summary written to ${RESULTS_DIR}/${summaryFile}, HTML report ${RESULTS_DIR}/${script}-${profile}.html`,
  );
}

if (result.error) {
  console.error(result.error.message);
  if (result.error.code === 'ENOENT') {
    console.error('Is Docker running? The Sock Shop must also be up: `npm run stack:up`.');
  }
}
process.exit(result.status ?? 1);
