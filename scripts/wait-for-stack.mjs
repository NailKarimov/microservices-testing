// Waits until every Sock Shop service answers, so tests do not start against half-started containers.
const host = process.env.SOCKSHOP_HOST ?? 'http://localhost';
const targets = {
  payment: `${host}:8082/health`,
  catalogue: `${host}:8083/health`,
  carts: `${host}:8084/health`,
  orders: `${host}:8085/health`,
  shipping: `${host}:8086/health`,
  user: `${host}:8087/health`,
  gateway: `${host}:8081/catalogue?size=1`,
};
const deadline = Date.now() + 5 * 60_000;

async function up(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(3_000) })).ok;
  } catch {
    return false;
  }
}

let pending = Object.keys(targets);
while (pending.length && Date.now() < deadline) {
  const results = await Promise.all(pending.map(async (name) => [name, await up(targets[name])]));
  pending = results.filter(([, ok]) => !ok).map(([name]) => name);
  if (pending.length) await new Promise((r) => setTimeout(r, 3_000));
}

if (pending.length) {
  console.error(`Sock Shop is not ready after 5 minutes. Still down: ${pending.join(', ')}`);
  process.exit(1);
}
console.log('Sock Shop is ready: all 7 endpoints answer.');
