import 'dotenv/config';

/** Reads a variable from the environment (or .env) and falls back to a default. */
function read(name: string, fallback = ''): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

/** Test environment settings. Nothing here is secret. */
export const env = {
  /** Sock Shop microservices started by infra/sock-shop/docker-compose.yml (one port per service). */
  sockShop: (() => {
    const host = read('SOCKSHOP_HOST', 'http://localhost');
    const bareHost = host.replace(/^https?:\/\//, '');
    return {
      gateway: `${host}:8081`,
      payment: `${host}:8082`,
      catalogue: `${host}:8083`,
      carts: `${host}:8084`,
      orders: `${host}:8085`,
      shipping: `${host}:8086`,
      user: `${host}:8087`,
      // RabbitMQ (orders publishes to the `shipping-task` queue; no consumer runs in this compose).
      amqp: `amqp://guest:guest@${bareHost}:5672`,
    };
  })(),
  /** In CI a missing Sock Shop stack must fail the run instead of silently skipping its tests. */
  requireStack: read('REQUIRE_STACK') === '1',
};
