import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { sha256 } from '../src/phase00/contract';
import { alignmentToCues } from '../src/phase00/subtitles';
import { assetMetadataInput, licenseInput, voiceInput } from '../src/media/contract';
import { assertPurpose, inspectFile, localObjectStore, objectKey, objectStoreFromEnv, signedObjectUrl, verifyObjectUrl } from '../src/media/objects';
import { assetIssues, contrastRatio, evaluateMedia, type AssetRow, type LicenseRow, type VoiceRow } from '../src/media/policy';
import { elevenLabsProvider, limitsFromEnv, mockTts, ttsFromEnv, TtsError } from '../src/media/tts';
import type { ScenePlan } from '../src/scripts/contract';

const rejects = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
export const pngBytes = (width = 1080, height = 1920, seed = 0) => {
  const b = Buffer.alloc(33 + 4); b.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20); b.writeUInt32BE(seed, 33);
  return new Uint8Array(b);
};
test('biblioteca: decide por los bytes, lee dimensiones y rechaza lo que no es lo que dice', () => {
  assert.deepEqual(inspectFile(pngBytes(800, 600)), { extension: 'png', kind: 'IMAGE', width: 800, height: 600 });
  const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 0, 0, 0xFF, 0xC0, 0, 17, 8, 0x07, 0x80, 0x04, 0x38, 3, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(inspectFile(jpeg), { extension: 'jpg', kind: 'IMAGE', width: 1080, height: 1920 });
  assert.equal(inspectFile(Buffer.from('%PDF-1.7 x')).kind, 'DOCUMENT');
  assert.equal(inspectFile(Buffer.from('ID3\u0004 audio')).extension, 'mp3');
  assert.equal(inspectFile(Buffer.from('\0\0\0\u0018ftypisom')).extension, 'mp4');
  assert.throws(() => inspectFile(Buffer.alloc(0)), rejects(400));
  for (const hostile of ['<html><script>alert(1)</script>', '<svg onload="x"/>', 'GIF89a..........']) assert.throws(() => inspectFile(Buffer.from(hostile)), rejects(415));
  assert.throws(() => inspectFile(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 0, 0, 0, 0, 0, 0, 0])), rejects(415));
  assert.throws(() => inspectFile(new Uint8Array(50 * 1024 * 1024 + 1)), rejects(413));
  assert.throws(() => assertPurpose('MUSIC', 'IMAGE'), rejects(415));
  assert.throws(() => assertPurpose('VISUAL', 'DOCUMENT'), rejects(415));
  assertPurpose('PROOF', 'DOCUMENT');
});
test('almacenamiento y URL firmada: sin salir de la raíz, firma ligada a la clave y caducidad', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cve-objects-'));
  try {
    const store = localObjectStore(root), org = randomUUID(), project = randomUUID(), key = objectKey(org, project, 'assets', 'a'.repeat(64), 'png');
    await store.put(key, pngBytes());
    assert.deepEqual(new Uint8Array((await store.get(key))!), pngBytes());
    assert.equal(await store.get(objectKey(org, project, 'assets', 'b'.repeat(64), 'png')), null);
    for (const bad of ['../../etc/passwd', `org/${org}/project/${project}/assets/../../x.png`, `org/${org}/project/${project}/assets/${'a'.repeat(64)}.html`]) await assert.rejects(store.get(bad), rejects(400));
    const secret = 'x'.repeat(40), now = 1000000, signed = new URL(signedObjectUrl(secret, key, now).url, 'http://x').searchParams;
    const check = (k: string, e: string, s: string, at = now) => verifyObjectUrl(secret, k, e, s, at);
    assert.equal(check(key, signed.get('expires')!, signed.get('signature')!), true);
    assert.equal(check(objectKey(org, project, 'assets', 'c'.repeat(64), 'png'), signed.get('expires')!, signed.get('signature')!), false);
    assert.equal(check(key, String(now + 99999999), signed.get('signature')!), false);
    assert.equal(check(key, signed.get('expires')!, signed.get('signature')!, now + 300001), false);
    assert.equal(check(key, signed.get('expires')!, 'abc'), false);
    assert.equal(verifyObjectUrl('y'.repeat(40), key, signed.get('expires')!, signed.get('signature')!, now), false);
    assert.throws(() => objectStoreFromEnv({ APP_ENV: 'production' }), rejects(503));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('contrato: IA exige rótulo y prompt, música exige duración, sin campos de aprobación', () => {
  const base = { name: 'Foto del puente', purpose: 'VISUAL', source_name: 'Archivo' };
  assert.equal(assetMetadataInput.safeParse(base).success, true);
  for (const bad of [{ ...base, approved: true }, { ...base, approval_status: 'APPROVED' }, { ...base, is_ai_generated: true }, { ...base, is_ai_generated: true, ai_label: 'Recreación', ai_prompt: 'Un puente' }, { ...base, purpose: 'MUSIC' }, { ...base, source_name: '' },
    { ...base, original_source_url: 'javascript:alert(1)' }, { ...base, is_ai_generated: true, ai_label: 'x{\\pos(0,0)}', ai_prompt: 'Un puente', ai_provider: 'p' }]) assert.equal(assetMetadataInput.safeParse(bad).success, false);
  assert.equal(assetMetadataInput.safeParse({ ...base, is_ai_generated: true, ai_label: 'Recreación con IA', ai_prompt: 'Un puente', ai_provider: 'proveedor' }).success, true);
  const license = { author: 'Autora', license_name: 'CC BY 4.0', license_url: 'https://a.example/l', allowed_use: 'Video comercial', commercial_use_allowed: true, attribution_required: false };
  assert.equal(licenseInput.safeParse(license).success, true);
  for (const bad of [{ ...license, license_url: null }, { ...license, attribution_required: true }, { ...license, author: '' }]) assert.equal(licenseInput.safeParse(bad).success, false);
  for (const bad of [{ voice_id: '../admin', model_id: 'm' }, { voice_id: 'a/b', model_id: 'm' }, { voice_id: 'v', model_id: 'm', settings: { speed: 9 } }]) assert.equal(voiceInput.safeParse(bad).success, false);
  assert.deepEqual(voiceInput.parse({ voice_id: 'v', model_id: 'm' }).settings, { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1, use_speaker_boost: true });
});
const license = (over: Partial<LicenseRow> = {}): LicenseRow => ({ commercial_use_allowed: true, attribution_required: false, attribution_text: null, license_url: 'https://a.example/l', proof_object_key: null, expires_at: null, ...over });
const asset = (over: Partial<AssetRow> = {}): AssetRow => ({ id: randomUUID(), object_key: 'k', content_sha256: 'a'.repeat(64), purpose: 'VISUAL', kind: 'IMAGE', approval_status: 'APPROVED', is_ai_generated: false, ai_label: null, alt_text: 'Texto alternativo', width: 1080, height: 1920, duration_ms: null, ...over });
const issueCodes = (issues: { code: string }[]) => issues.map(i => i.code);
test('derechos: sin licencia, vencida, sin uso comercial o sin atribución no se aprueba', () => {
  const now = new Date('2026-10-31T00:00:00Z'), a = asset();
  assert.deepEqual(issueCodes(assetIssues(a, [], now)), ['NO_LICENSE']);
  assert.deepEqual(issueCodes(assetIssues(a, [license()], now)), []);
  assert.deepEqual(issueCodes(assetIssues(a, [license({ expires_at: '2026-10-30T00:00:00Z' })], now)), ['LICENSE_EXPIRED']);
  assert.deepEqual(issueCodes(assetIssues(a, [license({ expires_at: '2027-01-01T00:00:00Z' })], now)), []);
  assert.deepEqual(issueCodes(assetIssues(a, [license({ commercial_use_allowed: false })], now)), ['COMMERCIAL_USE_NOT_ALLOWED']);
  assert.deepEqual(issueCodes(assetIssues(a, [license({ attribution_required: true })], now)), ['ATTRIBUTION_MISSING']);
  assert.deepEqual(issueCodes(assetIssues(a, [license({ license_url: null })], now)), ['LICENSE_WITHOUT_PROOF']);
  assert.deepEqual(issueCodes(assetIssues(a, [license(), license({ commercial_use_allowed: false })], now)), ['COMMERCIAL_USE_NOT_ALLOWED']);
  assert.deepEqual(issueCodes(assetIssues(asset({ is_ai_generated: true }), [license()], now)), ['AI_NOT_LABELLED']);
  assert.deepEqual(assetIssues(asset({ purpose: 'PROOF' }), [], now), []);
});
test('mock TTS: audio WAV válido, tiempos marcados SYNTHETIC y determinista', async () => {
  const tts = mockTts(), request = { voice_id: 'v', model_id: 'm', settings: voiceInput.parse({ voice_id: 'v', model_id: 'm' }).settings, text: 'Hola puente. Sigue el relato.' };
  const first = await tts.synthesize(request), second = await tts.synthesize(request);
  assert.equal(inspectFile(first.audio).extension, 'wav');
  assert.equal(first.timing_source, 'SYNTHETIC');
  assert.equal(first.duration_ms, request.text.length * 65);
  assert.equal(first.audio.length, 44 + Math.round(first.duration_ms * 8) * 2);
  assert.equal(Buffer.from(first.audio).compare(Buffer.from(second.audio)), 0);
  assert(Buffer.from(first.audio).subarray(44).some(byte => byte !== 0));
  const cues = alignmentToCues(first.alignment.characters, first.alignment.starts, first.alignment.ends);
  assert.deepEqual(cues.map(c => c.text), ['Hola puente.', 'Sigue el relato.']);
  assert.equal(cues.at(-1)!.end_ms, first.duration_ms);
});
test('adaptador ElevenLabs contra servidor falso: petición, coste y errores. Fuera de local queda bloqueado', async () => {
  const settings = voiceInput.parse({ voice_id: 'v', model_id: 'm' }).settings, request = { voice_id: 'voz_1', model_id: 'modelo', settings, text: 'Hola' };
  const ok = { audio_base64: Buffer.from('ID3 audio').toString('base64'), alignment: { characters: ['H', 'o', 'l', 'a'], character_start_times_seconds: [0, 0.1, 0.2, 0.3], character_end_times_seconds: [0.1, 0.2, 0.3, 0.4] } };
  const seen: { url: string; init: RequestInit }[] = [];
  const serve = (body: unknown, status = 200, headers: Record<string, string> = {}): typeof fetch => async (url, init) => { seen.push({ url: String(url), init: init! }); return new Response(JSON.stringify(body), { status, headers }); };
  const result = await elevenLabsProvider('clave-secreta', 0.3, serve(ok, 200, { 'character-cost': '7', 'request-id': 'req-1' })).synthesize(request);
  assert.equal(seen[0].url, 'https://api.elevenlabs.io/v1/text-to-speech/voz_1/with-timestamps?output_format=mp3_44100_128');
  assert.equal((seen[0].init.headers as Record<string, string>)['xi-api-key'], 'clave-secreta');
  assert.equal(seen[0].init.redirect, 'error');
  assert.deepEqual(JSON.parse(String(seen[0].init.body)), { text: 'Hola', model_id: 'modelo', voice_settings: settings });
  assert.deepEqual([result.billed_chars, result.request_id, result.duration_ms, result.timing_source, result.extension], [7, 'req-1', 400, 'PROVIDER', 'mp3']);
  assert.equal((await elevenLabsProvider('k', 0.3, serve(ok)).synthesize(request)).billed_chars, 4);
  const failure = async (fetcher: typeof fetch) => { try { await elevenLabsProvider('clave-secreta', 0.3, fetcher).synthesize(request); } catch (error) { assert(!String(error).includes('clave-secreta')); return error as TtsError; } throw new Error('no falló'); };
  const limited = await failure(serve({}, 429, { 'retry-after': '12' }));
  assert.deepEqual([limited.code, limited.retryAfterSeconds], ['RATE_LIMITED', 12]);
  assert.equal((await failure(serve({}, 401))).code, 'AUTH');
  assert.equal((await failure(serve({}, 503))).code, 'UPSTREAM');
  assert.equal((await failure(serve({}, 422))).code, 'REJECTED');
  assert.equal((await failure(serve({ audio_base64: 'x' }))).code, 'MALFORMED');
  assert.equal((await failure(async () => { throw new DOMException('timeout', 'TimeoutError'); })).code, 'NO_RESPONSE');
  for (const env of [{ APP_ENV: 'production', TTS_PROVIDER: 'mock' }, { APP_ENV: 'local' }, { APP_ENV: 'production', TTS_PROVIDER: 'elevenlabs', ELEVENLABS_API_KEY: 'k' }]) assert.throws(() => ttsFromEnv(env), rejects(503));
  assert.equal(ttsFromEnv({ APP_ENV: 'local', TTS_PROVIDER: 'mock' }).name, 'mock-elevenlabs');
  assert.equal(limitsFromEnv({}).maxUsdPerVideo, 3);
});
const scene = (text: string, sectionKey = randomUUID(), index = 0): ScenePlan => ({ key: `${sectionKey}:${index}`, section_key: sectionKey, beat: 'DEVELOPMENT', narration: text, claim_ids: [randomUUID()], duration_ms: 5000, timing: 'ESTIMATED', asset_hint: '', motion: 'zoom_in', transition: 'fade', on_screen_text: '', audio_object_key: null, visual_asset_id: null });
const voiceFor = async (text: string): Promise<VoiceRow> => {
  const audio = await mockTts().synthesize({ voice_id: 'v', model_id: 'm', settings: voiceInput.parse({ voice_id: 'v', model_id: 'm' }).settings, text });
  return { id: randomUUID(), object_key: 'k', content_sha256: 'a'.repeat(64), text_sha256: sha256(text), duration_ms: audio.duration_ms, timing_source: audio.timing_source, alignment: audio.alignment };
};
test('estado de medios: bloquea lo que falta, detecta voz obsoleta, ensambla tiempos reales y subtítulos sin deriva', async () => {
  const long = (label: string) => `${label} ${'Este fragmento ficticio describe el puente con calma y sin datos nuevos. '.repeat(3)}`.trim();
  const section = randomUUID(), scenes = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => scene(long(`Escena ${i}.`), i < 5 ? section : randomUUID(), i));
  const voices = new Map(await Promise.all(scenes.map(async s => [s.key, await voiceFor(s.narration)] as const)));
  const licensed = (over: Partial<AssetRow> = {}) => ({ ...asset(over), licenses: [license()] });
  const visuals = new Map(scenes.map(s => [s.key, licensed()]));
  const clean = evaluateMedia({ scenes, visuals, voices, music: null });
  assert.deepEqual(clean.blockers, []);
  assert.deepEqual(issueCodes(clean.warnings), scenes.map(() => 'SYNTHETIC_TIMING'));
  const audio = [...voices.values()].reduce((sum, v) => sum + v.duration_ms, 0);
  assert.equal(clean.total_ms, audio + clean.timeline.reduce((sum, t) => sum + t.pause_ms, 0));
  assert.equal(clean.timeline[0].pause_ms, 150);
  assert.equal(clean.timeline[4].pause_ms, 400);
  assert.equal(clean.timeline.at(-1)!.pause_ms, 0);
  assert.equal(clean.duration_is_estimate, false);
  // Cada cue cae dentro del tramo de audio de su escena: la suma de clips y pausas no acumula deriva.
  const stamp = (t: string) => { const [h, m, s] = t.replace(',', '.').split(':').map(Number); return Math.round((h * 3600 + m * 60 + s) * 1000); };
  const times = [...clean.captions.srt.matchAll(/(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})/g)].map(m => [stamp(m[1]), stamp(m[2])]);
  assert.equal(times.length, clean.cue_count);
  times.forEach(([start, end], i) => { assert(end > start); if (i) assert(start >= times[i - 1][1]); });
  assert.equal(times.at(-1)![1], clean.total_ms);
  for (const t of clean.timeline) assert(times.some(([start]) => start === t.start_ms));
  assert.match(clean.captions.ass, /Style: Default,Arial,44.*,110,110,340,1/);
  assert.match(clean.captions.ass, /Style: Overlay,Arial,30.*,110,110,200,1/);
  assert.equal(clean.qa.find(q => q.check === 'safe_area')!.status, 'PASS');
  assert.equal(clean.qa.find(q => q.check === 'human_visual_review')!.status, 'NEEDS_HUMAN');
  assert(contrastRatio(0xFFFFFF, 0x101010) > 15);

  const missing = evaluateMedia({ scenes, visuals: new Map(), voices: new Map(), music: null });
  assert.deepEqual([...new Set(issueCodes(missing.blockers))], ['VISUAL_MISSING', 'VOICE_MISSING', ...(missing.total_ms < 120000 ? ['DURATION_OUT_OF_RANGE'] : [])]);
  assert.equal(missing.duration_is_estimate, true);
  const edited = scenes.map((s, i) => i ? s : { ...s, narration: `${s.narration} Cambio.` });
  assert.deepEqual(issueCodes(evaluateMedia({ scenes: edited, visuals, voices, music: null }).blockers), ['VOICE_STALE']);
  const pending = new Map(visuals); pending.set(scenes[0].key, licensed({ approval_status: 'PENDING' }));
  assert.deepEqual(issueCodes(evaluateMedia({ scenes, visuals: pending, voices, music: null }).blockers), ['ASSET_NOT_APPROVED']);
  const expired = new Map(visuals); expired.set(scenes[1].key, { ...asset(), licenses: [license({ expires_at: '2020-01-01T00:00:00Z' })] });
  assert.deepEqual(issueCodes(evaluateMedia({ scenes, visuals: expired, voices, music: null }).blockers), ['LICENSE_EXPIRED']);
  const music = { ...asset({ purpose: 'MUSIC', kind: 'AUDIO', duration_ms: 90000 }), licenses: [] };
  assert.deepEqual(issueCodes(evaluateMedia({ scenes, visuals, voices, music }).blockers), ['NO_LICENSE']);
  const ai = new Map(visuals); ai.set(scenes[2].key, licensed({ is_ai_generated: true, ai_label: 'Recreación con IA' }));
  const aiState = evaluateMedia({ scenes, visuals: ai, voices, music: null });
  assert.equal(aiState.timeline[2].overlay, 'Recreación con IA');
  assert.match(aiState.captions.ass, /Overlay,,0,0,0,,Recreación con IA/);
  const same = licensed(), repeated = new Map(scenes.map(s => [s.key, same]));
  const variety = evaluateMedia({ scenes, visuals: repeated, voices, music: null });
  assert.equal(variety.qa.find(q => q.check === 'broll_variety')!.status, 'FAIL');
  assert(issueCodes(variety.warnings).includes('QA_BROLL_VARIETY'));
  const unsafe = new Map(voices); unsafe.set(scenes[0].key, { ...voices.get(scenes[0].key)!, alignment: { characters: ['{', '}'], starts: [0, 0.1], ends: [0.1, 0.2] } });
  assert(issueCodes(evaluateMedia({ scenes, visuals, voices: unsafe, music: null }).blockers).includes('CUES_INVALID'));
  if (process.env.PHASE04_EVIDENCE_DIR) {
    await mkdir(process.env.PHASE04_EVIDENCE_DIR, { recursive: true });
    await writeFile(path.join(process.env.PHASE04_EVIDENCE_DIR, 'qa-checklist.json'), JSON.stringify({ scope: 'Checklist automático con material y voz sintéticos. Falta la revisión visual de una persona y los márgenes no están verificados con Meta.', total_ms: clean.total_ms, audio_ms: audio, cue_count: clean.cue_count, timing: 'SYNTHETIC', blockers: clean.blockers, qa: clean.qa }, null, 2) + '\n');
  }
});
