import { spawn } from 'node:child_process';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '@cluster/contracts';
import { runPlan } from '../../../../workers/render/run-plan.mjs';
import { artifactNames, type RenderPlan } from './plan';

export type StepMetric = { name: string; wall_ms: number; cpu_ms: number | null; max_rss_kib: number | null };
export type RenderJobSpec = { id: string; workdir: string; plan: RenderPlan };
export type RenderStatus = { state: 'RUNNING' } | { state: 'CANCELLED' } | { state: 'SUCCEEDED'; steps: StepMetric[] } | { state: 'FAILED'; error_code: string; detail?: string | null };
export type ArtifactName = typeof artifactNames[keyof typeof artifactNames];
// Contrato común: el worker no sabe dónde corre el render. submit es idempotente por id y fetchArtifact solo tiene sentido tras SUCCEEDED.
export type RenderProvider = {
  name: string;
  submit(job: RenderJobSpec): Promise<void>;
  status(id: string): Promise<RenderStatus>;
  cancel(id: string): Promise<void>;
  fetchArtifact(id: string, name: ArtifactName): Promise<Buffer | null>;
};
type Entry = { workdir: string; status: RenderStatus; stop: () => void };
function tracked(name: string, start: (job: RenderJobSpec, entry: Entry) => Promise<void> | void): RenderProvider {
  const jobs = new Map<string, Entry>(), known = (id: string) => { const entry = jobs.get(id); if (!entry) throw new Error('UNKNOWN_RENDER'); return entry; };
  return {
    name,
    async submit(job) {
      if (jobs.get(job.id)?.status.state === 'RUNNING') return;
      const entry: Entry = { workdir: job.workdir, status: { state: 'RUNNING' }, stop: () => undefined };
      jobs.set(job.id, entry);
      await start(job, entry);
    },
    async status(id) { return known(id).status; },
    async cancel(id) { known(id).stop(); },
    async fetchArtifact(id, artifact) {
      try { return await readFile(path.join(known(id).workdir, artifact)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    },
  };
}

export const localRenderProvider = () => tracked('local-ffmpeg', (job, entry) => {
  const controller = new AbortController();
  entry.stop = () => controller.abort();
  void runPlan(job.plan, job.workdir, { signal: controller.signal }).then(
    (steps: StepMetric[]) => { entry.status = { state: 'SUCCEEDED', steps }; },
    (error: { code?: string; detail?: string }) => { entry.status = controller.signal.aborted ? { state: 'CANCELLED' } : { state: 'FAILED', error_code: error.code ?? 'PROCESS_FAILED', detail: error.detail ?? null }; },
  );
});

export type DockerOptions = { image: string; cpus: string; memory: string; timeoutMs: number };
const containerName = (id: string) => `cve-render-${id}`;
// El contenedor solo ve su directorio de trabajo: sin red, sin capacidades, raíz de solo lectura y usuario sin privilegios.
export const dockerRunArgs = (job: Pick<RenderJobSpec, 'id' | 'workdir'>, options: DockerOptions) => ['run', '--rm', '--name', containerName(job.id), '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
  '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=256m', '--cpus', options.cpus, '--memory', options.memory, '--memory-swap', options.memory, '--pids-limit', '256', '--user', '10001:10001',
  '-v', `${path.resolve(job.workdir)}:/work`, '-w', '/work', options.image];
const docker = (args: string[]) => new Promise<number | null>(resolve => {
  const child = spawn('docker', args, { shell: false, windowsHide: true, stdio: 'ignore' });
  child.on('error', () => resolve(null));
  child.on('close', resolve);
});
export const dockerRenderProvider = (options: DockerOptions) => tracked('docker-ffmpeg', async (job, entry) => {
  let cancelled = false, timedOut = false;
  const kill = () => docker(['kill', containerName(job.id)]);
  entry.stop = () => { cancelled = true; void kill(); };
  // Un contenedor de un worker caído no debe bloquear el nombre al reintentar. El usuario del contenedor no es el del worker: necesita escribir aquí.
  await docker(['rm', '-f', containerName(job.id)]);
  await chmod(job.workdir, 0o777);
  const timer = setTimeout(() => { timedOut = true; void kill(); }, options.timeoutMs);
  void docker(dockerRunArgs(job, options)).then(async () => {
    clearTimeout(timer);
    if (cancelled) { entry.status = { state: 'CANCELLED' }; return; }
    if (timedOut) { entry.status = { state: 'FAILED', error_code: 'STEP_TIMEOUT' }; return; }
    try {
      const report = JSON.parse(await readFile(path.join(job.workdir, 'status.json'), 'utf8'));
      entry.status = report.ok ? { state: 'SUCCEEDED', steps: report.steps } : { state: 'FAILED', error_code: report.error_code, detail: report.detail };
    } catch { entry.status = { state: 'FAILED', error_code: 'CONTAINER_FAILED' }; }
  });
});

export type FakeBehaviour = { fail?: string; hold?: boolean; defect?: boolean };
const atom = (type: string, body: string) => { const data = Buffer.from(body), head = Buffer.alloc(8); head.writeUInt32BE(8 + data.length); head.write(type, 4, 'latin1'); return Buffer.concat([head, data]); };
// BLOCKED_EXTERNAL no aplica: es un doble de prueba para la cola. Su salida no es video y queda registrada como provider=fake.
export function fakeRenderProvider(behave: (job: RenderJobSpec, call: number) => FakeBehaviour = () => ({})) {
  const calls: string[] = [], held = new Map<string, () => Promise<void>>();
  const provider = tracked('fake', async (job, entry) => {
    const behaviour = behave(job, calls.length);
    calls.push(job.id);
    if (behaviour.fail) { entry.status = { state: 'FAILED', error_code: behaviour.fail }; return; }
    const finish = async () => {
      const seconds = String(behaviour.defect ? 1 : job.plan.expected_ms / 1000), frames = String(Math.round(job.plan.expected_ms * 30 / 1000));
      await writeFile(path.join(job.workdir, artifactNames.master), Buffer.concat([atom('ftyp', 'isom'), atom('moov', 'fake'), atom('mdat', `FAKE ${job.id}`)]));
      await writeFile(path.join(job.workdir, artifactNames.preview), `FAKE PREVIEW ${job.id}`);
      await writeFile(path.join(job.workdir, artifactNames.poster), `FAKE POSTER ${job.id}`);
      await writeFile(path.join(job.workdir, artifactNames.probe), JSON.stringify({ format: { duration: seconds }, streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920, avg_frame_rate: '30/1', pix_fmt: 'yuv420p', nb_frames: frames, duration: seconds },
        { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2, duration: seconds }] }));
      await writeFile(path.join(job.workdir, artifactNames.loudness), 'I: -14.0 LUFS\nPeak: -2.0 dBFS\n');
      entry.status = { state: 'SUCCEEDED', steps: [{ name: 'fake', wall_ms: 1, cpu_ms: 1000, max_rss_kib: 1 }] };
    };
    if (!behaviour.hold) return finish();
    entry.stop = () => { entry.status = { state: 'CANCELLED' }; };
    held.set(job.id, finish);
  });
  return Object.assign(provider, { calls, release: (id: string) => held.get(id)!() });
}

export function renderProviderFromEnv(env: Record<string, string | undefined>): RenderProvider {
  if (env.RENDER_BACKEND === 'docker' && env.RENDER_DOCKER_IMAGE) return dockerRenderProvider({ image: env.RENDER_DOCKER_IMAGE, cpus: env.RENDER_CPUS || '4', memory: env.RENDER_MEMORY || '3g', timeoutMs: 30 * 60000 });
  if (env.APP_ENV === 'local' && env.RENDER_BACKEND === 'local-ffmpeg') return localRenderProvider();
  if (env.APP_ENV === 'local' && env.RENDER_BACKEND === 'fake') return fakeRenderProvider();
  throw new AppError('BLOCKED_EXTERNAL', 503);
}
