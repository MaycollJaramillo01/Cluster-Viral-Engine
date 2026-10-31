import type { RenderManifest } from './manifest';

export type PlanStep = { name: string; tool: 'ffmpeg' | 'ffprobe'; args: string[]; stdout?: string; stderr?: string };
export type RenderPlan = { expected_ms: number; step_timeout_ms: number; inputs: { name: string; object_key: string; content_sha256: string }[]; files: Record<string, string>; steps: PlanStep[] };
export const artifactNames = { master: 'master.mp4', preview: 'preview.mp4', poster: 'poster.jpg', captions: 'captions.srt', probe: 'ffprobe.json', loudness: 'loudness.txt' } as const;

const FPS = 30, FADE_SECONDS = 0.3, MUSIC_GAIN = 0.35, STEP_TIMEOUT_MS = 20 * 60000;
// ponytail: -fs limita cada archivo y un archivo cortado no pasa la QA. El techo de disco del trabajo es el volumen donde se monta.
const CHUNK_LIMIT = String(1024 ** 3), OUTPUT_LIMIT = String(3 * 1024 ** 3);
const frameAt = (ms: number) => Math.round(ms * FPS / 1000);
const seconds = (value: number) => value.toFixed(3);
const extensionOf = (key: string) => key.split('.').at(-1)!;
// Ningún archivo de entrada puede hacer que FFmpeg abra la red.
const input = (file: string, ...before: string[]) => ['-protocol_whitelist', 'file,pipe', ...before, '-i', file];
// Cualquier proporción llena el 9:16 sin recortar el documento: la imagen entera sobre su propio fondo desenfocado.
const FIT = 'split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2[back];[fg]scale=1080:1920:force_original_aspect_ratio=decrease[front];[back][front]overlay=(W-w)/2:(H-h)/2,setsar=1';
const AUDIO_FORMAT = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
// ponytail: loudnorm de una pasada; la QA acepta -14 ±2 LU. Pasar a dos si con voz real se sale del margen o se oye el bombeo.
const MASTERING = 'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000';

// Movimiento discreto: docs/09 pide no exagerar. Duplicar el lienzo reduce el temblor de zoompan, que solo admite posiciones enteras.
function kenBurns(motion: RenderManifest['scenes'][number]['motion'], frames: number) {
  const last = Math.max(frames - 1, 1), centered = 'iw/2-iw/zoom/2';
  const move = { zoom_in: { z: `1+0.06*on/${last}`, x: centered }, zoom_out: { z: `1.06-0.06*on/${last}`, x: centered },
    pan_left: { z: '1.1', x: `(iw-iw/zoom)*(1-on/${last})` }, pan_right: { z: '1.1', x: `(iw-iw/zoom)*on/${last}` } }[motion];
  return `scale=2160:3840,zoompan=z='${move.z}':x='${move.x}':y='ih/2-ih/zoom/2':d=${frames}:s=1080x1920:fps=${FPS}`;
}
export function buildPlan(manifest: RenderManifest, options: { threads: number }): RenderPlan {
  const threads = String(options.threads), { scenes } = manifest, total = seconds(manifest.total_ms / 1000);
  const inputs: RenderPlan['inputs'] = [], stored = (name: string, item: { object_key: string; content_sha256: string }) => {
    const file = `inputs/${name}.${extensionOf(item.object_key)}`;
    inputs.push({ name: file, object_key: item.object_key, content_sha256: item.content_sha256 });
    return file;
  };
  // Los cortes salen de la línea de tiempo absoluta: el redondeo a fotogramas no se acumula y audio y video cortan en el mismo punto.
  const cuts = scenes.map(scene => { const start = frameAt(scene.start_ms), end = frameAt(scene.start_ms + scene.audio_ms + scene.pause_ms); return { frames: end - start, duration: (end - start) / FPS }; });
  const sceneSteps: PlanStep[] = scenes.map((scene, index) => {
    const { frames, duration } = cuts[index], file = stored(`s${index}`, scene.visual), isVideo = scene.visual.kind === 'VIDEO';
    const fades = duration > 2 * FADE_SECONDS ? [
      ...(scene.transition === 'fade' ? [`fade=t=in:st=0:d=${FADE_SECONDS}`] : []),
      ...(index === scenes.length - 1 || scenes[index + 1].transition === 'fade' ? [`fade=t=out:st=${seconds(duration - FADE_SECONDS)}:d=${FADE_SECONDS}`] : []),
    ] : [];
    // Un clip más corto que su escena se congela en el último fotograma. Con -stream_loop, un archivo sin fotogramas decodificables giraba hasta el tiempo límite.
    const chain = [isVideo ? `fps=${FPS},tpad=stop_mode=clone:stop=-1` : kenBurns(scene.motion, frames), ...fades, 'format=yuv420p'].join(',');
    return { name: `scene-${index}`, tool: 'ffmpeg', args: [...input(file),
      '-filter_complex', `[0:v]${FIT},${chain}[v]`, '-map', '[v]', '-frames:v', String(frames), '-an',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-threads', threads, '-fs', CHUNK_LIMIT, `scene-${index}.mp4`] };
  });
  const voices = scenes.map((scene, index) => stored(`v${index}`, scene.voice));
  const voiceGraph = scenes.map((_, index) => `[${index}:a]${AUDIO_FORMAT},apad=whole_dur=${seconds(cuts[index].duration)},atrim=duration=${seconds(cuts[index].duration)},asetpts=PTS-STARTPTS[a${index}]`).join(';') +
    `;${scenes.map((_, index) => `[a${index}]`).join('')}concat=n=${scenes.length}:v=0:a=1[voice]`;
  // Repeticiones contadas: un archivo sin audio no hace girar a FFmpeg. Si la duración declarada no es real, la música acaba antes y lo juzga el revisor.
  const music = manifest.music ? input(stored('music', manifest.music), '-stream_loop', String(Math.ceil(manifest.total_ms / manifest.music.duration_ms))) : [], totalSeconds = manifest.total_ms / 1000;
  // La narración comprime la música mientras suena y el nivel se mide al final, sobre la mezcla completa.
  const mix = manifest.music
    ? `[1:a]asplit=2[voice][key];[2:a]${AUDIO_FORMAT},volume=${MUSIC_GAIN},afade=t=out:st=${seconds(Math.max(totalSeconds - 2, 0))}:d=2[bed];[bed][key]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[ducked];[voice][ducked]amix=inputs=2:duration=first:normalize=0,${MASTERING}[a]`
    : `[1:a]${MASTERING}[a]`;
  const posterAt = manifest.title ? 1.5 : scenes[0].audio_ms / 2000;
  return {
    expected_ms: manifest.total_ms, step_timeout_ms: STEP_TIMEOUT_MS, inputs,
    files: { 'concat.txt': scenes.map((_, index) => `file 'scene-${index}.mp4'`).join('\n') + '\n', 'captions.ass': manifest.captions.ass, 'captions.srt': manifest.captions.srt },
    steps: [
      ...sceneSteps,
      { name: 'concat', tool: 'ffmpeg', args: ['-f', 'concat', '-safe', '1', ...input('concat.txt'), '-c', 'copy', '-fs', OUTPUT_LIMIT, 'joined.mp4'] },
      // ponytail: una entrada por escena; con el máximo de 120 el comando ronda 24 KB, dentro del límite de Windows (32 KB). Una prueba lo vigila.
      { name: 'narration', tool: 'ffmpeg', args: [...voices.flatMap(file => input(file)), '-filter_complex', voiceGraph, '-map', '[voice]', '-c:a', 'pcm_s16le', '-ar', '48000', '-fs', CHUNK_LIMIT, 'narration.wav'] },
      { name: 'master', tool: 'ffmpeg', args: [...input('joined.mp4'), ...input('narration.wav'), ...music,
        '-filter_complex', `[0:v]ass=captions.ass,fps=${FPS},format=yuv420p[v];${mix}`, '-map', '[v]', '-map', '[a]', '-t', total,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-profile:v', 'high', '-g', String(FPS * 2), '-threads', threads,
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-map_metadata', '-1', '-movflags', '+faststart', '-fs', OUTPUT_LIMIT, artifactNames.master] },
      { name: 'preview', tool: 'ffmpeg', args: [...input(artifactNames.master), '-vf', 'scale=540:960', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-threads', threads, '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', artifactNames.preview] },
      { name: 'poster', tool: 'ffmpeg', args: [...input(artifactNames.master, '-ss', seconds(posterAt)), '-frames:v', '1', '-q:v', '3', '-update', '1', artifactNames.poster] },
      { name: 'probe', tool: 'ffprobe', args: ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', artifactNames.master], stdout: artifactNames.probe },
      // framelog=verbose deja fuera de este nivel de log las líneas por fotograma y conserva el resumen.
      { name: 'loudness', tool: 'ffmpeg', args: [...input(artifactNames.master), '-map', '0:a', '-af', 'ebur128=peak=true:framelog=verbose', '-f', 'null', '-'], stderr: artifactNames.loudness },
    ],
  };
}
