import { AppError } from '@cluster/contracts';
import { requireIdentity } from './auth';
import { TenantDatabase, getRuntimePool } from './database';
import { parseConfig } from './config';
import { assertSameOrigin, requestHandler } from './observability';

export async function profile(headers: Headers) {
  const identity = await requireIdentity(headers);
  return new TenantDatabase(getRuntimePool()).identityTransaction(identity, async (client, actorId) => {
    const rows = await client.query<{ organization_id: string; role: string }>('SELECT organization_id,role FROM memberships WHERE user_id=$1 ORDER BY organization_id', [actorId]);
    return { actor_id: actorId, two_factor_enabled: identity.twoFactorEnabled, memberships: rows.rows };
  });
}
export const me = (request: Request) => requestHandler(request, 'identity.profile', async () => Response.json(await profile(request.headers)));
export const organization = (request: Request, organizationId: string) => requestHandler(request, 'organization.context', async requestId => {
  const identity = await requireIdentity(request.headers);
  return new TenantDatabase(getRuntimePool()).organizationTransaction(identity, organizationId, 'organization:read', async (client, context) => {
    const row = await client.query('SELECT id,slug,name FROM organizations WHERE id=$1', [context.organizationId]);
    if (!row.rowCount) throw new AppError('FORBIDDEN', 403);
    // Request/tenant correlation without logging name, email, cookies or content.
    const { logEvent } = await import('./observability');
    logEvent({ event: 'organization.authorized', requestId, organizationId: context.organizationId, status: 200, durationMs: 0 });
    return Response.json({ ...context, organization: row.rows[0], publication_enabled: false });
  });
});
export const unimplementedStories = (request: Request) => requestHandler(request, 'stories.unimplemented', async () => {
  if (request.method === 'POST') assertSameOrigin(request, parseConfig(process.env).BETTER_AUTH_URL);
  await requireIdentity(request.headers);
  return Response.json({ error: 'NOT_IMPLEMENTED', message: 'Research CRUD belongs to a later phase.' }, { status: 501 });
});
