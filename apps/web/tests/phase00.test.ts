import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { manifestSchema, manifestJsonSchema, validateManifest, sha256 } from '../src/phase00/contract';
import { subtitles, alignmentToCues } from '../src/phase00/subtitles';
import { containedFile, durationVariant, execute } from '../src/phase00/render';
import { MockMetaProvider, MockTtsProvider, editorialBlockers, ttsCacheKey } from '../src/phase00/providers';
import { benchmarkReport, costReport, phaseGate, ticketIds } from '../src/phase00/reports';
import fixture from '../../../fixtures/phase00/valid-manifest.json';
import costs from '../../../fixtures/phase00/costs.json';

const org = fixture.organization_id;
test('manifest válido, JSON Schema independiente y esquema versionado sin deriva', async () => {
  const m = validateManifest(fixture, org);
  assert.equal(m.scenes.reduce((n,s)=>n+s.duration_ms,0),120000);
  const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
  const validate = ajv.compile(manifestJsonSchema());
  assert.equal(validate(fixture),true,JSON.stringify(validate.errors));
  assert.equal(validate({ ...fixture, approved: true }),false);
  const invalid = JSON.parse(await readFile('../../fixtures/phase00/invalid-manifest.json','utf8'));
  assert.equal(validate(invalid),false);
  assert.throws(() => validateManifest(invalid,org));
  assert.deepEqual(JSON.parse(await readFile('../../schemas/phase00-manifest.schema.json','utf8')), manifestJsonSchema());
});
test('tenant, referencias, timing, derechos, duplicados y campos extra rechazados', () => {
  assert.throws(()=>validateManifest(fixture,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),/FORBIDDEN/);
  for (const [mutate, expected] of [
    [(m: typeof fixture)=>{m.scenes[1].start_ms++;},/TIMELINE/],
    [(m: typeof fixture)=>{m.scenes[0].visual_asset_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';},/REFERENCE/],
    [(m: typeof fixture)=>{m.scenes[0].subtitle_segments[0].end_ms=99999;},/CUE/],
    [(m: typeof fixture)=>{m.scenes[1].id=m.scenes[0].id;},/DUPLICATE/],
    [(m: typeof fixture)=>{m.assets[0].license='UNKNOWN';},/RIGHTS/],
  ] as const) { const copy=structuredClone(fixture); mutate(copy); assert.throws(()=>validateManifest(copy,org),expected); }
  assert.throws(()=>manifestSchema.parse({...fixture,approved:true}));
  const short=structuredClone(fixture); short.scenes=short.scenes.slice(0,1); assert.throws(()=>validateManifest(short,org));
});
test('hash canónico y clave TTS incluyen organización, voz y ajustes', () => {
  assert.equal(sha256({b:2,a:1}),sha256({a:1,b:2}));
  const key=ttsCacheKey(org,'Hola','voice','model',{speed:1});
  assert.notEqual(key,ttsCacheKey('other','Hola','voice','model',{speed:1}));
  assert.notEqual(key,ttsCacheKey(org,'Hola','voice2','model',{speed:1}));
  assert.notEqual(key,ttsCacheKey(org,'Hola','voice','model',{speed:2}));
});
test('mocks permanecen bloqueados; dry-run distingue REEL y PAGE_VIDEO y rechaza hash antiguo', async () => {
  const tts=await new MockTtsProvider().synthesize(org,'Texto','voz');
  assert.equal(tts.status,'BLOCKED_EXTERNAL'); assert.equal(tts.actual_cost_usd,null); assert.equal(tts.remote_id,null);
  const meta=new MockMetaProvider();
  for (const kind of ['PAGE_VIDEO','REEL'] as const) {
    const result=await meta.dryRun(fixture,org,sha256(fixture),kind);
    assert.equal(result.kind,kind); assert.equal(result.status,'BLOCKED_EXTERNAL'); assert.equal(result.editorial_ready,false);
  }
  await assert.rejects(meta.dryRun(fixture,org,'0'.repeat(64),'REEL'),/STALE_RENDER_HASH/);
  await assert.rejects(new MockTtsProvider().synthesize(org,'','voz'),/INVALID_TTS/);
  assert(editorialBlockers(validateManifest(fixture,org)).length>10);
});
test('subtítulos usan offsets absolutos, zona segura y alineación inválida se rechaza', () => {
  const result=subtitles(validateManifest(fixture,org));
  assert.match(result.srt,/00:00:15,000/); assert.match(result.ass,/110,110,340/);
  assert.deepEqual(alignmentToCues(['H','i','.'],[0,0.1,0.2],[0.1,0.2,0.3]),[{start_ms:0,end_ms:300,text:'Hi.'}]);
  assert.throws(()=>alignmentToCues(['a'],[],[]),/INVALID_ALIGNMENT/);
  assert.throws(()=>alignmentToCues(['a','b'],[0,0.05],[0.1,0.2]),/INVALID_ALIGNMENT/);
  const four=durationVariant(validateManifest(fixture,org),240);
  assert.equal(validateManifest(four,org).scenes[7].start_ms,210000);
});
test('rutas fuera del directorio y errores de proceso no se presentan como éxito', async () => {
  const base=await mkdtemp(path.join(os.tmpdir(),'cve-poc-'));
  try { await mkdir(path.join(base,'assets')); await writeFile(path.join(base,'external.png'),'x');
    await assert.rejects(containedFile(path.join(base,'assets'),'../external.png'),/UNSAFE_ASSET_PATH/);
    await assert.rejects(execute(process.execPath,['-e','process.exit(4)']),/PROCESS_FAILED/);
  } finally { await rm(base,{recursive:true,force:true}); }
});
test('p50/p95 medidos y n insuficiente; Vercel ausente no tiene latencia inventada', () => {
  const samples=Array.from({length:10},(_,i)=>({provider:'local',duration_seconds:120,wall_ms:(i+1)*100,
    cpu_ms_sampled:100,peak_rss_bytes_sampled:1000,artifact_sha256:'a'.repeat(64),actual_cost_usd:null}));
  const report=benchmarkReport(samples);
  assert.equal(report[0].p50_ms,500); assert.equal(report[0].p95_ms,1000); assert.equal(report[0].status,'MEASURED');
  assert.equal(report[2].status,'BLOCKED_EXTERNAL'); assert.equal(report[2].p95_ms,null);
  assert.equal(benchmarkReport(samples.slice(0,1))[0].status,'INSUFFICIENT_SAMPLES');
});
test('costes desconocidos propagan null; proyecciones reales incluyen fijos', () => {
  const partial=costReport(costs,null); assert.equal(partial.projection_30_usd,null); assert.equal(partial.budget_verified,false);
  const complete=costs.map(r=>({...r,actual_usd:0.1}));
  assert(Math.abs(costReport(complete,10).projection_30_usd!-28)<0.0001);
  assert.throws(()=>costReport(complete.slice(1),10));
});
test('gate exige doce tickets, evidencias y aceptación; publicación siempre deshabilitada', () => {
  const rows=ticketIds.map(ticket=>({ticket,status:'VERIFIED',evidence:[{path:'test',sha256:'a'.repeat(64)}],
    accepted_by:org,accepted_at:'2026-10-30T00:00:00Z',notes:'Unit test data; no aceptación real'}));
  assert.equal(phaseGate(rows,{client:null,editorial:null,technical:null}).decision,'NO_GO');
  const signed={client:'test',editorial:'test',technical:'test'};
  assert.equal(phaseGate(rows,signed).publication_enabled,false);
  rows[3].status='BLOCKED_EXTERNAL'; assert.equal(phaseGate(rows,signed).decision,'NO_GO');
  assert.throws(()=>phaseGate([...rows.slice(0,11),rows[0]],signed),/DUPLICATE_TICKET/);
});
