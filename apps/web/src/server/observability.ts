import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '@cluster/contracts';

type Event = { event: string; requestId: string; organizationId?: string; jobId?: string; status: number; durationMs: number; errorCode?: string };
export function logEvent(event: Event, write: (line: string) => void = console.info) {
  const uuid = (value: string | undefined) => value && z.uuid().safeParse(value).success ? value : undefined;
  const safe = (value: string) => /^[a-zA-Z0-9_:.-]{1,80}$/.test(value) ? value : 'REDACTED';
  write(JSON.stringify({ timestamp: new Date().toISOString(), event: safe(event.event), request_id: uuid(event.requestId),
    organization_id: uuid(event.organizationId), job_id: uuid(event.jobId), status: event.status,
    duration_ms: Math.max(0, Math.round(event.durationMs)), error_code: event.errorCode ? safe(event.errorCode) : undefined }));
}
export async function requestHandler(request: Request, name: string, handler: (requestId: string) => Promise<Response>): Promise<Response> {
  const incoming = request.headers.get('x-request-id');
  const requestId = incoming && z.uuid().safeParse(incoming).success ? incoming : randomUUID();
  const start = performance.now();
  let response: Response, code: string | undefined;
  try { response = await handler(requestId); }
  catch (error) {
    const known = error instanceof AppError;
    code = known ? error.code : 'SERVICE_UNAVAILABLE';
    response = Response.json({ error: code, request_id: requestId }, { status: known ? error.status : 503 });
  }
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Request-Id', requestId);
  logEvent({ event: name, requestId, status: response.status, durationMs: performance.now() - start, errorCode: code });
  return response;
}
export function assertSameOrigin(request: Request, origin: string) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.get('origin') !== new URL(origin).origin) throw new AppError('FORBIDDEN', 403);
}
export async function readLimitedBody(request: Request, limit = 65536): Promise<ArrayBuffer> {
  if (Number(request.headers.get('content-length')) > limit) throw new AppError('INVALID_INPUT', 413);
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new AppError('INVALID_INPUT', 413); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result.buffer;
}
