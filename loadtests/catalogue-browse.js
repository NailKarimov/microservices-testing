// Read-only browsing load: /catalogue/size, a page of /catalogue, one sock's detail page, /tags.
// Safe to repeat indefinitely — it never writes data — so this is the tier used for the stress
// profile. Run from the repo root: `node scripts/run-k6.mjs catalogue-browse <smoke|load|stress>`.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { profile, tag } from './lib/profiles.js';

const CATALOGUE_URL = __ENV.CATALOGUE_URL || 'http://catalogue';

export const options = profile('catalogue');

export default function () {
  check(http.get(`${CATALOGUE_URL}/catalogue/size`, tag('GET /catalogue/size')), {
    '/catalogue/size → 200': (r) => r.status === 200,
  });

  const list = http.get(`${CATALOGUE_URL}/catalogue?size=20`, tag('GET /catalogue'));
  const ok = check(list, { '/catalogue → 200': (r) => r.status === 200 });

  if (ok) {
    const socks = list.json();
    if (Array.isArray(socks) && socks.length > 0) {
      const sock = socks[Math.floor(Math.random() * socks.length)];
      check(http.get(`${CATALOGUE_URL}/catalogue/${sock.id}`, tag('GET /catalogue/{id}')), {
        '/catalogue/{id} → 200': (r) => r.status === 200,
      });
    }
  }

  check(http.get(`${CATALOGUE_URL}/tags`, tag('GET /tags')), { '/tags → 200': (r) => r.status === 200 });

  // A person pauses between pages; the open-model capacity profile sets the arrival rate itself instead.
  if (__ENV.PROFILE !== 'capacity') sleep(1);
}
