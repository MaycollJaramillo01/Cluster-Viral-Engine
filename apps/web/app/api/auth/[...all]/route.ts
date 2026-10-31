import { isIP } from 'node:net';
import { getAuth, assertIdentityRole } from '../../../../src/server/auth';
import { parseConfig } from '../../../../src/server/config';
import { assertSameOrigin, requestHandler, readLimitedBody } from '../../../../src/server/observability';

export const runtime = 'nodejs';
const handle = (request: Request) => requestHandler(request, 'identity.auth', async () => {
  const config = parseConfig(process.env);
  assertSameOrigin(request, config.BETTER_AUTH_URL);
  const headers = new Headers(request.headers);
  const remote = config.APP_ENV === 'local' ? '127.0.0.1' : request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim();
  headers.set('x-cve-client-ip', remote && isIP(remote) ? remote : '0.0.0.0');
  let body: ArrayBuffer | undefined;
  if (request.method === 'POST') {
    body = await readLimitedBody(request);
  }
  await assertIdentityRole();
  const response = await getAuth().handler(new Request(request.url, { method: request.method, headers, body }));
  return response.status >= 500 ? Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 }) : response;
});
export const GET = handle;
export const POST = handle;
