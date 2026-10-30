# 04 · Máquina de estados, jobs y recuperación

## Separación entre flujo editorial y técnico

La revisión editorial controla el permiso para continuar: investigación, guion y render deben poder volver a revisión sin regenerar assets no afectados. Los jobs técnicos nunca otorgan permisos editoriales.

### Contrato de job

`id, organization_id, project_id, job_type, idempotency_key, priority, status, attempt, max_attempts, locked_by, lease_expires_at, scheduled_at, created_at, started_at, finished_at, result_json, error_code, error_redacted`.

`status`: QUEUED / RUNNING / RETRY_WAIT / SUCCEEDED / DEAD / CANCELLED. Exigir UNIQUE `(organization_id, job_type, idempotency_key)`.

### Reintentos

429: respetar Retry-After y backoff exponencial con jitter. 5xx: 3 intentos separados. 4xx no temporales: DEAD + intervención. Fallo de check de licencia: no reintentar. Fallo TTS sin respuesta pero posible cobro: cotejar request con factura/proveedor si ofrece recurso de consulta; no repetir automáticamente un TTS caro.

### Reconciliación

Scheduler cada 5 min revisa jobs RUNNING cuyo lease venció; marca RETRY_WAIT; límite de intentos a DLQ. Cada noche verifica `PUBLISHING` sin remote_id antes de repetir, haciendo lookup del estado remoto autorizado. Al menos una vez al día reconcilia provider_usage con logs/billing disponibles.

### Evidencia y reproducibilidad

Por cada video conservar: `research_bundle_revision`, `script_version`, `scene_manifest_sha256`, `asset_set_hash`, `voice_fingerprint`, `render_artifact_sha256`, `approval.actor+timestamp`, `publication.remote_id`. Se permite reproducir el render si continúan accesibles los assets/licencias. Al cambiar material: nueva versión y aprobación.
