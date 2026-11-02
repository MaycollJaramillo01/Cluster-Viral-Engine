'use client';
import { useState } from 'react';
import { api, Decision, Form, Issues, Loading, optional, Status, text, useAction, useApi, type Data, type TabProps } from '../../../ui';

const purposes: Record<string, string> = { VISUAL: 'Imagen', MUSIC: 'Música', SFX: 'Efecto de sonido', PROOF: 'Prueba de licencia' };
const staged = ['ASSETING', 'VOICING', 'RENDERING', 'VIDEO_REVIEW', 'APPROVED'];
const seconds = (ms?: number | null) => ms ? `${(ms / 1000).toFixed(1)} s` : '—';

export function Media({ base, project, reload, write, review }: TabProps) {
  const ready = staged.includes(project.status), assets = useApi(`${base}/assets?limit=200`), media = useApi(ready ? `${base}/media` : null);
  const list: Data[] = assets.data?.assets ?? [], refresh = () => { assets.reload(); media.reload(); reload(); };
  return <>
    <section className="panel-section"><h2>Biblioteca ({list.length})</h2>
      <p className="muted">Todo material necesita una licencia y la aprobación de una persona con rol de revisión antes de entrar en un render.</p>
      {assets.data ? list.length ? <div className="assets">{list.map(asset => <Asset key={asset.id} base={base} asset={asset} proofs={list.filter(a => a.purpose === 'PROOF')} write={write} review={review} changed={refresh} />)}</div>
        : <p className="muted">Sin material.</p> : <Loading error={assets.error} />}
      {write && <details><summary>Subir material</summary>
        <Form label="Subir" submit={async data => {
          const form = new FormData(), duration = Number(data.get('duration'));
          form.set('file', data.get('file') as File);
          form.set('metadata', JSON.stringify({ name: text(data, 'name'), purpose: text(data, 'purpose'), source_name: text(data, 'source_name'), original_source_url: optional(data, 'source_url'),
            alt_text: optional(data, 'alt'), duration_ms: duration ? Math.round(duration * 1000) : null }));
          await api(`${base}/assets`, form); assets.reload();
        }}>
          <label>Archivo (PNG, JPG, MP3, WAV o PDF)<input name="file" type="file" required accept="image/png,image/jpeg,audio/mpeg,audio/wav,application/pdf" /></label>
          <div className="row"><label>Nombre<input name="name" required minLength={3} maxLength={200} /></label>
            <label>Uso<select name="purpose" defaultValue="VISUAL">{Object.entries(purposes).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label></div>
          <div className="row"><label>De dónde sale<input name="source_name" required minLength={2} maxLength={200} placeholder="Archivo, banco de imágenes, autor…" /></label>
            <label>URL original<input name="source_url" type="url" maxLength={2000} /></label></div>
          <div className="row"><label>Texto alternativo<input name="alt" maxLength={500} /></label>
            <label>Duración en segundos (música y efectos)<input name="duration" type="number" min={0.1} step={0.1} /></label></div>
        </Form></details>}
    </section>
    {ready ? <Scenes base={base} media={media} visuals={list.filter(a => a.purpose === 'VISUAL')} music={list.filter(a => a.purpose === 'MUSIC')} write={write} changed={refresh} />
      : <p className="muted panel-section">Las escenas aparecen cuando el guion esté aprobado. Mientras tanto puedes ir subiendo material.</p>}
  </>;
}

function Asset({ base, asset, proofs, write, review, changed }: { base: string; asset: Data; proofs: Data[]; write: boolean; review: boolean; changed: () => void }) {
  const [open, setOpen] = useState(false);
  return <article className="asset">
    <Preview base={base} asset={asset} />
    <h3>{asset.name}</h3>
    <p className="meta">{purposes[asset.purpose]} · <Status value={asset.approval_status} /> · {asset.has_license ? 'con licencia' : 'sin licencia'}{asset.scene_keys.length > 0 && ` · en ${asset.scene_keys.length} escenas`}</p>
    <small>Fuente: {asset.source_name}</small>
    <button type="button" className="secondary-button" onClick={() => setOpen(!open)}>{open ? 'Cerrar' : 'Licencia y revisión'}</button>
    {open && <AssetDetail base={base} asset={asset} proofs={proofs} write={write} review={review} changed={changed} />}
  </article>;
}

function Preview({ base, asset }: { base: string; asset: Data }) {
  const { data } = useApi(`${base}/assets/${asset.id}/url`);
  if (!data) return <div className="thumb" />;
  // eslint-disable-next-line @next/next/no-img-element -- URL firmada de minutos: el optimizador de imágenes no aplica.
  if (asset.mime_type.startsWith('image/')) return <img className="thumb" src={data.url} alt={asset.alt_text ?? ''} />;
  if (asset.mime_type.startsWith('audio/')) return <audio controls src={data.url} />;
  return <a className="thumb" href={data.url}>Descargar</a>;
}

function AssetDetail({ base, asset, proofs, write, review, changed }: { base: string; asset: Data; proofs: Data[]; write: boolean; review: boolean; changed: () => void }) {
  const detail = useApi(`${base}/assets/${asset.id}`), done = () => { detail.reload(); changed(); };
  if (!detail.data) return <Loading error={detail.error} />;
  return <div className="asset-detail">
    <Issues gate={{ blockers: detail.data.issues }} />
    {detail.data.licenses.map((l: Data) => <p key={l.id} className="meta">{l.license_name} · {l.author} · {l.commercial_use_allowed ? 'uso comercial' : 'sin uso comercial'}
      {l.expires_at && ` · vence ${new Date(l.expires_at).toLocaleDateString('es')}`}{l.license_url && <> · <a href={l.license_url} target="_blank" rel="noreferrer noopener">ver</a></>}</p>)}
    {write && <details><summary>Registrar licencia</summary>
      <Form label="Guardar licencia" submit={async data => {
        const expires = optional(data, 'expires_at');
        await api(`${base}/assets/${asset.id}/licenses`, { author: text(data, 'author'), license_name: text(data, 'license_name'), license_url: optional(data, 'license_url'),
          proof_asset_id: optional(data, 'proof'), allowed_use: text(data, 'allowed_use'), commercial_use_allowed: data.get('commercial') === 'on',
          attribution_required: data.get('attribution') === 'on', attribution_text: optional(data, 'attribution_text'), expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null });
        done();
      }}>
        <div className="row"><label>Autor o titular<input name="author" required minLength={2} maxLength={200} /></label><label>Licencia<input name="license_name" required minLength={2} maxLength={120} placeholder="CC BY 4.0, compra, permiso…" /></label></div>
        <div className="row"><label>URL de la licencia<input name="license_url" type="url" maxLength={2000} /></label>
          <label>O prueba subida<select name="proof" defaultValue=""><option value="">Ninguna</option>{proofs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
        <label>Uso permitido<input name="allowed_use" required minLength={3} maxLength={500} /></label>
        <div className="row"><label className="inline"><input type="checkbox" name="commercial" /> Permite uso comercial</label><label className="inline"><input type="checkbox" name="attribution" /> Exige atribución</label></div>
        <div className="row"><label>Texto de atribución<input name="attribution_text" maxLength={300} /></label><label>Vence el<input name="expires_at" type="date" /></label></div>
      </Form></details>}
    {review && asset.approval_status !== 'REJECTED' && <Decision path={`${base}/assets/${asset.id}/decision`} target={asset.content_sha256} done={done} />}
  </div>;
}

function Scenes({ base, media, visuals, music, write, changed }: { base: string; media: ReturnType<typeof useApi>; visuals: Data[]; music: Data[]; write: boolean; changed: () => void }) {
  const assign = useAction(), [estimate, setEstimate] = useState<Data>(null);
  if (!media.data) return <Loading error={media.error} />;
  const state = media.data, put = (path: string, asset_id: string | null) => assign.run(async () => { await api(`${base}/media/${path}`, { asset_id }, 'PUT'); changed(); });
  return <>
    <section className="panel-section"><h2>Escenas del guion v{state.script_version}</h2>
      <p className="muted">Duración total {seconds(state.total_ms)}{state.duration_is_estimate && ', estimada hasta tener la voz'}.</p>
      <Issues gate={state} />
      {assign.error && <p role="alert" className="panel-error">{assign.error}</p>}
      <table className="table"><thead><tr><th>Escena</th><th>Narración</th><th>Imagen</th><th>Voz</th></tr></thead>
        <tbody>{state.timeline.map((scene: Data) => <tr key={scene.scene_key}><td>{scene.scene_key}<small>{seconds(scene.start_ms)}</small></td><td><small>{scene.narration}</small></td>
          <td>{write ? <select value={scene.visual_asset_id ?? ''} disabled={assign.busy} aria-label={`Imagen de ${scene.scene_key}`} onChange={e => e.target.value && put(`scenes/${encodeURIComponent(scene.scene_key)}`, e.target.value)}>
            <option value="">Sin imagen</option>{visuals.map(v => <option key={v.id} value={v.id}>{v.name}{v.approval_status !== 'APPROVED' ? ' (sin aprobar)' : ''}</option>)}</select> : scene.visual_asset_id ? 'Asignada' : '—'}</td>
          <td>{scene.voice_generation_id ? `${seconds(scene.audio_ms)}${scene.timing === 'PROVIDER' ? '' : ' (tiempos sintéticos)'}` : <span className="muted">Falta</span>}</td></tr>)}</tbody></table>
      {write && <label className="inline">Música de fondo <select value={state.music_asset_id ?? ''} disabled={assign.busy} onChange={e => put('music', e.target.value || null)}>
        <option value="">Sin música</option>{music.map(m => <option key={m.id} value={m.id}>{m.name}{m.approval_status !== 'APPROVED' ? ' (sin aprobar)' : ''}</option>)}</select></label>}
    </section>
    {write && <section className="panel-section"><h2>Voz</h2>
      <p className="muted">Genera la narración de las escenas sin voz. Con ElevenLabs necesita clave y tarifa; en local, <code>TTS_PROVIDER=mock</code> crea un tono sintético marcado. Cada generación pasa por el presupuesto.</p>
      <Form keep label="Calcular coste" submit={async data => setEstimate(await api(`${base}/voice/estimate`, { voice_id: text(data, 'voice_id'), model_id: text(data, 'model_id') }))}>
        <div className="row"><label>Voz<input name="voice_id" required pattern="[A-Za-z0-9_\-]{1,64}" defaultValue="voz_local" /></label><label>Modelo<input name="model_id" required pattern="[A-Za-z0-9_.\-]{1,64}" defaultValue="mock" /></label></div>
      </Form>
      {estimate && <p className="meta">{estimate.to_generate} de {estimate.scenes} escenas por generar · {estimate.characters} caracteres · {estimate.estimated_usd.toFixed(4)} USD
        {estimate.blocked && <> · <span className="status status-high">supera el presupuesto</span></>}</p>}
      <Form keep label="Generar voz" submit={async data => { await api(`${base}/voice`, { voice_id: text(data, 'voice_id'), model_id: text(data, 'model_id') }); changed(); }}>
        <div className="row"><label>Voz<input name="voice_id" required pattern="[A-Za-z0-9_\-]{1,64}" defaultValue="voz_local" /></label><label>Modelo<input name="model_id" required pattern="[A-Za-z0-9_.\-]{1,64}" defaultValue="mock" /></label></div>
      </Form>
    </section>}
  </>;
}
