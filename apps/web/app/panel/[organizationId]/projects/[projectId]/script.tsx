'use client';
import { useState } from 'react';
import { beats, type Section } from '../../../../../src/scripts/contract';
import { Action, api, date, Decision, Form, Issues, Loading, short, Status, text, useApi, type Data, type TabProps } from '../../../ui';

const beatLabels: Record<string, string> = { HOOK: 'Gancho', CONTEXT: 'Contexto', DEVELOPMENT: 'Desarrollo', REVELATION: 'Revelación', OUTCOME: 'Desenlace' };
const editable = ['SCRIPTING', 'SCRIPT_REVIEW', 'ASSETING', 'VOICING', 'RENDERING', 'VIDEO_REVIEW'];

export function Script({ base, project, reload, write, review }: TabProps) {
  const ready = !project.status.startsWith('RESEARCH'), script = useApi(ready ? `${base}/script` : null);
  if (!ready) return <p className="muted panel-section">El guion se escribe cuando una persona con rol de revisión aprueba el dossier.</p>;
  if (script.loading || (script.error && script.error.code !== 'NOT_FOUND')) return <Loading error={script.error} />;
  const current: Data = script.data, claims: Data[] = project.claims, after = () => { script.reload(); reload(); };
  const claim = (id: string) => claims.find(c => c.id === id)?.statement ?? short(id);
  return <>
    {current && <section className="panel-section"><h2>Versión {current.version} <Status value={current.status} /></h2>
      <p className="muted">Contenido <code>{short(current.content_sha256)}</code> · {current.origin === 'HUMAN' ? 'escrita por una persona' : 'generada por IA'} · {date(current.created_at)} · unos {Math.round(current.gate.estimated_seconds)} s de narración</p>
      <Issues gate={current.gate} />
      <h3>Títulos</h3><ul>{current.content.title_options.map((t: string) => <li key={t}>{t}</li>)}</ul>
      <h3>Gancho elegido</h3><p>{current.content.hooks[current.content.selected_hook]}</p>
      <h3>Secciones</h3><ol className="cards">{current.content.sections.map((s: Data) => <li key={s.key}><p className="meta">{beatLabels[s.beat]}{s.non_factual && ' · transición sin hechos'}</p><p>{s.text}</p>
        {s.claim_ids.length > 0 && <ul className="evidence">{s.claim_ids.map((id: string) => <li key={id}>Cita: {claim(id)}</li>)}</ul>}</li>)}</ol>
      <p className="muted">{current.scenes.length} escenas planificadas a partir de las secciones.</p>
      {write && current.status === 'DRAFT' && project.status === 'SCRIPTING' && current.version === current.current_version &&
        <Action label="Enviar a revisión" run={async () => { await api(`${base}/script/versions/${current.version}/submit`, {}); after(); }} />}
      {review && current.status === 'REVIEW' && <Decision path={`${base}/script/versions/${current.version}/decision`} target={current.content_sha256} done={after} />}
      {current.history.length > 1 && <details><summary>Historial ({current.history.length} versiones)</summary><table className="table"><tbody>{current.history.map((h: Data) =>
        <tr key={h.version}><td>v{h.version}</td><td><Status value={h.status} /></td><td><code>{short(h.content_sha256)}</code></td><td>{date(h.created_at)}</td></tr>)}</tbody></table></details>}
    </section>}
    {write && editable.includes(project.status) && <section className="panel-section"><h2>{current ? 'Editar: crea una versión nueva' : 'Escribir el guion'}</h2>
      <Editor key={current?.version ?? 0} base={base} current={current} claims={claims} saved={after} /></section>}
    {write && editable.includes(project.status) && <details className="panel-section"><summary>Generar el guion con IA</summary>
      <Form label="Generar" submit={async data => { await api(`${base}/script/generate`, { idempotency_key: crypto.randomUUID(), tone: text(data, 'tone'), target_seconds: Number(data.get('target_seconds')) }); after(); }}>
        <div className="row"><label>Tono<input name="tone" defaultValue="Sobrio" required minLength={3} /></label><label>Duración (s)<input name="target_seconds" type="number" min={120} max={240} defaultValue={150} /></label></div>
        <p className="muted">Necesita una clave de LLM. Sin ella responde que el proveedor no está configurado.</p></Form></details>}
  </>;
}

function Editor({ base, current, claims, saved }: { base: string; current?: Data; claims: Data[]; saved: () => void }) {
  const content = current?.content;
  const [sections, setSections] = useState<Section[]>(() => content?.sections ?? beats.map(beat => ({ key: crypto.randomUUID(), beat, text: '', claim_ids: [], non_factual: false })));
  const update = (i: number, patch: Partial<Section>) => setSections(list => list.map((s, j) => j === i ? { ...s, ...patch } : s));
  return <Form keep label="Guardar versión" submit={async data => {
    await api(`${base}/script`, { base_version: current?.current_version ?? 0, content: {
      tone: text(data, 'tone'), target_seconds: Number(data.get('target_seconds')), voice_wpm: Number(data.get('wpm')),
      title_options: data.getAll('title').map(t => String(t).trim()).filter(Boolean), hooks: data.getAll('hook').map(h => String(h).trim()), selected_hook: Number(data.get('selected_hook')),
      sections: sections.map(s => ({ ...s, text: s.text.trim() })), disclaimers: text(data, 'disclaimers').split('\n').map(d => d.trim()).filter(Boolean) } });
    saved();
  }}>
    <div className="row"><label>Tono<input name="tone" defaultValue={content?.tone ?? 'Sobrio'} required minLength={3} maxLength={120} /></label>
      <label>Duración objetivo (s)<input name="target_seconds" type="number" min={120} max={240} defaultValue={content?.target_seconds ?? 150} required /></label>
      <label>Palabras por minuto<input name="wpm" type="number" min={90} max={220} defaultValue={content?.voice_wpm ?? 150} required /></label></div>
    <fieldset><legend>Títulos: al menos 3</legend>{[0, 1, 2, 3, 4].map(i => <input key={i} name="title" aria-label={`Título ${i + 1}`} defaultValue={content?.title_options[i] ?? ''} required={i < 3} minLength={3} maxLength={200} />)}</fieldset>
    <fieldset><legend>Ganchos: escribe 3 y marca el que abre el video</legend>{[0, 1, 2].map(i => <label key={i} className="inline wide">
      <input type="radio" name="selected_hook" value={i} defaultChecked={(content?.selected_hook ?? 0) === i} aria-label={`Usar gancho ${i + 1}`} />
      <input name="hook" aria-label={`Gancho ${i + 1}`} defaultValue={content?.hooks[i] ?? ''} required minLength={3} maxLength={200} /></label>)}</fieldset>
    <h3>Secciones</h3>
    {sections.map((s, i) => <fieldset key={s.key} className="section-edit"><legend>Sección {i + 1}</legend>
      <div className="row"><label>Momento<select value={s.beat} onChange={e => update(i, { beat: e.target.value as Section['beat'] })}>{beats.map(b => <option key={b} value={b}>{beatLabels[b]}</option>)}</select></label>
        <label className="inline"><input type="checkbox" checked={s.non_factual} onChange={e => update(i, { non_factual: e.target.checked })} /> Transición sin hechos</label>
        <button type="button" className="secondary-button" disabled={sections.length === 1} onClick={() => setSections(list => list.filter((_, j) => j !== i))}>Quitar sección</button></div>
      <label>Narración<textarea value={s.text} onChange={e => update(i, { text: e.target.value })} rows={4} required minLength={3} maxLength={4000} /></label>
      <details><summary>Afirmaciones que cita ({s.claim_ids.length})</summary>{claims.length ? claims.map(c => <label key={c.id} className="inline wide">
        <input type="checkbox" checked={s.claim_ids.includes(c.id)} onChange={e => update(i, { claim_ids: e.target.checked ? [...s.claim_ids, c.id] : s.claim_ids.filter(id => id !== c.id) })} /> {c.statement}</label>)
        : <p className="muted">El dossier no tiene afirmaciones.</p>}</details>
    </fieldset>)}
    <button type="button" className="secondary-button" disabled={sections.length >= 40} onClick={() => setSections(list => [...list, { key: crypto.randomUUID(), beat: 'DEVELOPMENT', text: '', claim_ids: [], non_factual: false }])}>Añadir sección</button>
    <label>Avisos en pantalla, uno por línea<textarea name="disclaimers" defaultValue={content?.disclaimers?.join('\n') ?? ''} rows={2} /></label>
  </Form>;
}
