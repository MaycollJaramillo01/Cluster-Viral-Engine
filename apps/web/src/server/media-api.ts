import { z } from 'zod';
import { AppError } from '@cluster/contracts';
import { assetMetadataInput, assignMusicInput, assignVisualInput, licenseInput, voiceInput, voiceTarget } from '../media/contract';
import { contentTypeOf, MAX_UPLOAD_BYTES, objectStoreFromEnv, verifyObjectUrl } from '../media/objects';
import * as media from '../media/store';
import { limitsFromEnv, ttsFromEnv } from '../media/tts';
import { scriptDecisionInput } from '../scripts/contract';
import { requireIdentity } from './auth';
import { parseConfig } from './config';
import { assertSameOrigin, requestHandler } from './observability';
import { database, externalRoute, readRoute, uuidParam, writeRoute, type Params } from './route-helpers';

const listFilters = z.object({ purpose: z.string().optional(), approval_status: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) });
// ponytail: multipart en memoria hasta 50 MB, solo en local. Vercel Functions admite unos 4.5 MB: con Blob real la carga irá directa al almacenamiento.
async function readUpload(request: Request) {
  const length = Number(request.headers.get('content-length'));
  if (!length) throw new AppError('INVALID_INPUT', 411);
  if (length > MAX_UPLOAD_BYTES + 65536) throw new AppError('INVALID_INPUT', 413);
  let form: FormData;
  try { form = await request.formData(); } catch { throw new AppError('INVALID_INPUT', 400); }
  const file = form.get('file'), metadata = form.get('metadata');
  if (!(file instanceof File) || typeof metadata !== 'string') throw new AppError('INVALID_INPUT', 400);
  let raw: unknown;
  try { raw = JSON.parse(metadata); } catch { throw new AppError('INVALID_INPUT', 400); }
  const parsed = assetMetadataInput.safeParse(raw);
  if (!parsed.success) throw new AppError('INVALID_INPUT', 400);
  return { metadata: parsed.data, bytes: new Uint8Array(await file.arrayBuffer()) };
}
export const upload = (request: Request, params: Params) => requestHandler(request, 'asset.upload', async requestId => {
  assertSameOrigin(request, parseConfig(process.env).BETTER_AUTH_URL);
  const identity = await requireIdentity(request.headers);
  const store = objectStoreFromEnv(process.env);
  const { metadata, bytes } = await readUpload(request);
  const result = await media.uploadAsset(database(), identity, params.organizationId, uuidParam(params, 'projectId'), metadata, bytes, store, limitsFromEnv(process.env), { requestId });
  return Response.json(result, { status: result.created ? 201 : 200 });
});
export const list = readRoute('asset.list', 'organization:read', ({ client, params }, query) => {
  const parsed = listFilters.safeParse(Object.fromEntries(query));
  if (!parsed.success) throw new AppError('INVALID_INPUT', 400);
  return media.listAssets(client, uuidParam(params, 'projectId'), parsed.data);
});
export const read = readRoute('asset.read', 'organization:read', ({ client, params }) => media.readAsset(client, uuidParam(params, 'projectId'), uuidParam(params, 'assetId')));
export const url = readRoute('asset.url', 'organization:read', ({ client, params }) => media.assetUrl(client, uuidParam(params, 'projectId'), uuidParam(params, 'assetId'), parseConfig(process.env).BETTER_AUTH_SECRET));
export const addLicense = writeRoute('asset.license', 'project:write', licenseInput, ({ client, context, params, requestId }, body) => media.addLicense(client, context, uuidParam(params, 'projectId'), uuidParam(params, 'assetId'), body, { requestId }));
export const decide = writeRoute('asset.decide', 'editorial:review', scriptDecisionInput, ({ client, context, params, requestId }, body) => media.decideAsset(client, context, uuidParam(params, 'projectId'), uuidParam(params, 'assetId'), body, { requestId }), 200);
export const readMedia = readRoute('media.read', 'organization:read', ({ client, params }) => media.readMedia(client, uuidParam(params, 'projectId')));
export const assignVisual = writeRoute('media.visual', 'project:write', assignVisualInput, ({ client, context, params, requestId }, body) => media.assignVisual(client, context, uuidParam(params, 'projectId'), params.sceneKey, body.asset_id, { requestId }), 200);
export const assignMusic = writeRoute('media.music', 'project:write', assignMusicInput, ({ client, context, params, requestId }, body) => media.assignMusic(client, context, uuidParam(params, 'projectId'), body.asset_id, { requestId }), 200);
export const usage = readRoute('usage.read', 'organization:read', ({ client, params }) => media.usageReport(client, params.organizationId));
export const synthesize = externalRoute('voice.synthesize', voiceInput, (identity, params, body, requestId) => {
  const provider = ttsFromEnv(process.env), store = objectStoreFromEnv(process.env);
  return media.synthesizeVoice(database(), identity, params.organizationId, uuidParam(params, 'projectId'), body, provider, store, limitsFromEnv(process.env), { requestId });
});
export const estimate = writeRoute('voice.estimate', 'project:write', voiceTarget, ({ client, params }, body) => media.estimateVoice(client, params.organizationId, uuidParam(params, 'projectId'), body, ttsFromEnv(process.env), limitsFromEnv(process.env)), 200);

// La firma es la autorización: se emite tras comprobar organización y caduca en minutos. attachment y nosniff impiden ejecutar el contenido en este origen.
export const readObject = (request: Request) => requestHandler(request, 'object.read', async () => {
  const query = new URL(request.url).searchParams, key = query.get('key') ?? '', expires = query.get('expires') ?? '', signature = query.get('signature') ?? '';
  if (!verifyObjectUrl(parseConfig(process.env).BETTER_AUTH_SECRET, key, expires, signature)) throw new AppError('FORBIDDEN', 403);
  const bytes = await objectStoreFromEnv(process.env).get(key);
  if (!bytes) throw new AppError('NOT_FOUND', 404);
  return new Response(Buffer.from(bytes), { headers: { 'content-type': contentTypeOf(key), 'content-disposition': 'attachment', 'x-content-type-options': 'nosniff' } });
});
