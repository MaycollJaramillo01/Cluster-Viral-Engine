# 01 · Requisitos, historias y trazabilidad

## Actores y roles

- `owner`: administra organización, integraciones, presupuesto y política.
- `admin`: configura equipo/editorial, asigna roles excepto owner.
- `editor`: edita guiones, escenas, assets, solicita render.
- `reviewer`: aprueba investigación, guion y video; rechaza con comentario.
- `analyst`: consulta métricas y costos, no modifica contenido.
- `worker`: identidad de servicio acotada para jobs, nunca autorización humana.

## Requisitos funcionales (origen: documento Cluster Media)

| ID | Requisito/resultado observable | Diseño/propuesta | Test aceptación |
|---|---|---|---|
| RF-01 | Registrar referencias autorizadas de redes | reference_links + import adapters | Referencia con URL, fuente, origen y fecha; error de API visible |
| RF-02 | Proponer historias con gancho y riesgos | story_candidates + score | Ficha con título, sinopsis, gancho, riesgo, explicación score |
| RF-03 | Puntaje de viralidad experimental 0–100 | regla versionada v1 | ponderaciones suman 100; auditable; no gate automático |
| RF-04 | Investigar con varias fuentes | sources, claims, evidence | enlaces fechados y claim-source verificable |
| RF-05 | Separar hecho/acusación/hipótesis | claim_classification | casos no cerrados bloqueados para aprobación automática |
| RF-06 | Guion 120–240 s y tres ganchos | script_versions, structured output | estimación de 120–240s, 3 hooks, control de versiones |
| RF-07 | Modificar párrafo/escena sin regeneración global | scene manifest + hashes | cambiar escena N no recompone TTS de otras |
| RF-08 | Narración TTS español LATAM | TtsProvider + cache | audio audible, voz seleccionada, coste capturado |
| RF-09 | Biblioteca con licencias | assets, asset_licenses | cero assets sin estado de licencia en export aprobado |
| RF-10 | Video 1080×1920 MP4 con subs | FFmpeg adapter | ffprobe y QA editorial |
| RF-11 | Previsualizar y corregir | panel + renders | preview, comentario, nueva versión |
| RF-12 | No publicar sin aprobación humana | approval gate transaccional | rechazo 403/409, audit de usuario/versión |
| RF-13 | Publicar por mecanismo oficial Meta | MetaPublisher adapter | Page/token autorizado; idempotencia |
| RF-14 | Recuperar métricas disponibles | metrics_snapshots | nulos explícitos para datos no concedidos |
| RF-15 | Control de presupuesto mensual y/video | usage_ledger + threshold | soft/hard caps, stops auditados |
| RF-16 | Registro para futuro multi-tenant | organization_id y membership | test de lectura/escritura cruzada negada |

## Requisitos no funcionales propuestos (validar con cliente)

| ID | Meta inicial | Método de medición |
|---|---|---|
| RNF-01 | P95 lectura dashboard <1.5 s, excluido proveedor | tracing en Vercel |
| RNF-02 | cero publicaciones sin humano | controles de API + tests concurrency |
| RNF-03 | jobs con retry máximo 3, dead-letter | simulación de proveedor 429/5xx |
| RNF-04 | recuperación RPO <=24 h, RTO <=8 h (objetivo) | restauración supervisada |
| RNF-05 | 1–2 videos/día sin reintentos excesivos | prueba 10 videos cronometraje |
| RNF-06 | URLs firmadas para medios privados | prueba de expiración |
| RNF-07 | audit log inmutable por app | pruebas de modificación/roles |
| RNF-08 | guardar costo real y estimado por video | reconciliación factura/proveedor |

## Historias prioritarias

**HU-01**: Como editor quiero seleccionar historia con fuentes y riesgo para comenzar guion. **Dado** score y fuentes, **cuando** elijo la propuesta, **entonces** un proyecto inicia en `RESEARCHING` con rastro de selección.

**HU-02**: Como revisor quiero rechazar una afirmación criminal incorrecta; mi rechazo crea nueva revisión, invalida aprobaciones anteriores y evita publicar esa versión.

**HU-03**: Como editor quiero sustituir una imagen licenciada en escena 4 sin pagar TTS otra vez; el hash de audio no cambia y la segunda exportación registra costo de solo render.

**HU-04**: Como administrador quiero prohibir publicaciones al superar hard cap por organización; en un conflicto concurrente una sola autorización se registra.

**HU-05**: Como revisor quiero autorizar una versión exacta de video. El publisher comprueba checksum del manifiesto y `approved_render_id`, no solo flag del proyecto.

**HU-06**: Como analista quiero comparar alcance, vistas, compartidos y coste; los datos no disponibles por Graph API se muestran `sin datos` y nunca se imputan.

## Definition of Done transversal

Todo ticket: pruebas unitarias/integración, validación server-side, permisos/tenant scope, manejo de errores, observabilidad, migración reversible cuando aplique, documentación, criterios de aceptación demostrados, PR revisada. En integraciones: mocks + sandbox + prueba real antes de release. En video: verificación ffprobe y revisión editorial. En publicación: aprobación auditada y dry-run.
