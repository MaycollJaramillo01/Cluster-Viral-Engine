import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { AppError } from '@cluster/contracts';
import { inspectFile } from '../src/media/objects';
import { manifestJsonSchema, renderManifestSchema, type RenderManifest } from '../src/render/manifest';
import { artifactNames, buildPlan, type RenderPlan } from '../src/render/plan';
import { dockerRenderProvider, dockerRunArgs, fakeRenderProvider, localRenderProvider, renderProviderFromEnv } from '../src/render/provider';
import { evaluateOutput, isFaststart, parseLoudness } from '../src/render/qa';
import { decodablePng, stereoTone, syntheticClip, syntheticManifest, type SyntheticScene } from '../src/render/synthetic';
import { runPlan } from '../../../workers/render/run-plan.mjs';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const DOCKER_IMAGE = process.env.RENDER_TEST_DOCKER_IMAGE || 'cve-render:local';
const hasDocker = spawnSync('docker', ['image', 'inspect', DOCKER_IMAGE], { stdio: 'ignore' }).status === 0;
const org = '11111111-1111-4111-8111-111111111111', project = '22222222-2222-4222-8222-222222222222';
const visual = (i: number) => Buffer.from(`visual-${i}`);
const valid = (over: Partial<SyntheticScene> = {}, count = 20) => syntheticManifest({ organizationId: org, projectId: project, title: 'Título válido', music: Buffer.from('musica'),
  scenes: Array.from({ length: count }, (_, i) => ({ audio_ms: 6000, pause_ms: i === count - 1 ? 0 : 100, visual: visual(i), ...over })) }).manifest;
const clone = (manifest: RenderManifest): RenderManifest => structuredClone(manifest);
const change = (mutate: (m: RenderManifest) => void) => { const copy = clone(valid()); mutate(copy); return renderManifestSchema.safeParse(copy).success; };
const allArgs = (plan: RenderPlan) => plan.steps.flatMap(step => step.args);
const materialize = async (plan: RenderPlan, objects: Map<string, Uint8Array>, directory: string) => {
  await mkdir(path.join(directory, 'inputs'), { recursive: true });
  for (const item of plan.inputs) await writeFile(path.join(directory, item.name), objects.get(item.object_key)!);
  for (const [name, text] of Object.entries(plan.files)) await writeFile(path.join(directory, name), text);
  await writeFile(path.join(directory, 'plan.json'), JSON.stringify(plan));
};
const bandLevel = (file: string, start: number, seconds: number) => {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', String(start), '-t', String(seconds), '-i', file, '-af', 'highpass=f=700,highpass=f=700,volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  return Number(/mean_volume: (-?[\d.]+) dB/.exec(run.stderr)![1]);
};
const qaFiles = async (directory: string, plan: RenderPlan) => evaluateOutput({
  probe: JSON.parse(await readFile(path.join(directory, artifactNames.probe), 'utf8')), loudness: await readFile(path.join(directory, artifactNames.loudness), 'utf8'), master: await readFile(path.join(directory, artifactNames.master)), expectedMs: plan.expected_ms });
const failed = (report: ReturnType<typeof evaluateOutput>) => report.checks.filter(c => c.status === 'FAIL').map(c => c.check);
// La QA tolera ±1 fotograma por archivo; el plan no debe perder ninguno, porque cada clip suma.
const assertExactFrames = async (directory: string, plan: RenderPlan) => {
  const { streams } = JSON.parse(await readFile(path.join(directory, artifactNames.probe), 'utf8')) as { streams: { codec_type: string; nb_frames: string }[] };
  assert.equal(Number(streams.find(s => s.codec_type === 'video')!.nb_frames), Math.round(plan.expected_ms * 30 / 1000));
};
// El contenedor se abre, pero ningún fotograma se decodifica: pasa el control por bytes de la subida.
const undecodable = (clip: Uint8Array) => {
  const copy = Buffer.from(clip);
  for (let at = 0, size = 0; at + 8 <= copy.length; at += size) {
    size = copy.readUInt32BE(at);
    if (copy.toString('latin1', at + 4, at + 8) === 'mdat') return copy.fill(0xFF, at + 8, at + size);
  }
  throw new Error('NO_MDAT');
};

test('manifest: válido, estricto y atado a organización, tiempos y formato', () => {
  assert.equal(renderManifestSchema.safeParse(valid()).success, true);
  assert.equal(change(m => { Object.assign(m, { approved: true }); }), false);
  assert.equal(change(m => { Object.assign(m.scenes[0], { command: 'rm -rf /' }); }), false);
  assert.equal(change(m => { m.format.width = 720 as 1080; }), false);
  assert.equal(change(m => { m.scenes[1].start_ms += 1; }), false);
  assert.equal(change(m => { m.total_ms += 1; }), false);
  assert.equal(change(m => { m.scenes.at(-1)!.pause_ms = 100; m.total_ms += 100; }), false);
  assert.equal(change(m => { m.scenes[1].key = m.scenes[0].key; }), false);
  assert.equal(change(m => { m.scenes[0].visual.object_key = m.scenes[0].visual.object_key.replace(org, randomUUID()); }), false);
  assert.equal(change(m => { m.scenes[0].visual.object_key = '../../secreto.png'; }), false);
  assert.equal(change(m => { m.scenes[0].visual.kind = 'VIDEO'; }), false);
  assert.equal(change(m => { m.scenes[0].voice.object_key = m.scenes[0].visual.object_key; }), false);
  assert.equal(change(m => { m.scenes[0].visual.content_sha256 = 'x'; }), false);
  assert.equal(change(m => { m.scenes[0].visual.is_ai_generated = true; }), false);
  assert.equal(change(m => { m.title = 'Inyección {\\pos(0,0)}'; }), false);
  assert.equal(change(m => { m.scenes[0].overlay = 'Otra\nlínea'; }), false);
  assert.equal(renderManifestSchema.safeParse(valid({ audio_ms: 1000 })).success, false, 'menos de 120 s');
  assert.equal(renderManifestSchema.safeParse(valid({ audio_ms: 13000 })).success, false, 'más de 240 s');
});
test('el esquema publicado coincide con el contrato', async () => {
  assert.deepEqual(JSON.parse(await readFile('../../schemas/render-manifest.schema.json', 'utf8')), manifestJsonSchema());
});
test('plan: fotogramas exactos, solo rutas relativas y ningún texto de usuario en la línea de comandos', () => {
  const manifest = syntheticManifest({ organizationId: org, projectId: project, title: 'TITULOUNICO', music: Buffer.from('musica'), scenes: [
    { audio_ms: 3333, pause_ms: 167, visual: visual(1), overlay: 'ROTULOUNICO' }, { audio_ms: 4441, pause_ms: 333, visual: visual(2), kind: 'VIDEO' }, { audio_ms: 2011, visual: visual(3) }] }).manifest;
  const plan = buildPlan(manifest, { threads: 3 }), args = allArgs(plan);
  const frames = plan.steps.filter(s => s.name.startsWith('scene-')).map(s => Number(s.args[s.args.indexOf('-frames:v') + 1]));
  assert.equal(frames.reduce((a, b) => a + b, 0), Math.round(manifest.total_ms * 30 / 1000));
  assert.deepEqual(frames, [105, 143, 61], 'cortes redondeados sobre la línea absoluta: 3500, 8274 y 10285 ms');
  assert(!args.some(arg => /^[a-zA-Z]:[\\/]|^\/|\.\./.test(arg)), 'ruta absoluta o ascendente');
  assert(!args.some(arg => /TITULOUNICO|ROTULOUNICO|Subtítulo/.test(arg)));
  assert.match(plan.files['captions.ass'], /TITULOUNICO/);
  assert.match(plan.files['captions.ass'], /\{\\fad\(300,300\)\}TITULOUNICO/);
  assert.match(plan.files['captions.ass'], /Overlay,,0,0,0,,ROTULOUNICO/);
  for (const step of plan.steps.filter(s => s.tool === 'ffmpeg')) assert.equal(step.args.filter(a => a === '-protocol_whitelist').length, step.args.filter(a => a === '-i').length, step.name);
  assert.deepEqual(plan.inputs.map(i => i.name), ['inputs/s0.png', 'inputs/s1.mp4', 'inputs/s2.png', 'inputs/v0.wav', 'inputs/v1.wav', 'inputs/v2.wav', 'inputs/music.wav']);
  const step = (name: string) => plan.steps.find(s => s.name === name)!, graph = (name: string) => step(name).args[step(name).args.indexOf('-filter_complex') + 1];
  assert.match(graph('scene-0'), /zoompan=/);
  assert.doesNotMatch(graph('scene-1'), /zoompan=/);
  // -t en la entrada perdía un fotograma por clip en FFmpeg 5.1, y -stream_loop -1 giraba con un archivo sin nada que decodificar.
  assert(!step('scene-1').args.includes('-stream_loop') && !step('scene-1').args.includes('-t'));
  assert.match(graph('scene-1'), /tpad=stop_mode=clone/);
  assert.equal(step('master').args[step('master').args.indexOf('-stream_loop') + 1], '4', 'repeticiones contadas: 10285 ms con música de 3000 ms');
  assert.match(graph('master'), /sidechaincompress=.*loudnorm=I=-14:TP=-1.5/);
  assert(step('master').args.includes('+faststart'));
  assert(step('preview').args.includes('scale=540:960'));
  assert.equal(step('poster').args[step('poster').args.indexOf('-ss') + 1], '1.500');
  assert.equal(step('master').args[step('master').args.indexOf('-threads') + 1], '3');
  const silent = buildPlan({ ...manifest, music: null, title: null }, { threads: 1 }), master = silent.steps.find(s => s.name === 'master')!;
  assert.doesNotMatch(master.args[master.args.indexOf('-filter_complex') + 1], /sidechaincompress/);
  // Con el máximo de escenas, ningún comando se acerca al límite de Windows.
  const largest = buildPlan(syntheticManifest({ organizationId: org, projectId: project, scenes: Array.from({ length: 120 }, (_, i) => ({ audio_ms: 1900, pause_ms: 100, visual: visual(i) })) }).manifest, { threads: 4 });
  assert(Math.max(...largest.steps.map(s => s.args.join(' ').length)) < 30000);
});
test('ejecutor: solo FFmpeg y ffprobe, sin shell', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cve-plan-'));
  try {
    for (const tool of ['sh', 'cmd', 'rm', 'node', 'ffmpeg.exe', '../ffmpeg', 'constructor', '__proto__']) await assert.rejects(runPlan({ steps: [{ name: 'x', tool, args: ['-version'] }] }, directory), /INVALID_PLAN/, tool);
    await assert.rejects(runPlan({ steps: [{ name: 'x', tool: 'ffmpeg', args: ['-version', 1] }] }, directory), /INVALID_PLAN/);
    await assert.rejects(runPlan({ steps: [{ name: 'x', tool: 'ffmpeg', args: 'version' }] }, directory), /INVALID_PLAN/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('QA: cada defecto se detecta y lo humano queda como pendiente', () => {
  const atom = (type: string) => { const head = Buffer.alloc(8); head.writeUInt32BE(8); head.write(type, 4, 'latin1'); return head; };
  const fast = Buffer.concat([atom('ftyp'), atom('moov'), atom('mdat')]), slow = Buffer.concat([atom('ftyp'), atom('mdat'), atom('moov')]);
  assert.equal(isFaststart(fast), true); assert.equal(isFaststart(slow), false); assert.equal(isFaststart(Buffer.alloc(0)), false);
  const good = { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920, avg_frame_rate: '30/1', pix_fmt: 'yuv420p', sample_aspect_ratio: '1:1', nb_frames: '3600', duration: '120.000' };
  const sound = { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2, duration: '120.010' };
  const log = '  I:         -14.1 LUFS\n  Peak:       -2.0 dBFS\n';
  const check = (video = {}, audio = {}, loudness = log, master: Uint8Array = fast, format = { duration: '120.010' }) => evaluateOutput({ probe: { format, streams: [{ ...good, ...video }, { ...sound, ...audio }] }, loudness, master, expectedMs: 120000 });
  assert.equal(check().passed, true);
  assert.deepEqual(check().needs_human, ['subtitle_legibility', 'motion_quality', 'visual_variety', 'audible_mix']);
  assert.deepEqual(parseLoudness(`I: -20.0 LUFS\n${log}`), { integrated_lufs: -14.1, true_peak_dbfs: -2 });
  const cases: [string, ReturnType<typeof check>][] = [
    ['video_codec', check({ codec_name: 'hevc' })], ['audio_codec', check({}, { codec_name: 'mp3' })], ['resolution', check({ width: 720 })], ['sample_aspect', check({ sample_aspect_ratio: '4:3' })],
    ['frame_rate', check({ avg_frame_rate: '25/1' })], ['pixel_format', check({ pix_fmt: 'yuv444p' })], ['duration', check({}, {}, log, fast, { duration: '130.000' })], ['frame_count', check({ nb_frames: '3500' })],
    ['av_sync', check({}, { duration: '121.000' })], ['audio_layout', check({}, { channels: 1 })], ['faststart', check({}, {}, log, slow)],
    ['loudness', check({}, {}, '  I:         -23.0 LUFS\n  Peak:       -2.0 dBFS\n')], ['no_clipping', check({}, {}, '  I:         -14.0 LUFS\n  Peak:        0.2 dBFS\n')], ['loudness', check({}, {}, '')],
  ];
  for (const [name, report] of cases) { assert.equal(report.passed, false, name); assert(failed(report).includes(name), name); }
  assert.equal(evaluateOutput({ probe: {}, loudness: '', master: slow, expectedMs: 120000 }).passed, false);
});
test('Docker: aislado por argumentos; sin secretos ni red', () => {
  const args = dockerRunArgs({ id: 'abc', workdir: path.join(tmpdir(), 'trabajo') }, { image: 'imagen:1', cpus: '2', memory: '1g', timeoutMs: 1000 }), joined = args.join(' ');
  for (const flag of ['--network none', '--cap-drop ALL', '--security-opt no-new-privileges', '--read-only', '--pids-limit 256', '--user 10001:10001', '--memory 1g', '--memory-swap 1g', '--cpus 2', '--name cve-render-abc', '--rm']) assert(joined.includes(flag), flag);
  assert.equal(args.filter(a => a === '-v').length, 1);
  assert(!args.some(a => /^(-e|--env|--env-file|--privileged)$/.test(a)));
  assert.equal(args.at(-1), 'imagen:1');
});
test('proveedor: fuera de lo configurado queda BLOCKED_EXTERNAL; el doble no se usa fuera de local', () => {
  const blocked = (env: Record<string, string>) => assert.throws(() => renderProviderFromEnv(env), (error: unknown) => error instanceof AppError && error.code === 'BLOCKED_EXTERNAL', JSON.stringify(env));
  blocked({}); blocked({ APP_ENV: 'local' }); blocked({ APP_ENV: 'local', RENDER_BACKEND: 'external-worker' }); blocked({ RENDER_BACKEND: 'docker' });
  blocked({ APP_ENV: 'production', RENDER_BACKEND: 'fake' }); blocked({ APP_ENV: 'production', RENDER_BACKEND: 'local-ffmpeg' }); blocked({ RENDER_BACKEND: 'fake' });
  assert.equal(renderProviderFromEnv({ APP_ENV: 'local', RENDER_BACKEND: 'fake' }).name, 'fake');
  assert.equal(renderProviderFromEnv({ APP_ENV: 'local', RENDER_BACKEND: 'local-ffmpeg' }).name, 'local-ffmpeg');
  assert.equal(renderProviderFromEnv({ RENDER_BACKEND: 'docker', RENDER_DOCKER_IMAGE: 'imagen:1' }).name, 'docker-ffmpeg');
  assert.equal(fakeRenderProvider().name, 'fake');
});
test('FFmpeg real: encuadre, imagen, video, música, título, subtítulos, control de calidad y mezcla medida', { skip: !hasFfmpeg }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cve-render-'));
  try {
    const { manifest, objects } = syntheticManifest({ organizationId: org, projectId: project, title: 'Título de prueba', music: stereoTone(3, 1000), scenes: [
      { audio_ms: 3000, pause_ms: 2000, visual: decodablePng(1, 1600, 900), transition: 'cut' },
      { audio_ms: 2000, pause_ms: 200, visual: syntheticClip(1), kind: 'VIDEO', transition: 'fade', overlay: 'Recreación generada con IA' },
      { audio_ms: 2300, visual: decodablePng(2, 900, 1600), transition: 'fade' }] });
    const plan = buildPlan(manifest, { threads: 4 });
    await materialize(plan, objects, directory);
    const steps = await runPlan(plan, directory);
    assert.deepEqual(steps.map((s: { name: string }) => s.name), plan.steps.map(s => s.name));
    assert(steps.filter((s: { name: string }) => s.name !== 'probe').every((s: { cpu_ms: number | null; max_rss_kib: number | null }) => s.cpu_ms !== null && s.max_rss_kib! > 0));
    const report = await qaFiles(directory, plan);
    assert.deepEqual(failed(report), [], JSON.stringify(report.checks));
    await assertExactFrames(directory, plan);
    const inspect = async (name: string) => (JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', name], { cwd: directory, encoding: 'utf8' }).stdout).streams as { codec_type: string; width?: number; height?: number }[]);
    const preview = (await inspect(artifactNames.preview)).find(s => s.codec_type === 'video')!;
    assert.deepEqual([preview.width, preview.height], [540, 960]);
    assert.deepEqual(inspectFile(await readFile(path.join(directory, artifactNames.poster))), { extension: 'jpg', kind: 'IMAGE', width: 1080, height: 1920 });
    assert(isFaststart(await readFile(path.join(directory, artifactNames.preview))));
    // La música (1 kHz) debe bajar mientras suena la voz (220 Hz) y volver en la pausa. Se mide sobre el archivo final, no se supone.
    const master = path.join(directory, artifactNames.master), underVoice = bandLevel(master, 1, 1.5), inPause = bandLevel(master, 4, 0.8);
    assert(inPause - underVoice >= 6, `música bajo la voz ${underVoice} dB, en pausa ${inPause} dB`);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('FFmpeg real: material sin nada que decodificar termina enseguida en vez de girar hasta el tiempo límite', { skip: !hasFfmpeg }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cve-broken-'));
  const planFor = async (scenes: SyntheticScene[], music?: Uint8Array) => {
    const { manifest, objects } = syntheticManifest({ organizationId: org, projectId: project, scenes, music }), plan = { ...buildPlan(manifest, { threads: 2 }), step_timeout_ms: 30000 };
    await materialize(plan, objects, directory);
    return plan;
  };
  try {
    const broken = await planFor([{ audio_ms: 1000, visual: undecodable(syntheticClip(1)), kind: 'VIDEO' }]);
    await assert.rejects(runPlan(broken, directory), (error: { code: string; step: string }) => error.code === 'PROCESS_FAILED' && error.step === 'scene-0');
    const silent = await planFor([{ audio_ms: 1000, visual: decodablePng(1, 900, 1600) }], stereoTone(0, 440));
    await runPlan(silent, directory);
    assert.deepEqual(failed(await qaFiles(directory, silent)), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('FFmpeg real: un archivo con defectos no pasa y el ejecutor informa cancelación y tiempo agotado', { skip: !hasFfmpeg }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cve-defect-'));
  try {
    const bad = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=720x1280:r=24:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv444p', '-c:a', 'mp3', 'defecto.mp4'], { cwd: directory });
    assert.equal(bad.status, 0);
    const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', 'defecto.mp4'], { cwd: directory, encoding: 'utf8' }).stdout);
    const report = evaluateOutput({ probe, loudness: '', master: await readFile(path.join(directory, 'defecto.mp4')), expectedMs: 120000 });
    for (const name of ['audio_codec', 'resolution', 'frame_rate', 'pixel_format', 'duration', 'frame_count', 'faststart', 'loudness', 'no_clipping']) assert(failed(report).includes(name), name);
    const endless = { name: 'infinito', tool: 'ffmpeg', args: ['-f', 'lavfi', '-i', 'testsrc=s=64x64:r=10', '-f', 'null', '-'] };
    await assert.rejects(runPlan({ step_timeout_ms: 300, steps: [endless] }, directory), (error: { code: string }) => error.code === 'STEP_TIMEOUT');
    await assert.rejects(runPlan({ steps: [{ name: 'roto', tool: 'ffmpeg', args: ['-i', 'no-existe.mp4', '-f', 'null', '-'] }] }, directory), (error: { code: string; step: string }) => error.code === 'PROCESS_FAILED' && error.step === 'roto');
    const controller = new AbortController(), running = runPlan({ steps: [endless] }, directory, { signal: controller.signal });
    setTimeout(() => controller.abort(), 200);
    await assert.rejects(running, (error: { code: string }) => error.code === 'CANCELLED');
    // Cancelar devuelve el control con el proceso ya terminado: el directorio se puede borrar enseguida también en Windows.
    await rm(directory, { recursive: true });
    const provider = localRenderProvider(), work = await mkdtemp(path.join(tmpdir(), 'cve-local-'));
    await provider.submit({ id: 'c1', workdir: work, plan: { expected_ms: 1, step_timeout_ms: 60000, inputs: [], files: {}, steps: [endless as RenderPlan['steps'][number]] } });
    assert.equal((await provider.status('c1')).state, 'RUNNING');
    await provider.cancel('c1');
    for (let i = 0; i < 200 && (await provider.status('c1')).state === 'RUNNING'; i++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal((await provider.status('c1')).state, 'CANCELLED');
    await rm(work, { recursive: true });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('contenedor real: aislado de verdad, renderiza y se cancela', { skip: !hasDocker }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cve-docker-')), id = randomUUID(), options = { image: DOCKER_IMAGE, cpus: '4', memory: '3g', timeoutMs: 300000 };
  try {
    // Lo mismo que recibe el trabajo real, cambiando solo el programa: comprueba lo que el proceso puede hacer desde dentro.
    const base = dockerRunArgs({ id: `probe-${id}`, workdir: directory }, options).slice(0, -1);
    const shell = (script: string) => spawnSync('docker', [...base, '--entrypoint', 'sh', DOCKER_IMAGE, '-c', script], { encoding: 'utf8' });
    const net = `require('net').connect({host:'1.1.1.1',port:53,timeout:2000}).on('connect',()=>console.log('RED')).on('error',e=>console.log(e.code)).on('timeout',()=>console.log('TIMEOUT'))`;
    const probe = shell(`echo "uid=$(id -u)"; touch /app/x 2>/dev/null && echo app=escribe || echo app=denegado; touch /usr/x 2>/dev/null && echo usr=escribe || echo usr=denegado; touch /work/ok && echo work=escribe; echo "memory=$(cat /sys/fs/cgroup/memory.max)"; echo "pids=$(cat /sys/fs/cgroup/pids.max)"; grep CapEff /proc/self/status; ls /sys/class/net | tr '\\n' ' '; echo; node -e "${net}"; env | grep -ci 'database\\|secret\\|token' || true`);
    assert.equal(probe.status, 0, probe.stderr);
    const lines = probe.stdout.trim().split('\n');
    assert(lines.includes('uid=10001') && lines.includes('app=denegado') && lines.includes('usr=denegado') && lines.includes('work=escribe'), probe.stdout);
    assert(lines.includes(`memory=${3 * 1024 ** 3}`) && lines.includes('pids=256'), probe.stdout);
    assert.match(probe.stdout, /CapEff:\s+0{16}/);
    assert.equal(lines.find(line => line.startsWith('lo'))?.trim(), 'lo', probe.stdout);
    assert.match(probe.stdout, /ENETUNREACH|EHOSTUNREACH/);
    assert.doesNotMatch(probe.stdout, /^RED$/m);
    assert.equal(lines.at(-1), '0', 'variables con credenciales dentro del contenedor');
    if (process.env.PHASE05_EVIDENCE_DIR) await writeFile(path.join(process.env.PHASE05_EVIDENCE_DIR, 'docker-isolation.txt'), `$ docker ${base.join(' ').replace(directory, '<workdir>')} ${DOCKER_IMAGE}\n${probe.stdout}`);
    await rm(path.join(directory, 'ok'));

    const { manifest, objects } = syntheticManifest({ organizationId: org, projectId: project, title: 'Título de prueba', music: stereoTone(3, 1000), scenes: [{ audio_ms: 2500, pause_ms: 200, visual: decodablePng(3, 1600, 900) }, { audio_ms: 2300, visual: syntheticClip(1), kind: 'VIDEO' }] });
    const plan = buildPlan(manifest, { threads: 4 }), provider = dockerRenderProvider(options), wait = async (job: string) => {
      for (let i = 0; i < 2400; i++) { const status = await provider.status(job); if (status.state !== 'RUNNING') return status; await new Promise(resolve => setTimeout(resolve, 100)); }
      throw new Error('TIMEOUT');
    };
    await materialize(plan, objects, directory);
    await provider.submit({ id, workdir: directory, plan });
    const done = await wait(id);
    assert.equal(done.state, 'SUCCEEDED', JSON.stringify(done));
    assert.deepEqual(failed(await qaFiles(directory, plan)), []);
    await assertExactFrames(directory, plan);
    assert((await provider.fetchArtifact(id, artifactNames.poster))!.length > 1000);

    // Con el FFmpeg de producción: el clip sin fotogramas falla en vez de girar hasta el tiempo límite.
    const brokenId = randomUUID(), broken = syntheticManifest({ organizationId: org, projectId: project, scenes: [{ audio_ms: 1000, visual: undecodable(syntheticClip(1)), kind: 'VIDEO' }] }), brokenPlan = { ...buildPlan(broken.manifest, { threads: 2 }), step_timeout_ms: 30000 };
    await materialize(brokenPlan, broken.objects, directory);
    await provider.submit({ id: brokenId, workdir: directory, plan: brokenPlan });
    assert.equal(await wait(brokenId).then(status => status.state === 'FAILED' && status.error_code), 'PROCESS_FAILED');

    const endless = { ...plan, steps: [{ name: 'infinito', tool: 'ffmpeg' as const, args: ['-f', 'lavfi', '-i', 'testsrc=s=64x64:r=10', '-f', 'null', '-'] }] }, other = randomUUID();
    await writeFile(path.join(directory, 'plan.json'), JSON.stringify(endless));
    await provider.submit({ id: other, workdir: directory, plan: endless });
    for (let i = 0; i < 100 && spawnSync('docker', ['ps', '-q', '--filter', `name=cve-render-${other}`], { encoding: 'utf8' }).stdout.trim() === ''; i++) await new Promise(resolve => setTimeout(resolve, 100));
    await provider.cancel(other);
    assert.equal((await wait(other)).state, 'CANCELLED');
    assert.equal(spawnSync('docker', ['ps', '-aq', '--filter', `name=cve-render-${other}`], { encoding: 'utf8' }).stdout.trim(), '');
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5 }); }
});
