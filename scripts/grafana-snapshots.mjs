// Saves the Grafana dashboard of each k6 run as PNG panels plus one page that shows them next to k6's own
// HTML report, so the graphs outlive the CI machine (published on GitHub Pages under load/).
//   node scripts/grafana-snapshots.mjs        (Grafana on GRAFANA_URL, default http://localhost:3001)
// Uses Playwright's Chromium, opening each panel alone (/d-solo/…) for the time span of the run.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const GRAFANA = process.env.GRAFANA_URL ?? 'http://localhost:3001';
const DIR = 'loadtests-results';
const OUT = `${DIR}/grafana`;
const dashboard = JSON.parse(
  readFileSync('infra/observability/grafana/dashboards/k6-sock-shop.json', 'utf8'),
);
const runs = existsSync(DIR)
  ? readdirSync(DIR)
      .filter((f) => f.endsWith('.run.json'))
      .map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')))
  : [];
if (!runs.length) {
  console.log('No k6 runs found in loadtests-results/.');
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1000, height: 400 }, deviceScaleFactor: 2 });
const sections = [];
for (const run of runs) {
  const shots = [];
  for (const p of dashboard.panels) {
    const w = p.type === 'stat' ? 500 : 1000;
    const h = p.type === 'stat' ? 220 : 420;
    await page.setViewportSize({ width: w, height: h });
    const url = `${GRAFANA}/d-solo/${dashboard.uid}/x?orgId=1&panelId=${p.id}&from=${run.from - 15_000}&to=${run.to + 15_000}&var-testid=${encodeURIComponent(run.testid)}&theme=light&timezone=utc`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500); // let the panel finish drawing after the last query
    const file = `${run.testid}-panel-${p.id}.png`;
    await page.screenshot({ path: `${OUT}/${file}` });
    shots.push({ file, title: p.title, wide: p.type !== 'stat' });
  }
  const summaryPath = `${DIR}/${run.script}-${run.profile}.json`;
  const m = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')).metrics : null;
  const p95 = m?.http_req_duration?.['p(95)'];
  const failed = m?.http_req_failed?.value;
  sections.push(`<section><h2>${run.script} · ${run.profile}</h2>
<p>Test id <code>${run.testid}</code>, ${new Date(run.from).toISOString().replace('T', ' ').slice(0, 19)} UTC, ${Math.round((run.to - run.from) / 1000)} s.
${p95 != null ? `k6 summary: p95 ${Math.round(p95)} ms, failed ${(failed * 100).toFixed(2)} %.` : ''}
<a href="../${run.script}-${run.profile}.html">k6 HTML report</a></p>
<div class="grid">${shots.map((s) => `<figure class="${s.wide ? 'wide' : ''}"><img src="${s.file}" alt="${s.title}"><figcaption>${s.title}</figcaption></figure>`).join('\n')}</div></section>`);
  console.log(`${run.testid}: ${shots.length} panels`);
}
await browser.close();

writeFileSync(
  `${OUT}/index.html`,
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>k6 in Grafana: Sock Shop</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 16px;background:#f6f7f9;color:#16181d}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}figure{margin:0;grid-column:span 1;background:#fff;border:1px solid #d9dde3;border-radius:8px;padding:6px}
figure.wide{grid-column:span 2}img{width:100%;height:auto;display:block}figcaption{font-size:13px;color:#555;padding:4px}
@media(max-width:800px){.grid{grid-template-columns:minmax(0,1fr)}figure,figure.wide{grid-column:span 1}}code{font-size:.9em}</style></head>
<body><h1>k6 load tests in Grafana</h1><p>k6 → Prometheus remote write (native histograms) → Grafana dashboard <code>infra/observability</code>, captured after the run.
How to read it: <a href="../../microservices.html">visual guide</a>.</p>${sections.join('\n')}</body></html>\n`,
);
