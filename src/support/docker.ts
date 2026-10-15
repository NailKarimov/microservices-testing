import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const COMPOSE = ['compose', '-f', 'infra/sock-shop/docker-compose.yml'];

/** Controls the Sock Shop containers for fault-injection tests (stop/start a service by name). */
export function docker(...args: string[]): Promise<{ stdout: string; stderr: string }> {
  return run('docker', [...COMPOSE, ...args]);
}

/** Polls an HTTP URL until it answers OK, or throws once `seconds` have passed. */
export async function waitUntilUp(url: string, seconds: number): Promise<void> {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2_000) })).ok) return;
    } catch {
      /* still starting */
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`${url} did not come back within ${seconds} s`);
}
