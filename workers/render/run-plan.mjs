import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Única puerta de ejecución, en local y en el contenedor: solo estas herramientas, sin shell y dentro del directorio de trabajo.
const prefixes = { ffmpeg: ['-hide_banner', '-nostdin', '-y', '-nostats', '-loglevel', 'info', '-benchmark'], ffprobe: ['-hide_banner'] };
const TAIL_CHARS = 16000;

export class PlanError extends Error {
  constructor(code, step, detail = null) { super(`${code}:${step}`); this.code = code; this.step = step; this.detail = detail; }
}
// -benchmark mide CPU y memoria de cada proceso sin depender de otra herramienta.
function usage(stderr) {
  const times = /bench: utime=([\d.]+)s stime=([\d.]+)s/.exec(stderr), rss = /bench: maxrss=(\d+)/.exec(stderr);
  return { cpu_ms: times ? Math.round((Number(times[1]) + Number(times[2])) * 1000) : null, max_rss_kib: rss ? Number(rss[1]) : null };
}
function runStep(step, cwd, { signal, stepTimeoutMs }) {
  return new Promise((resolve, reject) => {
    if (!Object.hasOwn(prefixes, step.tool) || !Array.isArray(step.args) || step.args.some(arg => typeof arg !== 'string')) return reject(new PlanError('INVALID_PLAN', step.name));
    const started = performance.now();
    // FFmpeg atrapa SIGTERM, sale con código propio y puede no salir si está colgado: SIGKILL corta siempre y 'close' informa la señal.
    const child = spawn(step.tool, [...prefixes[step.tool], ...step.args], { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], signal, timeout: stepTimeoutMs, killSignal: 'SIGKILL' });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-TAIL_CHARS); });
    // Al cancelar se espera a 'close': hasta entonces el proceso retiene archivos que el worker va a borrar.
    child.on('error', error => { if (error.name !== 'AbortError') reject(new PlanError(error.code === 'ENOENT' ? 'TOOL_MISSING' : 'PROCESS_FAILED', step.name)); });
    child.on('close', (code, killedBy) => {
      if (signal?.aborted) return reject(new PlanError('CANCELLED', step.name));
      if (code !== 0) return reject(new PlanError(killedBy ? 'STEP_TIMEOUT' : 'PROCESS_FAILED', step.name, stderr.slice(-800)));
      resolve({ stdout, stderr, metric: { name: step.name, wall_ms: Math.round(performance.now() - started), ...usage(stderr) } });
    });
  });
}
export async function runPlan(plan, cwd, options = {}) {
  const metrics = [];
  for (const step of plan.steps) {
    const { stdout, stderr, metric } = await runStep(step, cwd, { signal: options.signal, stepTimeoutMs: plan.step_timeout_ms });
    if (step.stdout) await writeFile(path.join(cwd, step.stdout), stdout);
    if (step.stderr) await writeFile(path.join(cwd, step.stderr), stderr);
    metrics.push(metric);
  }
  return metrics;
}
async function main() {
  try {
    const steps = await runPlan(JSON.parse(await readFile('plan.json', 'utf8')), process.cwd());
    await writeFile('status.json', JSON.stringify({ ok: true, steps }));
  } catch (error) {
    await writeFile('status.json', JSON.stringify({ ok: false, error_code: error.code ?? 'PROCESS_FAILED', step: error.step ?? null, detail: error.detail ?? null }));
    process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
