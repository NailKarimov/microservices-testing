// Runs a k6 load test from loadtests/ in a throw-away container on the Sock Shop's own Docker
// network, so it reaches the services by their compose hostnames (catalogue, carts, …) exactly
// like the orders service does — no port mapping or extra setup needed.
//
// Usage: node scripts/run-k6.mjs <script> [profile]
//   node scripts/run-k6.mjs catalogue-browse load
//   node scripts/run-k6.mjs checkout stress
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

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

console.log(`Running loadtests/${script}.js with PROFILE=${profile} against the Sock Shop...`);
const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '-i',
    '--network',
    NETWORK,
    '-e',
    `PROFILE=${profile}`,
    '-v',
    `${process.cwd()}/loadtests:/scripts:ro`,
    '-v',
    `${process.cwd()}/${RESULTS_DIR}:/results`,
    K6_IMAGE,
    'run',
    `--summary-export=/results/${summaryFile}`,
    `/scripts/${script}.js`,
  ],
  { stdio: 'inherit' },
);
if (!result.error) console.log(`Summary written to ${RESULTS_DIR}/${summaryFile}`);

if (result.error) {
  console.error(result.error.message);
  if (result.error.code === 'ENOENT') {
    console.error('Is Docker running? The Sock Shop must also be up: `npm run stack:up`.');
  }
}
process.exit(result.status ?? 1);
