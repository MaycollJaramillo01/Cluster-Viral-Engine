'use client';
import { classifications, legalStatuses, riskCategories } from '../../../../../src/research/contract';
import { Action, api, date, Decision, Form, Issues, optional, short, Status, text, type Data, type TabProps } from '../../../ui';

const classLabels: Record<string, string> = { CONFIRMED: 'Confirmado', DISPUTED: 'Disputado', ALLEGATION: 'Acusación', UNVERIFIED: 'Sin verificar', OPINION: 'Opinión', RECONSTRUCTION: 'Reconstrucción' };
const legalLabels: Record<string, string> = { NONE: 'No aplica', INVESTIGATED: 'Investigado', ACCUSED: 'Acusado', CONVICTED: 'Condenado', ACQUITTED: 'Absuelto', OPEN_PROCEEDING: 'Proceso abierto' };
const riskLabels: Record<string, string> = { CRIME: 'Delito', VICTIM: 'Víctima', MINOR: 'Menor de edad', UNSTABLE_SOURCE: 'Fuente inestable', RECONSTRUCTION: 'Reconstrucción', LIVING_PERSON: 'Persona viva' };
const relationLabels: Record<string, string> = { SUPPORTS: 'Respalda', CONTRADICTS: 'Contradice', CONTEXT: 'Contexto' };
const planLabels: Record<string, string> = { PRIMARY: 'Primaria', SECONDARY: 'Secundaria', CONTRAST: 'Contraste', EVENT_PERIOD: 'época del hecho', LATEST_24_MONTHS: 'últimos 24 meses', ANY: 'cualquier fecha' };

export function Research({ base, project, reload, write, review }: TabProps) {
  const open = project.status.startsWith('RESEARCH'), sources: Data[] = project.sources, claims: Data[] = project.claims;
  const publisher = (id: string) => sources.find(source => source.id === id)?.publisher ?? short(id);
  return <>
    <section className="panel-section"><h2>Plan de búsqueda</h2>
      {project.plan ? <ol className="plan">{project.plan.plan.queries.map((q: Data, i: number) => <li key={i}><strong>{q.query}</strong> <span className="muted">{planLabels[q.kind]} · {planLabels[q.window]}</span><small>{q.rationale}</small></li>)}</ol>
        : <p className="muted">Sin plan. Genera las búsquedas que conviene hacer: fuentes primarias, secundarias y de contraste.</p>}
      {write && open && <Action label={project.plan ? 'Rehacer plan' : 'Generar plan'} run={async () => { await api(`${base}/research-plan`, {}); reload(); }} />}
    </section>

    <section className="panel-section"><h2>Fuentes ({sources.length})</h2>
      {sources.length ? <table className="table"><thead><tr><th>Medio</th><th>Tipo</th><th>Publicación</th><th>Extracto</th></tr></thead>
        <tbody>{sources.map(source => <tr key={source.id}><td><a href={source.url} target="_blank" rel="noreferrer noopener">{source.publisher}</a>{source.title && <small>{source.title}</small>}</td>
          <td>{planLabels[source.source_type] ?? source.source_type}</td><td>{source.publication_date ?? '—'}</td><td><small>{source.evidence_excerpt}</small></td></tr>)}</tbody></table>
        : <p className="muted">Sin fuentes.</p>}
      {write && open && <details><summary>Añadir fuente</summary>
        <Form label="Guardar fuente" submit={async data => { await api(`${base}/sources`, { url: text(data, 'url'), publisher: text(data, 'publisher'), title: text(data, 'title'), author: optional(data, 'author'),
          publication_date: optional(data, 'publication_date'), retrieved_at: new Date().toISOString(), source_type: text(data, 'source_type'), evidence_excerpt: text(data, 'excerpt'), license_note: text(data, 'license_note') }); reload(); }}>
          <label>URL<input name="url" type="url" required maxLength={2000} /></label>
          <div className="row"><label>Medio o institución<input name="publisher" required maxLength={200} /></label><label>Título<input name="title" maxLength={500} /></label></div>
          <div className="row"><label>Autor<input name="author" maxLength={200} /></label><label>Fecha de publicación<input name="publication_date" type="date" /></label>
            <label>Tipo<select name="source_type" defaultValue="SECONDARY"><option value="PRIMARY">Primaria</option><option value="SECONDARY">Secundaria</option><option value="OTHER">Otra</option></select></label></div>
          <label>Extracto que sirve de evidencia<textarea name="excerpt" required maxLength={600} rows={3} /></label>
          <label>Nota de licencia o uso<input name="license_note" maxLength={500} /></label>
        </Form></details>}
    </section>

    <section className="panel-section"><h2>Afirmaciones ({claims.length})</h2>
      {claims.length ? <ul className="cards">{claims.map(claim => <li key={claim.id}>
        <p><strong>{claim.statement}</strong></p>
        <p className="meta"><span className="status">{classLabels[claim.classification]}</span>
          {claim.sensitivity === 'HIGH' && <> · <span className="status status-high">Riesgo alto</span></>}
          {claim.legal_status !== 'NONE' && <> · {legalLabels[claim.legal_status]}</>}
          {claim.risk_categories.length > 0 && <> · {claim.risk_categories.map((r: string) => riskLabels[r] ?? r).join(', ')}</>}
          {' · '}{claim.verified ? <span className="status status-succeeded">Verificada por una persona</span> : <span className="muted">Sin verificar</span>}</p>
        <ul className="evidence">{claim.evidence.map((e: Data) => <li key={e.source_id}>{relationLabels[e.relation]}: {publisher(e.source_id)}{e.excerpt && <small>{e.excerpt}</small>}</li>)}</ul>
        {review && open && !claim.verified && <Action secondary label="Marcar verificada" run={async () => { await api(`${base}/claims/${claim.id}/verify`, {}); reload(); }} />}
      </li>)}</ul> : <p className="muted">Sin afirmaciones. Cada afirmación necesita al menos una fuente.</p>}
      {write && open && sources.length > 0 && <details><summary>Añadir afirmación</summary>
        <Form label="Guardar afirmación" submit={async data => {
          const evidence = sources.filter(source => data.get(`use_${source.id}`)).map(source => ({ source_id: source.id, relation: text(data, `relation_${source.id}`) }));
          await api(`${base}/claims`, { statement: text(data, 'statement'), classification: text(data, 'classification'), subject: text(data, 'subject'), event_date: optional(data, 'event_date'),
            legal_status: text(data, 'legal_status'), risk_categories: data.getAll('risk').map(String), evidence }); reload(); }}>
          <label>Afirmación<textarea name="statement" required minLength={3} maxLength={1000} rows={2} /></label>
          <div className="row"><label>Clasificación<select name="classification" defaultValue="UNVERIFIED">{classifications.map(c => <option key={c} value={c}>{classLabels[c]}</option>)}</select></label>
            <label>Persona o tema<input name="subject" maxLength={200} /></label><label>Fecha del hecho<input name="event_date" type="date" /></label>
            <label>Situación legal<select name="legal_status" defaultValue="NONE">{legalStatuses.map(s => <option key={s} value={s}>{legalLabels[s]}</option>)}</select></label></div>
          <fieldset><legend>Riesgos</legend>{riskCategories.map(r => <label key={r} className="inline"><input type="checkbox" name="risk" value={r} /> {riskLabels[r]}</label>)}</fieldset>
          <fieldset><legend>Evidencia: marca al menos una fuente</legend>{sources.map(source => <div key={source.id} className="inline">
            <label className="inline"><input type="checkbox" name={`use_${source.id}`} /> {source.publisher}</label>
            <select name={`relation_${source.id}`} defaultValue="SUPPORTS" aria-label={`Relación con ${source.publisher}`}>{Object.entries(relationLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></div>)}</fieldset>
        </Form></details>}
      {write && open && <details><summary>Extraer afirmaciones con IA</summary><p className="muted">Lee las fuentes y propone afirmaciones que una persona debe verificar. Necesita una clave de LLM.</p>
        <Action label="Extraer" run={async () => { await api(`${base}/claims/extract`, { idempotency_key: crypto.randomUUID() }); reload(); }} /></details>}
    </section>

    <section className="panel-section"><h2>Dossier</h2>
      <p className="muted">El dossier congela fuentes y afirmaciones. Una persona con rol de revisión lo aprueba sobre ese contenido exacto; si algo cambia después, hay que congelarlo de nuevo.</p>
      <Issues gate={project.gate} />
      {write && open && <Action label="Congelar y enviar a revisión" run={async () => { await api(`${base}/dossiers`, {}); reload(); }} />}
      {project.dossiers.length > 0 && <table className="table"><thead><tr><th>Revisión</th><th>Estado</th><th>Contenido</th><th>Creada</th></tr></thead>
        <tbody>{project.dossiers.map((d: Data) => <tr key={d.revision}><td>{d.revision}</td><td><Status value={d.status} /></td>
          <td><code>{short(d.content_sha256)}</code> {d.content_sha256 === project.live_sha256 ? <span className="muted">igual al actual</span> : <span className="muted">desactualizado</span>}</td><td>{date(d.created_at)}</td></tr>)}</tbody></table>}
      {review && project.dossiers.filter((d: Data) => d.status === 'REVIEW').map((d: Data) =>
        <Decision key={d.revision} path={`${base}/dossiers/${d.revision}/decision`} target={d.content_sha256} done={reload} />)}
    </section>
  </>;
}
