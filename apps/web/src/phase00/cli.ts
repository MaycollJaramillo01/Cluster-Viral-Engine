import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestJsonSchema, validateManifest, sha256 } from './contract';
import { renderLocal, durationVariant, fileHash } from './render';
import { MockMetaProvider, MockTtsProvider, editorialBlockers } from './providers';
import { benchmarkReport, costReport, phaseGate, type Sample } from './reports';
import { Phase00Store } from './store';
import { Pool } from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const argv = process.argv.slice(2), command = argv[0];
function option(name: string, fallback: string) { const i = argv.indexOf(`--${name}`); return i < 0 ? fallback : argv[i + 1]; }
const out = path.resolve(option('out', path.join(root, 'workers/render/out/phase00')));
const json = async (f: string) => JSON.parse(await readFile(f, 'utf8'));
async function save(name: string, value: unknown) { await mkdir(out, { recursive: true }); await writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n'); }

async function main() {
  if (command === 'schema') {
    await writeFile(path.join(root, 'schemas/phase00-manifest.schema.json'), JSON.stringify(manifestJsonSchema(), null, 2) + '\n');
    console.log('Schema generated'); return;
  }
  const raw = await json(path.resolve(option('manifest', path.join(root, 'fixtures/phase00/valid-manifest.json'))));
  const org = option('org', raw.organization_id), m = validateManifest(raw, org);
  if (command === 'validate') { console.log(JSON.stringify({ status: 'VALID_TECHNICAL_FIXTURE', manifest_sha256: sha256(m), publication_enabled: false })); return; }
  if (command === 'reports') {
    const costs = costReport(await json(path.join(root, 'fixtures/phase00/costs.json')), null);
    const evidence = await json(path.join(root, 'fixtures/phase00/gate.json'));
    for (const ticket of evidence) for (const item of ticket.evidence) {
      const file = path.resolve(root, item.path);
      const relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative) || await fileHash(file) !== item.sha256) throw new Error('EVIDENCE_HASH_MISMATCH');
    }
    const gate = phaseGate(evidence, { client: null, editorial: null, technical: null });
    const tts = await new MockTtsProvider().synthesize(org, m.scenes.map(s => s.narration).join(' '), 'LATAM_PENDING_SELECTION');
    const meta = await Promise.all((['PAGE_VIDEO', 'REEL'] as const).map(kind => new MockMetaProvider().dryRun(m, org, sha256(m), kind)));
    await save('costs.json', costs); await save('gate.json', gate); await save('meta-dry-run.json', meta); await save('tts.json', tts);
    await save('editorial-blockers.json', editorialBlockers(m));
    console.log(JSON.stringify({ gate, tts: tts.status, meta: meta.map(v => ({ kind: v.kind, status: v.status })) })); return;
  }
  if (command !== 'render' && command !== 'benchmark') throw new Error('Usage: npm run poc -- schema|validate|reports|render|benchmark [--org UUID] [--out PATH] [--runs 10] [--seconds 120|240]');
  const assets = path.resolve(option('assets', path.join(root, 'workers/render/out/dataset')));
  if (command === 'render') {
    const seconds = Number(option('seconds', '120'));
    if (seconds !== 120 && seconds !== 240) throw new Error('SECONDS_MUST_BE_120_OR_240');
    const variant = durationVariant(m, seconds);
    const dbUrl = process.env.PHASE00_DATABASE_URL;
    const pool = dbUrl ? new Pool({ connectionString: dbUrl }) : null;
    const store = pool ? new Phase00Store(pool) : null;
    const principal = { organizationId: org, actorId: process.env.PHASE00_ACTOR_ID ?? '' };
    let id: string | undefined;
    try {
      if (store) {
        const key = option('key', '');
        if (!key) throw new Error('DATABASE_MODE_REQUIRES_KEY');
        const checksum = await json(path.join(assets, 'asset-checksums.json'));
        for (const [key, hash] of Object.entries(checksum)) if (await fileHash(path.join(assets, key)) !== hash) throw new Error('ASSET_HASH_MISMATCH');
        const run = await store.reserve(principal, { projectId: m.project_id, ticket: 'F00-04', operation: 'RENDER', key, input: { variant, checksum } });
        if (!run.claimed) { console.log(JSON.stringify({ ...run, reason: 'Existing run; no new render started' })); return; }
        id = run.id;
      }
      const result = await renderLocal(variant, org, assets, out, root);
      if (store && id) await store.finish(principal, id, 'SUCCEEDED', result);
      console.log(JSON.stringify({ evidence: path.join(out, 'evidence.json'), reused: result.reused }));
    } catch (error) {
      if (store && id) await store.finish(principal, id, 'FAILED', { code: 'LOCAL_RENDER_FAILED' });
      throw error;
    } finally { await pool?.end(); }
    return;
  }
  const count = Number(option('runs', '10'));
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('RUNS_MUST_BE_1_TO_10_PER_DURATION');
  const samples: Sample[] = [];
  // Separate output per real run; never count cached artifacts as benchmark samples.
  for (const seconds of [120, 240] as const) for (let i = 0; i < count; i++) {
    const destination = path.join(out, `local-${seconds}-${i + 1}`);
    await renderLocal(durationVariant(m, seconds), org, assets, destination, root);
    const evidence = await json(path.join(destination, 'evidence.json'));
    samples.push({ provider: 'local', duration_seconds: seconds, wall_ms: evidence.wall_ms,
      cpu_ms_sampled: evidence.cpu_ms_sampled, peak_rss_bytes_sampled: evidence.peak_rss_bytes_sampled,
      artifact_sha256: evidence.artifact_sha256, actual_cost_usd: evidence.actual_cost_usd });
    await save('samples.json', samples); await save('benchmarks.json', benchmarkReport(samples));
    console.log(`local ${seconds}s ${i + 1}/${count}: ${evidence.wall_ms} ms`);
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'PHASE00_FAILED'); process.exitCode = 1; });
