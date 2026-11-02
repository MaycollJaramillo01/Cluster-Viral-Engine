'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { can } from '@cluster/contracts';
import { categories } from '../../../src/research/contract';
import { Action, api, Form, label, Loading, Status, text, useApi, type Data } from '../ui';

const categoryLabels: Record<string, string> = { CRIME_HISTORY: 'Crimen histórico', ORGANIZED_CRIME: 'Crimen organizado', UNSOLVED: 'Sin resolver', MYSTERY: 'Misterio',
  HISTORY: 'Historia', CONTROVERSIAL_FIGURES: 'Figuras polémicas', MONEY_POWER: 'Dinero y poder', SOCIAL: 'Social' };
const usd = (value?: number | null) => value === null || value === undefined ? '—' : `${value.toFixed(2)} USD`;

export default function Organization({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = use(params), base = `/api/organizations/${organizationId}`, router = useRouter();
  const context = useApi(`${base}/context`), stories = useApi(`${base}/stories?include_high_risk=true&limit=100`);
  const usage = useApi(`${base}/usage`), operations = useApi(`${base}/operations?days=30`);
  const write = context.data && can(context.data.role, 'project:write'), [smoke, setSmoke] = useState(false);
  // test:http deja historias [SMOKE] en la base local: ocultas por defecto.
  const list: Data[] = (stories.data?.stories ?? []).filter((story: Data) => smoke || !story.proposed_title.startsWith('[SMOKE]'));
  if (!context.data) return <main><Loading error={context.error} /></main>;
  return <main>
    <p className="tag">{context.data.organization.name.toUpperCase()} · ROL {context.data.role.toUpperCase()}</p>
    <h1>Radar editorial</h1>
    <p className="lead">Cada video recorre: historia → investigación → guion → material y voz → render → revisión. Cada paso lo aprueba una persona con rol de revisión sobre la versión exacta. La publicación está deshabilitada.</p>

    <section className="panel-section"><h2>Historias</h2>
      {stories.data?.stories.length > list.length || smoke ? <label className="inline muted"><input type="checkbox" checked={smoke} onChange={e => setSmoke(e.target.checked)} /> Mostrar las historias de prueba [SMOKE]</label> : null}
      {stories.data ? list.length ? <table className="table"><thead><tr><th>Historia</th><th>Categoría</th><th>Riesgo</th><th>Puntuación</th><th>Estado</th><th /></tr></thead>
        <tbody>{list.map((story: Data) => <tr key={story.id}>
          <td><strong>{story.proposed_title}</strong>{story.summary && <small>{story.summary}</small>}</td>
          <td>{categoryLabels[story.category] ?? '—'}</td><td><Status value={story.editorial_risk} /></td>
          <td>{story.viral_score ?? '—'}</td><td><Status value={story.status} /></td>
          <td>{story.project_id ? <Link href={`/panel/${organizationId}/projects/${story.project_id}`}>Abrir proyecto →</Link>
            : write && story.status === 'CANDIDATE' && <Action label="Convertir en proyecto" run={async () => {
              const { project_id } = await api(`${base}/stories/${story.id}/select`, {});
              router.push(`/panel/${organizationId}/projects/${project_id}`);
            }} />}</td>
        </tr>)}</tbody></table> : <p className="muted">Todavía no hay historias. Crea la primera abajo.</p> : <Loading error={stories.error} />}
      {write && <div className="split">
        <details open={stories.data && list.length === 0}><summary>Nueva historia</summary>
          <Form label="Crear historia" submit={async data => { await api(`${base}/stories`, { proposed_title: text(data, 'title'), summary: text(data, 'summary'), hook: text(data, 'hook'),
            category: text(data, 'category') || null, editorial_risk: text(data, 'risk'), risk_notes: text(data, 'risk_notes') }); stories.reload(); }}>
            <label>Título propuesto<input name="title" required minLength={3} maxLength={200} /></label>
            <label>Resumen<textarea name="summary" maxLength={2000} rows={3} /></label>
            <label>Gancho<input name="hook" maxLength={500} /></label>
            <div className="row"><label>Categoría<select name="category" defaultValue=""><option value="">Sin categoría</option>{categories.map(c => <option key={c} value={c}>{categoryLabels[c]}</option>)}</select></label>
              <label>Riesgo editorial<select name="risk" defaultValue="UNKNOWN">{['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH'].map(r => <option key={r} value={r}>{label(r)}</option>)}</select></label></div>
            <label>Notas de riesgo<input name="risk_notes" maxLength={500} /></label>
          </Form></details>
        <details><summary>Proponer historias con IA</summary>
          <Form label="Pedir propuestas" submit={async data => { await api(`${base}/stories/proposals`, { idempotency_key: crypto.randomUUID(), topic: text(data, 'topic') }); stories.reload(); }}>
            <label>Tema<input name="topic" required minLength={3} maxLength={200} /></label>
            <p className="muted">Necesita una clave de LLM. Sin ella responde que el proveedor no está configurado.</p>
          </Form></details>
      </div>}
    </section>

    <section className="panel-section"><h2>Presupuesto del mes</h2>
      {usage.data ? <div className="stats">
        <div><span>Presupuesto</span><strong>{usd(usage.data.budget_usd)}</strong></div>
        <div><span>Gastado</span><strong>{usd(usage.data.spent_usd)}</strong></div>
        <div><span>Disponible</span><strong>{usd(usage.data.remaining_usd)}</strong></div>
        <div><span>Alerta del 80 %</span><strong>{usage.data.soft_limit_reached ? 'Alcanzada' : 'No'}</strong></div>
      </div> : <Loading error={usage.error} />}
    </section>

    <section className="panel-section"><h2>Operación, últimos 30 días</h2>
      {operations.data ? <div className="stats">
        <div><span>Renders</span><strong>{operations.data.renders.total}</strong></div>
        <div><span>Terminados</span><strong>{operations.data.renders.succeeded}</strong></div>
        <div><span>Fallidos</span><strong>{operations.data.renders.failed}</strong></div>
        <div><span>Decisiones</span><strong>{operations.data.decisions.reduce((sum: number, d: Data) => sum + d.n, 0)}</strong></div>
        <div><span>Hasta aprobar (mediana)</span><strong>{operations.data.lead_time.p50_seconds ? `${Math.round(operations.data.lead_time.p50_seconds / 3600)} h` : '—'}</strong></div>
      </div> : <Loading error={operations.error} />}
    </section>
  </main>;
}
