'use client';
import { useEffect, useState } from 'react';
import { Action, api, date, Decision, Issues, Loading, short, Status, useApi, type Data, type TabProps } from '../../../ui';

const humanChecks: Record<string, string> = { subtitle_legibility: 'Que los subtítulos se lean bien', motion_quality: 'Que el movimiento de cámara se vea bien',
  visual_variety: 'Que haya variedad visual', audible_mix: 'Que la voz se oiga sobre la música' };
const active = (render: Data) => ['QUEUED', 'RUNNING'].includes(render.status);

export function Renders({ base, reload, write, review }: TabProps) {
  const renders = useApi(`${base}/renders?limit=20`), [selected, setSelected] = useState<string | null>(null);
  const list: Data[] = renders.data?.renders ?? [], working = list.some(active), refresh = renders.reload;
  // Mientras haya un render en marcha, el estado lo cambia el worker: se consulta cada 5 s.
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => { refresh(); reload(); }, 5000);
    return () => clearInterval(timer);
  }, [working, refresh, reload]);
  return <>
    <section className="panel-section"><h2>Renders</h2>
      <p className="muted">Un render junta guion aprobado, voz y material aprobado en un video vertical de 1080×1920. Lo hace el worker de render, fuera de la web: en local, <code>npm run render:worker</code>.</p>
      {write && <Action label="Pedir render" run={async () => { await api(`${base}/renders`, {}); refresh(); reload(); }} />}
      {renders.data ? list.length ? <table className="table"><thead><tr><th>Pedido</th><th>Estado</th><th>Duración</th><th>Calidad</th><th>Video</th><th /></tr></thead>
        <tbody>{list.map(render => <tr key={render.id}><td>{date(render.created_at)}<small>{render.provider ?? '—'}</small></td>
          <td><Status value={render.status} />{render.error_code && <small>{render.error_code}</small>}{active(render) && <small>intento {render.attempt} de {render.max_attempts}</small>}</td>
          <td>{render.duration_ms ? `${(render.duration_ms / 1000).toFixed(1)} s` : '—'}</td>
          <td>{render.qa ? render.qa.passed ? 'Pasa' : 'No pasa' : '—'}</td><td><code>{short(render.artifact_sha256)}</code></td>
          <td>{render.status === 'SUCCEEDED' && <button type="button" className="secondary-button" onClick={() => setSelected(selected === render.id ? null : render.id)}>{selected === render.id ? 'Cerrar' : 'Ver y revisar'}</button>}
            {write && active(render) && <Action secondary label="Cancelar" run={async () => { await api(`${base}/renders/${render.id}/cancel`, {}); refresh(); }} />}</td></tr>)}</tbody></table>
        : <p className="muted">Sin renders.</p> : <Loading error={renders.error} />}
    </section>
    {selected && <Review key={selected} base={base} id={selected} review={review} done={() => { refresh(); reload(); }} />}
  </>;
}

function Review({ base, id, review, done }: { base: string; id: string; review: boolean; done: () => void }) {
  const detail = useApi(`${base}/renders/${id}/review`);
  if (!detail.data) return <section className="panel-section"><Loading error={detail.error} /></section>;
  const r = detail.data, after = () => { detail.reload(); done(); };
  return <section className="panel-section review"><h2>Revisión del video</h2>
    <div className="review-grid">
      <div><video controls preload="metadata" src={r.urls.preview.url} poster={r.urls.poster.url} />
        <p className="meta"><a href={r.urls.master.url}>Descargar master</a> · <a href={r.urls.captions.url}>Subtítulos</a> · bytes <code>{short(r.render.artifact_sha256)}</code></p></div>
      <div>
        {r.approved && <p className="ok">Aprobado. No se publica: la publicación sigue deshabilitada.</p>}
        <Issues gate={{ blockers: r.blockers, warnings: r.warnings }} />
        {r.needs_human.length > 0 && <><h4>Debe comprobarlo una persona</h4><ul>{r.needs_human.map((check: string) => <li key={check}>{humanChecks[check] ?? check}</li>)}</ul></>}
        {r.render.qa?.checks && <details><summary>Control automático ({r.render.qa.checks.filter((c: Data) => c.status === 'PASS').length} de {r.render.qa.checks.length})</summary>
          <ul>{r.render.qa.checks.map((c: Data) => <li key={c.check}>{c.status === 'PASS' ? '✓' : '✗'} {c.check}</li>)}</ul></details>}
      </div>
    </div>
    <h3>Afirmaciones que cita ({r.claims.length})</h3><ul>{r.claims.map((c: Data) => <li key={c.id}>{c.statement}</li>)}</ul>
    <h3>Fuentes ({r.sources.length})</h3><ul>{r.sources.map((s: Data) => <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer noopener">{s.publisher}</a> {s.title}</li>)}</ul>
    <h3>Derechos del material ({r.rights.length})</h3><ul>{r.rights.map((a: Data) => <li key={a.id}>{a.name}: {a.licenses.map((l: Data) => l.license_name).join(', ') || 'sin licencia'} · <Status value={a.approval_status} /></li>)}</ul>
    <h3>Coste</h3><ul>{r.usage.length ? r.usage.map((u: Data, i: number) => <li key={i}>{u.provider} · {u.operation}: {Number(u.cost_usd).toFixed(4)} USD</li>) : <li>Sin gasto registrado.</li>}</ul>
    {r.decisions.length > 0 && <><h3>Decisiones</h3><ul>{r.decisions.map((d: Data, i: number) => <li key={i}><Status value={d.decision} /> {date(d.decided_at)}{d.note && ` · ${d.note}`}</li>)}</ul></>}
    {review && (r.project_status === 'VIDEO_REVIEW' || r.approved) && <Decision path={`${base}/renders/${id}/decision`} target={r.render.artifact_sha256} done={after} />}
  </section>;
}
