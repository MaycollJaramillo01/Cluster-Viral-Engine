import type { PoolClient } from 'pg';
import type { OrganizationContext } from '@cluster/contracts';

// Se escribe en la misma transacción que el cambio: si la auditoría falla, el cambio no ocurre.
export async function audit(client: PoolClient, context: OrganizationContext, action: string, entityType: string, entityId: string, options: { afterHash?: string; reason?: string; requestId?: string } = {}) {
  await client.query(`INSERT INTO audit_events(organization_id,actor_user_id,action,entity_type,entity_id,after_hash,request_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [context.organizationId, context.actorId, action, entityType, entityId, options.afterHash ?? null, options.requestId ?? null, options.reason ?? null]);
}
export async function emit(client: PoolClient, context: Pick<OrganizationContext, 'organizationId'>, aggregateType: string, aggregateId: string, eventType: string, data: Record<string, unknown>) {
  await client.query('INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,event_data) VALUES($1,$2,$3,$4,$5)',
    [context.organizationId, aggregateType, aggregateId, eventType, JSON.stringify(data)]);
}
