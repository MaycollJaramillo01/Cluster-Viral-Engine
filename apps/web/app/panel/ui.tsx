'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

// ponytail: las formas de las respuestas viven en los stores del servidor; tiparlas aquí las duplicaría.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Data = any;

const errors: Record<string, string> = {
  UNAUTHENTICATED: 'Tu sesión terminó. Vuelve a entrar.',
  FORBIDDEN: 'Tu rol no permite esta acción.',
  MFA_REQUIRED: 'Tu rol exige verificación en dos pasos: actívala en Cuenta.',
  INVALID_INPUT: 'Faltan datos o alguno no es válido.',
  NOT_FOUND: 'Todavía no existe.',
  CONFLICT: 'No corresponde a la etapa actual o alguien lo cambió antes. Recarga y revisa.',
  BLOCKED_BY_POLICY: 'Hay bloqueos sin resolver. Revísalos antes de aprobar.',
  BLOCKED_EXTERNAL: 'Necesita un proveedor externo que aún no está configurado (IA, voz o almacenamiento).',
  SERVICE_UNAVAILABLE: 'El servicio no está disponible.',
  RATE_LIMITED: 'Demasiadas solicitudes. Espera un minuto.',
};
export class ApiError extends Error {
  constructor(public code: string, public status: number) { super(errors[code] ?? `Error ${status}`); }
}

// La seguridad está en la API: origen, sesión, rol y organización se comprueban allí en cada llamada.
export async function api(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<Data> {
  const form = body instanceof FormData;
  const response = await fetch(path, { method, headers: body === undefined || form ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.error ?? 'SERVICE_UNAVAILABLE', response.status);
  return data;
}

export function useApi(path: string | null) {
  const [state, setState] = useState<{ path?: string; data?: Data; error?: ApiError }>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api(path).then(data => { if (live) setState({ path, data }); }, error => { if (live) setState({ path, error: error instanceof ApiError ? error : new ApiError('SERVICE_UNAVAILABLE', 0) }); });
    return () => { live = false; };
  }, [path, tick]);
  const current = state.path === path, reload = useCallback(() => setTick(t => t + 1), []);
  return { data: current ? state.data : undefined, error: current ? state.error : undefined, loading: !current, reload };
}

export function useAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await task(); return true; }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo completar.'); return false; }
    finally { setBusy(false); }
  };
  return { busy, error, run };
}

export function Form({ submit, label, children, keep }: { submit: (data: FormData) => Promise<unknown>; label: string; children: ReactNode; keep?: boolean }) {
  const { busy, error, run } = useAction();
  return <form className="panel-form" onSubmit={async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (await run(() => submit(new FormData(form))) && !keep) form.reset();
  }}>{children}<div className="form-actions"><button disabled={busy}>{busy ? 'Enviando…' : label}</button>{error && <p role="alert">{error}</p>}</div></form>;
}

export function Action({ run: task, label, secondary }: { run: () => Promise<unknown>; label: string; secondary?: boolean }) {
  const { busy, error, run } = useAction();
  return <span className="action"><button type="button" className={secondary ? 'secondary-button' : undefined} disabled={busy} onClick={() => run(task)}>{label}</button>
    {error && <span role="alert">{error}</span>}</span>;
}

export function Loading({ error, empty }: { error?: ApiError; empty?: string }) {
  if (error?.code === 'UNAUTHENTICATED') return <p className="panel-error" role="alert">{error.message} <Link href="/login">Iniciar sesión</Link></p>;
  if (error) return <p className={error.code === 'NOT_FOUND' ? 'muted' : 'panel-error'} role={error.code === 'NOT_FOUND' ? undefined : 'alert'}>{error.code === 'NOT_FOUND' && empty ? empty : error.message}</p>;
  return <p className="muted">Cargando…</p>;
}

export const text = (data: FormData, name: string) => String(data.get(name) ?? '').trim();
export const optional = (data: FormData, name: string) => text(data, name) || null;
export const short = (hash?: string | null) => hash ? `${hash.slice(0, 12)}…` : '—';
export const date = (value?: string | null) => value ? new Date(value).toLocaleString('es') : '—';

const issues: Record<string, string> = {
  NO_SOURCES: 'No hay fuentes.', NO_CLAIMS: 'No hay afirmaciones.', CLAIM_WITHOUT_EVIDENCE: 'Una afirmación no tiene evidencia.',
  CONFIRMED_WITHOUT_SUPPORT: 'Una afirmación confirmada no tiene una fuente que la respalde.',
  FEWER_THAN_TWO_INDEPENDENT_SOURCES: 'Falta una segunda fuente independiente.', HIGH_RISK_NOT_VERIFIED: 'Una afirmación de riesgo alto no está verificada por una persona.',
  HIGH_RISK_NOT_CORROBORATED: 'Una afirmación de riesgo alto no está corroborada.', MODEL_CLAIM_NOT_VERIFIED: 'Una afirmación propuesta por IA no está verificada.',
  LEGAL_STATUS_REQUIRED: 'Falta la situación legal de una persona señalada.', RECONSTRUCTION_NOT_LABELLED: 'Una reconstrucción no está rotulada.',
  ALLEGATION_WITHOUT_HEDGE: 'Una acusación se presenta sin matizar.', ASSERTS_GUILT_WITHOUT_CONVICTION: 'Se afirma culpa sin condena.',
  CITES_UNVERIFIED_CLAIM: 'El guion cita una afirmación sin verificar.', UNKNOWN_CLAIM: 'El guion cita una afirmación que no está en el dossier.',
  FACTUAL_SECTION_WITHOUT_CLAIM: 'Una sección con hechos no cita afirmaciones.', NON_FACTUAL_SECTION: 'Hay secciones marcadas sin hechos.',
  NON_FACTUAL_SECTION_WITH_FIGURES: 'Una sección marcada sin hechos contiene cifras.', NO_CLAIMS_CITED: 'El guion no cita ninguna afirmación.',
  DURATION_OUT_OF_RANGE: 'La duración estimada queda fuera de 120 a 240 s.', DURATION_FAR_FROM_TARGET: 'La duración estimada se aleja del objetivo.',
  HEADLINE_ASSERTS_GUILT: 'Un título afirma culpa.', HEADLINE_ABSOLUTE_LANGUAGE: 'Un título usa lenguaje absoluto.',
  VISUAL_MISSING: 'Una escena no tiene imagen.', VOICE_MISSING: 'Una escena no tiene voz.', VOICE_STALE: 'La voz de una escena no corresponde al texto actual.',
  ASSET_NOT_APPROVED: 'Hay material sin aprobar.', NO_LICENSE: 'Hay material sin licencia.', LICENSE_EXPIRED: 'Una licencia venció.',
  LICENSE_WITHOUT_PROOF: 'Una licencia no tiene URL ni prueba.', COMMERCIAL_USE_NOT_ALLOWED: 'Una licencia no permite uso comercial.',
  ATTRIBUTION_MISSING: 'Falta un texto de atribución.', AI_NOT_LABELLED: 'Material de IA sin rótulo.', MUSIC_WITHOUT_DURATION: 'La música no tiene duración.',
  SYNTHETIC_TIMING: 'Los tiempos son estimados: no hay voz real.', CUES_INVALID: 'Los subtítulos no son válidos.',
  DOSSIER_CHANGED: 'El dossier cambió después del guion.', RENDER_PROVIDER_FAKE: 'Render de prueba: nunca se aprueba.',
  RENDER_QA_FAILED: 'El render no pasó el control de calidad.', RENDER_STALE: 'El material cambió después de este render.',
};
type Issue = { code: string; claim_id?: string; ref?: string; scene_key?: string };
export function Issues({ gate }: { gate?: { blockers?: Issue[]; warnings?: Issue[] } }) {
  if (!gate) return null;
  const line = (issue: Issue, i: number) => <li key={i}>{issues[issue.code] ?? issue.code} <code>{issue.code}</code></li>;
  return <div className="issues">
    {gate.blockers?.length ? <><h4>Bloqueos</h4><ul className="blockers">{gate.blockers.map(line)}</ul></> : <p className="ok">Sin bloqueos.</p>}
    {gate.warnings?.length ? <><h4>Avisos</h4><ul className="warnings">{gate.warnings.map(line)}</ul></> : null}
  </div>;
}

export function Decision({ path, target, done }: { path: string; target: string; done: () => void }) {
  return <Form label="Registrar decisión" submit={async data => { await api(path, { decision: data.get('decision'), target_sha256: target, note: text(data, 'note') }); done(); }}>
    <fieldset className="choice"><legend>Decisión sobre <code>{short(target)}</code></legend>
      <label><input type="radio" name="decision" value="APPROVED" required /> Aprobar</label>
      <label><input type="radio" name="decision" value="REJECTED" /> Rechazar</label></fieldset>
    <label>Nota (obligatoria al rechazar)<textarea name="note" maxLength={1000} rows={2} /></label>
  </Form>;
}

export type TabProps = { base: string; project: Data; reload: () => void; write: boolean; review: boolean };
export const projectSteps =[['RESEARCHING', 'Investigación'], ['RESEARCH_REVIEW', 'Revisión del dossier'], ['SCRIPTING', 'Guion'], ['SCRIPT_REVIEW', 'Revisión del guion'],
  ['ASSETING', 'Material'], ['VOICING', 'Voz'], ['RENDERING', 'Render'], ['VIDEO_REVIEW', 'Revisión del video'], ['APPROVED', 'Aprobado']] as const;
const labels: Record<string, string> = { ...Object.fromEntries(projectSteps), CANDIDATE: 'Candidata', SELECTED: 'Seleccionada', REJECTED: 'Rechazada', ARCHIVED: 'Archivada',
  REVIEW: 'En revisión', DRAFT: 'Borrador', SUPERSEDED: 'Reemplazada', PENDING: 'Pendiente', QUEUED: 'En cola', RUNNING: 'Procesando', SUCCEEDED: 'Terminado',
  FAILED: 'Falló', CANCELLED: 'Cancelado', RETRY_WAIT: 'Reintento', DEAD: 'Agotado', LOW: 'Bajo', MEDIUM: 'Medio', HIGH: 'Alto', UNKNOWN: 'Sin evaluar' };
export const label = (value: string) => labels[value] ?? value;
export const Status = ({ value }: { value?: string | null }) => value ? <span className={`status status-${value.toLowerCase()}`}>{label(value)}</span> : null;
