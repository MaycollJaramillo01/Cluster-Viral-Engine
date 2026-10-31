import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '@cluster/contracts';

export type ObjectStore = { put(key: string, bytes: Uint8Array): Promise<void>; get(key: string): Promise<Uint8Array | null>; remove(key: string): Promise<void> };
const extensions = { png: 'image/png', jpg: 'image/jpeg', mp4: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', pdf: 'application/pdf' } as const;
type Extension = keyof typeof extensions;
const keyPattern = /^org\/[0-9a-f-]{36}\/project\/[0-9a-f-]{36}\/[a-z]+\/[0-9a-f]{64}(?:-[a-z]+)?\.(png|jpg|mp4|mp3|wav|pdf)$/;
export const objectKey = (organizationId: string, projectId: string, folder: string, hash: string, extension: Extension) => `org/${organizationId}/project/${projectId}/${folder}/${hash}.${extension}`;
export const contentTypeOf = (key: string) => extensions[key.split('.').at(-1) as Extension] ?? 'application/octet-stream';
export const bytesHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// Local con el mismo contrato que tendrá Blob. La clave la genera el servidor; el patrón impide salir de la raíz aunque llegue firmada por error.
export function localObjectStore(root: string): ObjectStore {
  const file = (key: string) => {
    if (!keyPattern.test(key)) throw new AppError('INVALID_INPUT', 400);
    return path.join(root, ...key.split('/'));
  };
  return {
    async put(key, bytes) {
      const target = file(key), temporary = `${target}.${randomUUID()}.tmp`;
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(temporary, bytes);
      await rename(temporary, target);
    },
    async get(key) {
      try { return await readFile(file(key)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    },
    async remove(key) { await rm(file(key), { force: true }); },
  };
}
// BLOCKED_EXTERNAL: sin token de Vercel Blob. Fuera de local no se finge almacenamiento.
export function objectStoreFromEnv(env: Record<string, string | undefined>): ObjectStore {
  if (env.APP_ENV === 'local') return localObjectStore(path.resolve(process.cwd(), '../../.local/objects'));
  throw new AppError('BLOCKED_EXTERNAL', 503);
}

const signature = (secret: string, key: string, expires: string) => createHmac('sha256', secret).update(`object-url:v1:${key}:${expires}`).digest('hex');
export function signedObjectUrl(secret: string, key: string, now = Date.now(), ttlMs = 300000) {
  const expires = String(now + ttlMs);
  return { url: `/api/objects?${new URLSearchParams({ key, expires, signature: signature(secret, key, expires) })}`, expires_at: new Date(now + ttlMs).toISOString() };
}
export function verifyObjectUrl(secret: string, key: string, expires: string, provided: string, now = Date.now()) {
  const wanted = Buffer.from(signature(secret, key, expires)), given = Buffer.from(provided);
  return Number(expires) > now && given.length === wanted.length && timingSafeEqual(wanted, given);
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
function jpegSize(b: Buffer) {
  for (let at = 2; at + 9 < b.length;) {
    if (b[at] !== 0xFF) return null;
    const marker = b[at + 1];
    if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) return { height: b.readUInt16BE(at + 5), width: b.readUInt16BE(at + 7) };
    at += 2 + b.readUInt16BE(at + 2);
  }
  return null;
}
// Se decide por los bytes: el nombre y el Content-Type que declara el cliente no cuentan. SVG y HTML quedan fuera a propósito.
export function inspectFile(bytes: Uint8Array) {
  if (!bytes.length) throw new AppError('INVALID_INPUT', 400);
  if (bytes.length > MAX_UPLOAD_BYTES) throw new AppError('INVALID_INPUT', 413);
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), text = (start: number, end: number) => b.toString('latin1', start, end);
  if (b.length > 24 && b.subarray(0, 8).equals(png) && text(12, 16) === 'IHDR') return { extension: 'png' as const, kind: 'IMAGE' as const, width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) {
    const size = jpegSize(b);
    if (!size) throw new AppError('INVALID_INPUT', 415);
    return { extension: 'jpg' as const, kind: 'IMAGE' as const, ...size };
  }
  if (text(4, 8) === 'ftyp') return { extension: 'mp4' as const, kind: 'VIDEO' as const, width: null, height: null };
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE') return { extension: 'wav' as const, kind: 'AUDIO' as const, width: null, height: null };
  if (text(0, 3) === 'ID3' || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0)) return { extension: 'mp3' as const, kind: 'AUDIO' as const, width: null, height: null };
  if (text(0, 5) === '%PDF-') return { extension: 'pdf' as const, kind: 'DOCUMENT' as const, width: null, height: null };
  throw new AppError('INVALID_INPUT', 415);
}
const kindsByPurpose = { VISUAL: ['IMAGE', 'VIDEO'], MUSIC: ['AUDIO'], SFX: ['AUDIO'], PROOF: ['DOCUMENT', 'IMAGE'] } as const;
export function assertPurpose(purpose: keyof typeof kindsByPurpose, kind: string) {
  if (!(kindsByPurpose[purpose] as readonly string[]).includes(kind)) throw new AppError('INVALID_INPUT', 415);
}
