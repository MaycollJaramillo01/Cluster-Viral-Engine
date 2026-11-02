import { Pool, type PoolClient } from 'pg';
import { z } from 'zod';
import { AppError, can, organizationIdSchema, roleSchema, type OrganizationContext, type Permission, type VerifiedIdentity } from '@cluster/contracts';
import { parseConfig } from './config';
import { createApplicationPool } from './pool';

const state = globalThis as typeof globalThis & { cveRuntimePool?: Pool };
export function getRuntimePool(): Pool {
  if (!state.cveRuntimePool) {
    const config = parseConfig(process.env);
    state.cveRuntimePool = createApplicationPool(config.DATABASE_URL);
  }
  return state.cveRuntimePool;
}
export async function assertRuntimeRole(client: PoolClient): Promise<void> {
  const role = await client.query(`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`);
  const owned = await client.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND pg_has_role(current_user,c.relowner,'MEMBER')`);
  const policies = await client.query(`SELECT count(*)::int AS n FROM pg_class WHERE oid IN
    ('app_users'::regclass,'memberships'::regclass,'projects'::regclass,'organizations'::regclass)
    AND relrowsecurity AND relforcerowsecurity`);
  if (!role.rowCount || role.rows[0].rolsuper || role.rows[0].rolbypassrls || owned.rows[0].n || policies.rows[0].n !== 4) throw new AppError('SERVICE_UNAVAILABLE', 503);
}

export class TenantDatabase {
  constructor(private pool: Pool) {}

  async identityTransaction<T>(identity: VerifiedIdentity, operation: (client: PoolClient, actorId: string) => Promise<T>): Promise<T> {
    if (!identity.subject || !Number.isFinite(identity.expiresAt.getTime()) || identity.expiresAt.getTime() <= Date.now()) throw new AppError('UNAUTHENTICATED', 401);
    const client = await this.pool.connect();
    let begun = false, destroyConnection = false;
    try {
      await client.query('BEGIN'); begun = true;
      await client.query("SET LOCAL statement_timeout='5000ms'");
      await client.query("SET LOCAL lock_timeout='2000ms'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout='10000ms'");
      await assertRuntimeRole(client);
      await client.query("SELECT set_config('app.auth_subject',$1,true)", [identity.subject]);
      const actor = await client.query('SELECT id FROM app_users WHERE auth_subject=$1', [identity.subject]);
      if (!actor.rowCount) throw new AppError('FORBIDDEN', 403);
      const id = z.uuid().parse(actor.rows[0].id);
      await client.query("SELECT set_config('app.actor_id',$1,true)", [id]);
      const result = await operation(client, id);
      const commit = await client.query('COMMIT'); begun = false;
      if (commit.command !== 'COMMIT') throw new AppError('INTERNAL_ERROR', 500);
      return result;
    } catch (error) {
      if (begun) { try { await client.query('ROLLBACK'); } catch { destroyConnection = true; throw new AppError('SERVICE_UNAVAILABLE', 503); } }
      throw error;
    } finally { client.release(destroyConnection); }
  }

  async organizationTransaction<T>(identity: VerifiedIdentity, org: string, permission: Permission,
    operation: (client: PoolClient, context: OrganizationContext) => Promise<T>): Promise<T> {
    const parsed = organizationIdSchema.safeParse(org);
    if (!parsed.success) throw new AppError('INVALID_INPUT', 400);
    return this.identityTransaction(identity, async (client, actorId) => {
      await client.query("SELECT set_config('app.organization_id',$1,true)", [parsed.data]);
      const member = await client.query('SELECT role FROM memberships WHERE organization_id=$1 AND user_id=$2', [parsed.data, actorId]);
      const role = roleSchema.safeParse(member.rows[0]?.role);
      if (!role.success || !can(role.data, permission)) throw new AppError('FORBIDDEN', 403);
      if (['owner', 'admin'].includes(role.data) && !identity.twoFactorEnabled) throw new AppError('MFA_REQUIRED', 403);
      return operation(client, { organizationId: parsed.data, actorId, role: role.data });
    });
  }
}
