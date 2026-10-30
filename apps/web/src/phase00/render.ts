import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { validateManifest, sha256, type Manifest } from './contract';
import { subtitles } from './subtitles';

export function execute(executable: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = '';
    const timer = setTimeout(() => child.kill(), 20 * 60000);
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-100000); });
    child.stderr.on('data', chunk => { error = (error + chunk).slice(-8000); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(`PROCESS_FAILED:${executable}:${code}:${error}`)); });
  });
}
export const fileHash = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');
export async function containedFile(root: string, key: string): Promise<string> {
  const base = await realpath(root), file = await realpath(path.resolve(base, key));
  const relative = path.relative(base, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('UNSAFE_ASSET_PATH');
  if (!/\.(png|jpg|jpeg|webp)$/i.test(file)) throw new Error('UNSUPPORTED_ASSET');
  return file;
}
export function durationVariant(m: Manifest, seconds: 120 | 240): Manifest {
  const copy = structuredClone(m), factor = seconds * 1000 / m.scenes.reduce((n, s) => n + s.duration_ms, 0);
  for (const s of copy.scenes) {
    s.start_ms *= factor; s.duration_ms *= factor;
    for (const c of s.subtitle_segments) { c.start_ms *= factor; c.end_ms *= factor; }
  }
  return copy;
}
export async function probe(file: string, durationSeconds: number) {
  const result = JSON.parse(await execute('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
  const video = result.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  const audio = result.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
  if (video?.width !== 1080 || video?.height !== 1920 || video?.avg_frame_rate !== '30/1'
    || video?.codec_name !== 'h264' || video?.pix_fmt !== 'yuv420p' || audio?.codec_name !== 'aac'
    || Math.abs(Number(result.format.duration) - durationSeconds) > 0.2) throw new Error('OUTPUT_PROBE_FAILED');
  return result;
}
export async function renderLocal(input: unknown, org: string, assetRoot: string, out: string, repoRoot: string) {
  const manifest = validateManifest(input, org);
  const duration = manifest.scenes.reduce((n, s) => n + s.duration_ms, 0) / 1000;
  const paths = new Map<string, string>(), hashes: Record<string, string> = {};
  for (const a of manifest.assets) { const f = await containedFile(assetRoot, a.object_key); paths.set(a.id, f); hashes[a.id] = await fileHash(f); }
  const ffmpegVersion = (await execute('ffmpeg', ['-version'])).split(/\r?\n/)[0];
  const sourceHashes = Object.fromEntries(await Promise.all([
    'apps/web/src/phase00/render.ts', 'apps/web/src/phase00/contract.ts', 'apps/web/src/phase00/subtitles.ts', 'workers/render/measure_process.py',
  ].map(async key => [key, await fileHash(path.join(repoRoot, key))])));
  const inputHash = sha256({ manifest, hashes, ffmpegVersion, sourceHashes, renderer: 'phase00-2-ultrafast-crf23' });
  const destination = path.resolve(out), artifact = path.join(destination, 'poc.mp4');
  await mkdir(destination, { recursive: true });
  const lock = path.join(destination, '.render-lock');
  try { await mkdir(lock); } catch { throw new Error('RENDER_ALREADY_RUNNING'); }
  try {
    let previous: { input_sha256: string; artifact_sha256: string } | undefined;
    try { previous = JSON.parse(await readFile(path.join(destination, 'evidence.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (previous) {
      if (previous.input_sha256 !== inputHash || previous.artifact_sha256 !== await fileHash(artifact)) throw new Error('IDEMPOTENCY_CONFLICT');
      await probe(artifact, duration);
      return { ...previous, reused: true };
    }
    const started = new Date().toISOString(), t = performance.now();
    const subs = subtitles(manifest);
    await writeFile(path.join(destination, 'captions.srt'), subs.srt);
    await writeFile(path.join(destination, 'captions.ass'), subs.ass);
    await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const measurements: { wall_ms: number; cpu_ms_sampled: number; peak_rss_bytes_sampled: number }[] = [];
    const measured = async (name: string, args: string[]) => {
      const metricsFile = path.join(destination, `${name}.metrics.json`);
      await execute('python', [path.join(repoRoot, 'workers/render/measure_process.py'), metricsFile, 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], destination);
      measurements.push(JSON.parse(await readFile(metricsFile, 'utf8')));
    };
    for (const [i, s] of manifest.scenes.entries()) {
      const frames = s.duration_ms * 30 / 1000, seconds = s.duration_ms / 1000;
      const zoom = s.motion === 'zoom_out' ? `1.08-0.08*on/${frames}` : `1+0.08*on/${frames}`;
      const x = s.motion === 'pan_left' ? `(iw-iw/zoom)*(1-on/${frames})` : s.motion === 'pan_right' ? `(iw-iw/zoom)*on/${frames}` : '(iw-iw/zoom)/2';
      const filters = `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,zoompan=z='${zoom}':x='${x}':y='(ih-ih/zoom)/2':d=${frames}:s=1080x1920:fps=30` +
        (s.transition === 'fade' ? `,fade=t=in:st=0:d=0.25,fade=t=out:st=${seconds - 0.25}:d=0.25` : '');
      await measured(`scene-${i}`, ['-i', paths.get(s.visual_asset_id)!, '-vf', filters, '-frames:v', String(frames),
        '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-threads', '2', '-pix_fmt', 'yuv420p', `scene-${i}.mp4`]);
    }
    await writeFile(path.join(destination, 'concat.txt'), manifest.scenes.map((_, i) => `file 'scene-${i}.mp4'`).join('\n'));
    await measured('concat', ['-f', 'concat', '-safe', '1', '-i', 'concat.txt', '-c', 'copy', 'joined.mp4']);
    // Silent track explicitly marked on every original asset. Not a successful TTS call.
    await measured('mux', ['-i', 'joined.mp4', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-vf', 'ass=captions.ass',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', String(duration), '-movflags', '+faststart', 'poc.mp4']);
    const result = { status: 'TECHNICAL_RENDER_ONLY', input_sha256: inputHash, manifest_sha256: sha256(manifest),
      artifact_sha256: await fileHash(artifact), organization_id: org, project_id: manifest.project_id,
      started_at: started, finished_at: new Date().toISOString(), wall_ms: Math.round(performance.now() - t),
      cpu_ms_sampled: measurements.reduce((n, m) => n + m.cpu_ms_sampled, 0),
      peak_rss_bytes_sampled: Math.max(...measurements.map(m => m.peak_rss_bytes_sampled)),
      duration_seconds: duration, assets: hashes, source_hashes: sourceHashes, ffmpeg_version: ffmpegVersion,
      tts_status: 'BLOCKED_EXTERNAL', subtitle_alignment: 'ESTIMATED_FIXTURE_TIMING', editorial_review: 'PENDING',
      actual_cost_usd: null, probe: await probe(artifact, duration) };
    await writeFile(path.join(destination, 'evidence.json'), JSON.stringify(result, null, 2));
    await writeFile(path.join(destination, 'audit.jsonl'), [
      { action: 'LOCAL_RENDER_STARTED', at: started, org, input_sha256: inputHash, actor: 'local-poc-operator' },
      { action: 'LOCAL_RENDER_FINISHED', at: result.finished_at, org, artifact_sha256: result.artifact_sha256 },
    ].map(e => JSON.stringify(e)).join('\n') + '\n');
    return { ...result, reused: false };
  } catch (error) {
    await writeFile(path.join(destination, 'failure.json'), JSON.stringify({ status: 'FAILED', input_sha256: inputHash, at: new Date().toISOString(), reason: String(error) }, null, 2));
    throw error;
  } finally { await rm(lock, { recursive: true }); }
}
