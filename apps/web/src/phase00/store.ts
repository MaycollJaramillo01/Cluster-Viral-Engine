import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { sha256 } from './contract';

// Only a verified server session / trusted operator supplies actorId. No public route accepts it.
const principalSchema = z.strictObject({ organizationId: z.uuid(), actorId: z.uuid() });
export type Principal = z.infer<typeof principalSchema>;
const requestSchema = z.strictObject({ projectId: z.uuid(), ticket: z.string().regex(/^F00-(0[1-9]|1[0-2])$/),
  operation: z.enum(['RENDER', 'TTS', 'META_DRY_RUN', 'EVIDENCE']), key: z.string().min(1).max(200), input: z.unknown() });
type RunRequest = z.infer<typeof requestSchema>;
export class Phase00Store {
  constructor(private pool: Pool) {}

  private async transaction<T>(principal: Principal, action: (client: PoolClient) => Promise<T>): Promise<T> {
    const p = principalSchema.parse(principal);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const role = await client.query(`SELECT rolsuper,rolbypassrls,
        pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid='phase00_runs'::regclass), 'MEMBER') AS owns
        FROM pg_roles WHERE rolname=current_user`);
      if (role.rows[0].rolsuper || role.rows[0].rolbypassrls || role.rows[0].owns) throw new Error('UNSAFE_DATABASE_ROLE');
      await client.query("SELECT set_config('app.organization_id',$1,true)", [p.organizationId]);
      const membership = await client.query(`SELECT role FROM memberships WHERE organization_id=$1 AND user_id=$2`, [p.organizationId, p.actorId]);
      if (!['owner', 'admin', 'editor', 'reviewer'].includes(membership.rows[0]?.role)) throw new Error('FORBIDDEN_MEMBERSHIP');
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async reserve(principal: Principal, input: RunRequest): Promise<{ id: string; claimed: boolean; status: string }> {
    const r = requestSchema.parse(input);
    const inputHash = sha256(r.input);
    return this.transaction(principal, async client => {
      const project = await client.query('SELECT id FROM projects WHERE organization_id=$1 AND id=$2', [principal.organizationId, r.projectId]);
      if (!project.rowCount) throw new Error('FORBIDDEN_PROJECT');
      const inserted = await client.query(`INSERT INTO phase00_runs(organization_id,project_id,actor_id,ticket,operation,idempotency_key,input_sha256)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,project_id,operation,idempotency_key) DO NOTHING RETURNING id,status`,
        [principal.organizationId, r.projectId, principal.actorId, r.ticket, r.operation, r.key, inputHash]);
      if (inserted.rowCount) {
        const id: string = inserted.rows[0].id;
        await this.audit(client, principal, id, 'PHASE00_RESERVED', null, inputHash);
        await client.query(`INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,event_data)
          VALUES($1,'phase00_run',$2,'PHASE00_RESERVED',$3)`, [principal.organizationId, id, { ticket: r.ticket, operation: r.operation }]);
        return { id, claimed: true, status: 'RUNNING' };
      }
      const existing = await client.query(`SELECT id,status,input_sha256,ticket FROM phase00_runs
        WHERE organization_id=$1 AND project_id=$2 AND operation=$3 AND idempotency_key=$4`, [principal.organizationId, r.projectId, r.operation, r.key]);
      if (existing.rows[0]?.input_sha256 !== inputHash || existing.rows[0]?.ticket !== r.ticket) throw new Error('IDEMPOTENCY_CONFLICT');
      return { id: existing.rows[0].id, claimed: false, status: existing.rows[0].status };
    });
  }

  async finish(principal: Principal, id: string, status: 'SUCCEEDED' | 'FAILED' | 'BLOCKED_EXTERNAL', result: unknown): Promise<void> {
    z.uuid().parse(id);
    z.enum(['SUCCEEDED', 'FAILED', 'BLOCKED_EXTERNAL']).parse(status);
    if (result == null) throw new Error('RESULT_REQUIRED');
    await this.transaction(principal, async client => {
      const old = await client.query('SELECT input_sha256 FROM phase00_runs WHERE organization_id=$1 AND id=$2 AND status=$3 FOR UPDATE', [principal.organizationId, id, 'RUNNING']);
      if (!old.rowCount) throw new Error('RUN_NOT_ACTIVE_OR_FORBIDDEN');
      const hash = sha256(result);
      await client.query('UPDATE phase00_runs SET status=$1,result=$2,output_sha256=$3,finished_at=now() WHERE organization_id=$4 AND id=$5',
        [status, JSON.stringify(result), hash, principal.organizationId, id]);
      await this.audit(client, principal, id, `PHASE00_${status}`, old.rows[0].input_sha256, hash);
    });
  }

  private async audit(client: PoolClient, p: Principal, id: string, action: string, before: string | null, after: string) {
    await client.query(`INSERT INTO audit_events(organization_id,actor_user_id,action,entity_type,entity_id,before_hash,after_hash)
      VALUES($1,$2,$3,'phase00_run',$4,$5,$6)`, [p.organizationId, p.actorId, action, id, before, after]);
  }
}
