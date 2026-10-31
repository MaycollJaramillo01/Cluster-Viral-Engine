import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { renderManifestSchema } from './manifest';
import { artifactNames, buildPlan } from './plan';
import { dockerRenderProvider, localRenderProvider, type RenderProvider, type StepMetric } from './provider';
import { evaluateOutput } from './qa';
import { decodablePng, stereoTone, syntheticClip, syntheticManifest } from './synthetic';

const scenarios = [{ seconds: 120, assets: 10, scenes: 20 }, { seconds: 120, assets: 30, scenes: 30 }, { seconds: 120, assets: 60, scenes: 60 }, { seconds: 240, assets: 10, scenes: 40 }, { seconds: 240, assets: 30, scenes: 40 }, { seconds: 240, assets: 60, scenes: 60 }];
const percentile = (values: number[], share: number) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * share) - 1)];
const summary = (values: number[]) => ({ p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: Math.max(...values) });
const wait = async (provider: RenderProvider, id: string) => {
  for (;;) {
    const status = await provider.status(id);
    if (status.state !== 'RUNNING') return status;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
};
// Una parte de cada fase por separado: dice dónde se va el tiempo si hay que decidir mover el trabajo.
const byPhase = (steps: StepMetric[]) => {
  const phases: Record<string, number> = {};
  for (const step of steps) { const phase = step.name.startsWith('scene-') ? 'scenes' : step.name; phases[phase] = (phases[phase] ?? 0) + step.wall_ms; }
  return phases;
};
async function main() {
  const { values } = parseArgs({ options: { iterations: { type: 'string', default: '10' }, out: { type: 'string' }, provider: { type: 'string', default: 'local' }, threads: { type: 'string', default: '4' }, image: { type: 'string', default: 'cve-render:local' } } });
  const iterations = Number(values.iterations), threads = Number(values.threads), out = path.resolve(values.out ?? 'benchmark.json'), org = randomUUID(), project = randomUUID();
  const provider = values.provider === 'docker' ? dockerRenderProvider({ image: values.image, cpus: String(threads), memory: '3g', timeoutMs: 30 * 60000 }) : localRenderProvider();
  const tool = values.provider === 'docker' ? spawnSync('docker', ['run', '--rm', '--entrypoint', 'ffmpeg', values.image, '-version'], { encoding: 'utf8' }) : spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  const report = { generated_at: new Date().toISOString(), provider: provider.name, threads, iterations,
    machine: { cpu: os.cpus()[0].model, logical_cores: os.cpus().length, memory_gb: Math.round(os.totalmem() / 1024 ** 3), platform: `${os.platform()} ${os.release()}` }, ffmpeg: tool.stdout.split('\n')[0],
    note: 'Material sintético: imágenes con grano, 20 % de clips, tono como voz y como música. La voz real en MP3 añade decodificación. Functions de Vercel: BLOCKED_EXTERNAL, no medido. Coste monetario: null, sin worker facturado.',
    monetary_cost_usd: null as number | null, scenarios: [] as unknown[] };
  // Cada imagen se genera una vez: el benchmark mide el render, no el generador.
  const images = Array.from({ length: 60 }, (_, i) => i % 2 ? decodablePng(i, 1600, 1200) : decodablePng(i, 1080, 1920)), clip = syntheticClip(6);
  for (const scenario of scenarios) {
    const audio = Math.floor(scenario.seconds * 1000 / scenario.scenes), visualAt = (i: number) => i % scenario.assets;
    const { manifest, objects } = syntheticManifest({ organizationId: org, projectId: project, title: 'Título sintético de benchmark', music: stereoTone(30, 440), scenes: Array.from({ length: scenario.scenes }, (_, i) => {
      const clipScene = visualAt(i) % 5 === 4;
      return { audio_ms: i === scenario.scenes - 1 ? scenario.seconds * 1000 - audio * (scenario.scenes - 1) : audio, visual: clipScene ? clip : images[visualAt(i)], kind: clipScene ? 'VIDEO' as const : 'IMAGE' as const };
    }) });
    renderManifestSchema.parse(manifest);
    const plan = buildPlan(manifest, { threads }), runs = [], failures: { iteration: number; error: string }[] = [];
    let ffprobe: unknown = null;
    for (let iteration = 1; iteration <= iterations; iteration++) {
      const id = randomUUID(), workdir = path.join(os.tmpdir(), `cve-bench-${id}`);
      await mkdir(path.join(workdir, 'inputs'), { recursive: true });
      try {
        for (const item of plan.inputs) await writeFile(path.join(workdir, item.name), objects.get(item.object_key)!);
        for (const [name, text] of Object.entries(plan.files)) await writeFile(path.join(workdir, name), text);
        await writeFile(path.join(workdir, 'plan.json'), JSON.stringify(plan));
        const started = performance.now();
        await provider.submit({ id, workdir, plan });
        const status = await wait(provider, id), wall_ms = Math.round(performance.now() - started);
        if (status.state !== 'SUCCEEDED') throw new Error(`RENDER_${status.state}:${JSON.stringify(status)}`);
        const probe = JSON.parse(await readFile(path.join(workdir, artifactNames.probe), 'utf8'));
        ffprobe ??= probe;
        const qa = evaluateOutput({ probe, loudness: await readFile(path.join(workdir, artifactNames.loudness), 'utf8'), master: await readFile(path.join(workdir, artifactNames.master)), expectedMs: plan.expected_ms });
        // Nada se borra hasta el final, así que el directorio terminado es el pico de disco del trabajo.
        const work_bytes = (await Promise.all((await readdir(workdir, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => stat(path.join(entry.parentPath, entry.name))))).reduce((sum, file) => sum + file.size, 0);
        runs.push({ iteration, wall_ms, cpu_ms: status.steps.reduce((sum, step) => sum + (step.cpu_ms ?? 0), 0), max_rss_kib: Math.max(...status.steps.map(step => step.max_rss_kib ?? 0)), output_bytes: (await stat(path.join(workdir, artifactNames.master))).size, work_bytes, qa_failed: qa.checks.filter(c => c.status === 'FAIL').map(c => c.check), phases_ms: byPhase(status.steps) });
        console.log(JSON.stringify({ ...scenario, iteration, wall_ms, qa_passed: qa.passed }));
      } catch (error) {
        // La tasa de fallos es parte de lo que se mide: un fallo se anota y la serie sigue.
        failures.push({ iteration, error: (error as Error).message.slice(0, 500) });
        console.log(JSON.stringify({ ...scenario, iteration, failed: true }));
      } finally { await rm(workdir, { recursive: true, force: true, maxRetries: 5 }); }
    }
    report.scenarios.push({ ...scenario, runs_count: runs.length, failures, wall_ms: summary(runs.map(r => r.wall_ms)), cpu_ms: summary(runs.map(r => r.cpu_ms)), max_rss_kib: summary(runs.map(r => r.max_rss_kib)), output_bytes: summary(runs.map(r => r.output_bytes)), work_bytes: summary(runs.map(r => r.work_bytes)), all_qa_passed: runs.every(r => !r.qa_failed.length), ffprobe, runs });
    await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'BENCHMARK_FAILED'); process.exitCode = 1; });
