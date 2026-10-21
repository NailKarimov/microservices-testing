// Builds infra/observability/grafana/dashboards/k6-sock-shop.json. The dashboard is code: panels are listed here
// and the JSON is generated, so a review shows the PromQL, not 600 lines of Grafana layout.
//   node scripts/build-dashboard.mjs
import { writeFileSync } from 'node:fs';

const T = '{testid=~"$testid"}';
const ds = { type: 'prometheus', uid: 'prometheus' };
let id = 0;
const target = (expr, legend = '', refId = 'A') => ({
  datasource: ds,
  expr,
  legendFormat: legend,
  refId,
  range: true,
});

const stat = (title, expr, unit, x, thresholds, description) => ({
  id: ++id,
  type: 'stat',
  title,
  description,
  datasource: ds,
  gridPos: { h: 4, w: 6, x, y: 0 },
  targets: [{ ...target(expr), instant: true, range: false }],
  fieldConfig: {
    defaults: {
      unit,
      decimals: unit === 'percentunit' ? 2 : undefined,
      thresholds: { mode: 'absolute', steps: thresholds },
    },
    overrides: [],
  },
  options: {
    reduceOptions: { calcs: ['lastNotNull'] },
    colorMode: 'background',
    graphMode: 'none',
    textMode: 'value',
  },
});

const series = (title, targets, unit, pos, extra = {}) => ({
  id: ++id,
  type: 'timeseries',
  title,
  description: extra.description,
  datasource: ds,
  gridPos: pos,
  targets,
  fieldConfig: {
    defaults: {
      unit,
      custom: {
        lineWidth: 2,
        fillOpacity: 8,
        showPoints: 'never',
        spanNulls: true,
        thresholdsStyle: { mode: extra.thresholdLine ? 'dashed' : 'off' },
      },
      thresholds: {
        mode: 'absolute',
        steps: [
          { color: 'transparent', value: null },
          ...(extra.thresholdLine ? [{ color: 'red', value: extra.thresholdLine }] : []),
        ],
      },
      ...(extra.min != null ? { min: extra.min } : {}),
    },
    overrides: [],
  },
  options: {
    legend: { displayMode: 'table', placement: 'bottom', calcs: extra.calcs ?? ['mean', 'max'] },
    tooltip: { mode: 'multi', sort: 'desc' },
  },
});

const green = (v) => ({ color: 'green', value: v });
const red = (v) => ({ color: 'red', value: v });
const amber = (v) => ({ color: 'orange', value: v });

const panels = [
  stat(
    'Requests',
    `sum(increase(k6_http_reqs_total${T}[$__range]))`,
    'short',
    0,
    [{ color: 'blue', value: null }],
    'All HTTP requests in the time range.',
  ),
  stat(
    'Failed requests',
    `sum(increase(k6_http_reqs_total{testid=~"$testid",expected_response="false"}[$__range])) / sum(increase(k6_http_reqs_total${T}[$__range])) or vector(0)`,
    'percentunit',
    6,
    [green(null), amber(0.01), red(0.05)],
    'Share of responses k6 did not expect (4xx/5xx by default). The load profile fails above 5 %.',
  ),
  stat(
    'p95 response time',
    `histogram_quantile(0.95, sum(increase(k6_http_req_duration_seconds${T}[$__range])))`,
    's',
    12,
    [green(null), amber(0.5), red(0.8)],
    'Over the whole range, from native histograms: an exact percentile, not an average of averages. SLO: 800 ms.',
  ),
  stat(
    'Checks passed',
    `avg(k6_checks_rate${T})`,
    'percentunit',
    18,
    [red(null), amber(0.95), green(0.99)],
    'k6 check() results: status codes and bodies.',
  ),
  series(
    'Virtual users',
    [target(`sum(k6_vus${T})`, 'VUs')],
    'short',
    { h: 8, w: 12, x: 0, y: 4 },
    { calcs: ['max'] },
  ),
  series(
    'Requests per second, by status',
    [target(`sum by (status) (rate(k6_http_reqs_total${T}[$__rate_interval]))`, '{{status}}')],
    'reqps',
    { h: 8, w: 12, x: 12, y: 4 },
  ),
  series(
    'p95 response time by endpoint',
    [
      target(
        `histogram_quantile(0.95, sum by (name) (rate(k6_http_req_duration_seconds${T}[$__rate_interval])))`,
        '{{name}}',
      ),
    ],
    's',
    { h: 9, w: 12, x: 0, y: 12 },
    {
      thresholdLine: 0.8,
      min: 0,
      description:
        'The dashed red line is the SLO from loadtests/lib/profiles.js (p95 < 800 ms, load profile).',
    },
  ),
  series(
    'Response time percentiles, all endpoints',
    ['0.5', '0.95', '0.99'].map((q, i) =>
      target(
        `histogram_quantile(${q}, sum(rate(k6_http_req_duration_seconds${T}[$__rate_interval])))`,
        `p${Number(q) * 100}`,
        'ABC'[i],
      ),
    ),
    's',
    { h: 9, w: 12, x: 12, y: 12 },
    { thresholdLine: 0.8, min: 0 },
  ),
  series(
    'Failed requests per second, by endpoint',
    [
      target(
        `sum by (name) (rate(k6_http_reqs_total{testid=~"$testid",expected_response="false"}[$__rate_interval]))`,
        '{{name}}',
      ),
    ],
    'reqps',
    { h: 8, w: 12, x: 0, y: 21 },
    { min: 0, calcs: ['sum', 'max'] },
  ),
  series(
    'Where the time goes (p95): waiting for the server vs network',
    [
      target(
        `histogram_quantile(0.95, sum(rate(k6_http_req_waiting_seconds${T}[$__rate_interval])))`,
        'waiting (server)',
        'A',
      ),
      target(
        `histogram_quantile(0.95, sum(rate(k6_http_req_connecting_seconds${T}[$__rate_interval])))`,
        'connecting',
        'B',
      ),
      target(
        `histogram_quantile(0.95, sum(rate(k6_http_req_receiving_seconds${T}[$__rate_interval])))`,
        'receiving',
        'C',
      ),
    ],
    's',
    { h: 8, w: 12, x: 12, y: 21 },
    { min: 0 },
  ),
  series(
    'Iterations started vs dropped (open model)',
    [
      target(`sum(rate(k6_iterations_total${T}[$__rate_interval]))`, 'completed iterations/s', 'A'),
      target(
        `sum(rate(k6_dropped_iterations_total${T}[$__rate_interval])) or vector(0)`,
        'dropped iterations/s',
        'B',
      ),
    ],
    'short',
    { h: 8, w: 24, x: 0, y: 29 },
    {
      min: 0,
      calcs: ['mean', 'max'],
      description:
        'In the capacity profile k6 starts iterations at a set rate. Dropped ones mean k6 ran out of VUs: the system could not keep up.',
    },
  ),
];

const dashboard = {
  uid: 'k6-sock-shop',
  title: 'k6 load test: Sock Shop',
  description:
    'k6 → Prometheus remote write (native histograms) → Grafana. Built by scripts/build-dashboard.mjs.',
  tags: ['k6', 'load', 'sock-shop'],
  timezone: 'utc',
  schemaVersion: 39,
  version: 1,
  editable: false,
  refresh: '5s',
  time: { from: 'now-15m', to: 'now' },
  templating: {
    list: [
      {
        name: 'testid',
        label: 'Test run',
        type: 'query',
        datasource: ds,
        query: { query: 'label_values(k6_vus, testid)', refId: 'testid' },
        definition: 'label_values(k6_vus, testid)',
        refresh: 2,
        includeAll: true,
        multi: true,
        current: { text: 'All', value: '$__all' },
        sort: 2,
      },
    ],
  },
  panels,
};

writeFileSync(
  'infra/observability/grafana/dashboards/k6-sock-shop.json',
  JSON.stringify(dashboard, null, 2) + '\n',
);
console.log(`k6-sock-shop.json: ${panels.length} panels`);
