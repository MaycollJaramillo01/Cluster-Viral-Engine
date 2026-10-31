import type { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '@cluster/contracts';
import { spendSummary } from '../media/store';

const reportFilters = z.object({ days: z.coerce.number().int().min(1).max(366).default(30) });
export function windowDays(query: URLSearchParams) {
  const parsed = reportFilters.safeParse(Object.fromEntries(query));
  if (!parsed.success) throw new AppError('INVALID_INPUT', 400);
  return parsed.data.days;
}
const SINCE = 'now()-make_interval(days => $1::int)';
const TIMING = 'count(*)::int AS n,percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds)::float8 AS p50_seconds,percentile_cont(0.95) WITHIN GROUP (ORDER BY seconds)::float8 AS p95_seconds';

// Sale de lo que ya registran la cola, las decisiones y el ledger; RLS lo deja en la organización.
// null significa que no se registra, nunca cero: nadie mide el tiempo humano ni el CPU de un render fallido, y sin publicaciones no hay audiencia.
// ponytail: retried mira solo la última tanda de cada render, porque pedirlo de nuevo reinicia el contador. El historial completo está en audit_events, que el rol de la aplicación no lee.
export async function operationsReport(client: PoolClient, organizationId: string, days: number) {
  const rows = async <R = Record<string, unknown>>(sql: string) => (await client.query(sql, [days])).rows as R[];
  const [leadTime] = await rows(`SELECT ${TIMING} FROM (SELECT extract(epoch FROM min(a.decided_at)-p.created_at)::float8 AS seconds FROM approvals a JOIN projects p ON p.id=a.project_id
    WHERE a.approval_type='RENDER' AND a.decision='APPROVED' GROUP BY p.id,p.created_at HAVING min(a.decided_at)>=${SINCE}) t`);
  const [reviewWait] = await rows(`SELECT ${TIMING} FROM (SELECT extract(epoch FROM min(a.decided_at)-r.finished_at)::float8 AS seconds FROM approvals a JOIN renders r ON r.id=a.render_id
    GROUP BY r.id,r.finished_at HAVING min(a.decided_at)>=${SINCE}) t`);
  const [renders] = await rows(`SELECT count(*)::int AS total,count(*) FILTER (WHERE r.status='SUCCEEDED')::int AS succeeded,count(*) FILTER (WHERE r.status='FAILED')::int AS failed,count(*) FILTER (WHERE r.status='CANCELLED')::int AS cancelled,
    count(*) FILTER (WHERE j.attempt>1)::int AS retried,COALESCE(sum((r.metrics->>'cpu_ms')::float8),0)/1000 AS cpu_seconds FROM renders r LEFT JOIN jobs j ON j.id=r.job_id WHERE r.created_at>=${SINCE}`);
  const failureCauses = await rows(`SELECT error_code,count(*)::int AS n FROM renders WHERE status='FAILED' AND created_at>=${SINCE} GROUP BY error_code ORDER BY n DESC,error_code`);
  const decisions = await rows(`SELECT approval_type,decision,count(*)::int AS n FROM approvals WHERE decided_at>=${SINCE} GROUP BY approval_type,decision ORDER BY approval_type,decision`);
  const costs = await rows(`SELECT provider,operation,unit_name,sum(input_units)::float8 AS units,sum(COALESCE(actual_cost_usd,estimated_cost_usd))::float8 AS cost_usd FROM provider_usage WHERE created_at>=${SINCE} GROUP BY provider,operation,unit_name ORDER BY provider,operation,unit_name`);
  const [failed] = await rows<{ cost_usd: number }>(`SELECT COALESCE(sum(COALESCE(u.actual_cost_usd,u.estimated_cost_usd)),0)::float8 AS cost_usd FROM provider_usage u JOIN jobs j ON j.id=u.job_id WHERE j.status='DEAD' AND u.created_at>=${SINCE}`);
  return { window_days: days, lead_time: leadTime, review_wait: reviewWait, renders, failure_causes: failureCauses, decisions, costs, failed_jobs_cost_usd: failed.cost_usd,
    budget: await spendSummary(client, organizationId), human_minutes: null, failed_render_cpu_seconds: null, audience: null };
}
