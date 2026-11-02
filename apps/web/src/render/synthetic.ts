import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { toAss, toSrt } from '../media/captions';
import { bytesHash, objectKey } from '../media/objects';
import { toneWav } from '../media/tts';
import { motions } from '../scripts/contract';
import type { RenderManifest } from './manifest';

// Solo pruebas y benchmark: material que FFmpeg decodifica de verdad. No es contenido real, no sirve como muestra editorial ni mide calidad.
const chunk = (type: string, data: Buffer) => {
  const size = Buffer.alloc(4), check = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  size.writeUInt32BE(data.length); check.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, check]);
};
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
// Degradado con grano: el ruido evita que el codificador lo tenga más fácil que con una fotografía.
export function decodablePng(seed: number, width = 1080, height = 1920) {
  const stride = width * 3 + 1, raw = Buffer.alloc(stride * height), header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  let noise = Math.imul(seed + 1, 2654435761) || 1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    noise ^= noise << 13; noise ^= noise >>> 17; noise ^= noise << 5;
    const at = y * stride + 1 + x * 3, grain = noise & 31;
    raw[at] = (x * 200 / width + seed * 40 + grain) & 255;
    raw[at + 1] = (y * 200 / height + grain) & 255;
    raw[at + 2] = ((x + y) * 120 / (width + height) + seed * 90 + grain) & 255;
  }
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}
export function syntheticClip(seconds = 6) {
  const directory = mkdtempSync(path.join(tmpdir(), 'cve-clip-')), file = path.join(directory, 'clip.mp4');
  try {
    const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=s=1280x720:r=30:d=${seconds}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file]);
    if (run.status !== 0) throw new Error('CLIP_FAILED');
    return readFileSync(file);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
export function stereoTone(seconds: number, hz: number) {
  const rate = 44100, samples = seconds * rate, out = Buffer.alloc(44 + samples * 4);
  out.write('RIFF', 0); out.writeUInt32LE(36 + samples * 4, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(samples * 4, 40);
  for (let i = 0; i < samples; i++) { const value = Math.round(8000 * Math.sin(2 * Math.PI * hz * i / rate)); out.writeInt16LE(value, 44 + i * 4); out.writeInt16LE(value, 46 + i * 4); }
  return out;
}
export type SyntheticScene = { audio_ms: number; pause_ms?: number; visual: Uint8Array; kind?: 'IMAGE' | 'VIDEO'; overlay?: string | null; transition?: 'cut' | 'fade' };
// Devuelve también los bytes por clave: quien lo use decide si van a un almacén o directo al directorio de trabajo.
export function syntheticManifest(input: { organizationId: string; projectId: string; scenes: SyntheticScene[]; music?: Uint8Array | null; title?: string | null }) {
  const objects = new Map<string, Uint8Array>(), { organizationId: org, projectId: project } = input;
  const keep = (folder: string, bytes: Uint8Array, extension: 'png' | 'mp4' | 'wav') => {
    const content_sha256 = bytesHash(bytes), object_key = objectKey(org, project, folder, content_sha256, extension);
    objects.set(object_key, bytes);
    return { object_key, content_sha256 };
  };
  const cues: { start_ms: number; end_ms: number; text: string }[] = [], overlays: typeof cues = [];
  let clock = 0;
  const scenes = input.scenes.map((scene, index) => {
    const start_ms = clock, pause_ms = scene.pause_ms ?? 0;
    clock += scene.audio_ms + pause_ms;
    for (let at = 0; at < scene.audio_ms; at += 2400) cues.push({ start_ms: start_ms + at, end_ms: start_ms + Math.min(at + 2400, scene.audio_ms), text: `Subtítulo sintético de prueba ${cues.length + 1}` });
    if (scene.overlay) overlays.push({ start_ms, end_ms: start_ms + scene.audio_ms, text: scene.overlay });
    return { key: `escena:${index}`, start_ms, audio_ms: scene.audio_ms, pause_ms, claim_ids: [], motion: motions[index % motions.length], transition: scene.transition ?? (index % 3 === 0 ? 'fade' : 'cut'), overlay: scene.overlay ?? null,
      visual: { ...keep('assets', scene.visual, scene.kind === 'VIDEO' ? 'mp4' : 'png'), asset_id: randomUUID(), kind: scene.kind ?? 'IMAGE', is_ai_generated: Boolean(scene.overlay) },
      voice: { ...keep('voice', toneWav(scene.audio_ms), 'wav'), generation_id: randomUUID(), timing_source: 'SYNTHETIC' as const } };
  });
  const title = input.title ?? null;
  const manifest: RenderManifest = {
    schema_version: 1, organization_id: org, project_id: project, script_version: 1, script_sha256: 'a'.repeat(64), format: { width: 1080, height: 1920, fps: 30 }, title, total_ms: clock, scenes,
    music: input.music ? { ...keep('assets', input.music, 'wav'), asset_id: randomUUID(), duration_ms: 3000 } : null,
    captions: { srt: toSrt(cues), ass: toAss(cues, overlays, title ? [{ start_ms: 0, end_ms: 3500, text: title }] : []) }, credits: [],
  };
  return { manifest, objects };
}
