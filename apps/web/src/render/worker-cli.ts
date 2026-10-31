import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { objectStoreFromEnv } from '../media/objects';
import { getRuntimePool } from '../server/database';
import { renderProviderFromEnv } from './provider';
import { runWorker } from './worker';

async function main() {
  loadEnvConfig(process.cwd());
  const provider = renderProviderFromEnv(process.env), store = objectStoreFromEnv(process.env), pool = getRuntimePool();
  // ponytail: un directorio por worker (RENDER_WORK_ROOT). Al arrancar borra lo que dejó una caída; dos workers no pueden compartirlo.
  const workRoot = path.resolve(process.env.RENDER_WORK_ROOT || path.join(process.cwd(), '../../.local/render-work'));
  await rm(workRoot, { recursive: true, force: true });
  await mkdir(workRoot, { recursive: true });
  const stop = new AbortController();
  // La primera señal deja terminar el render en curso; la segunda sale y el lease vencido lo recupera otro worker.
  for (const name of ['SIGINT', 'SIGTERM'] as const) process.on(name, () => { if (stop.signal.aborted) process.exit(130); stop.abort(); });
  const threads = Number(process.env.RENDER_THREADS) || 4, workerId = `${os.hostname()}-${process.pid}`;
  await runWorker({ pool, store, provider, workerId, workRoot, threads, log: event => console.log(JSON.stringify({ at: new Date().toISOString(), ...event })) }, stop.signal, { once: process.argv.includes('--once') });
  await pool.end();
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'RENDER_WORKER_FAILED'); process.exitCode = 1; });
