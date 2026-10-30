# Fase 05 · Motor FFmpeg y render asíncrono

**Esfuerzo previsto:** 55–75 horas, **duración orientativa:** 1–2 semanas, **responsables:** Multimedia/backend/SRE.

**Prerrequisito:** gate documentado y aprobado de la fase 04. El comienzo de una fase no habilita automáticamente la publicación en Meta.

## Objetivo verificable

Completar los cambios descritos abajo con evidencias de prueba y el gate final. Las horas son una estimación *sumada por fase* y presuponen personal competente en TypeScript, Postgres y FFmpeg. La aprobación editorial se mantiene durante todas las fases.

## Tareas atómicas, pruebas y entregables

### F05-01 · Finalizar manifest tipado

**Implementación:** JSON schema y validación asset/claim/timing. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F04-12`.

**Validación y aceptación:** Fixture rechazado en errores de tipos. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.7–5.0 h**; área responsable: **devops**.

### F05-02 · Implementar render compose FFmpeg

**Implementación:** 30fps, scale, pad/crop, H264/AAC, mp4 faststart. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F05-01`.

**Validación y aceptación:** Output valida ffprobe. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **5.9–8.0 h**; área responsable: **multimedia**.

### F05-03 · Movimientos y transiciones

**Implementación:** Ken Burns, cambios de plano, overlays, mapas y títulos. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F05-02`.

**Validación y aceptación:** Variedad documental aprobada. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **5.1–7.0 h**; área responsable: **devops**.

### F05-04 · Integrar subs/ducking/loudness

**Implementación:** Subs SRT/ASS, música, narración clara, niveles. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F05-03`.

**Validación y aceptación:** Sin clipping, textos legibles. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **5.1–7.0 h**; área responsable: **devops**.

### F05-05 · Definir RenderProvider desacoplado

**Implementación:** Contrato submit/status/cancel/fetchArtifact. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F05-04`.

**Validación y aceptación:** 2 backends de prueba o fake y docker real. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.7–5.0 h**; área responsable: **multimedia**.

### F05-06 · Empaquetar worker Docker aislado

**Implementación:** CPU/RAM/disk/timeout y sin shell arbitraria. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F05-05`.

**Validación y aceptación:** Ejecución no-root y recursos limitados. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **5.1–7.0 h**; área responsable: **backend**.

### F05-07 · Construir job dispatch durable

**Implementación:** Leases, outbox, retry, DLQ y idempotency. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F05-06`.

**Validación y aceptación:** No pierde trabajo en interrupción. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **5.1–7.0 h**; área responsable: **frontend**.

### F05-08 · Storage chunks y outputs

**Implementación:** Key por org/project/version, hashes, lifecycle. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F05-07`.

**Validación y aceptación:** Output descargable con autorización. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.4–6.0 h**; área responsable: **backend**.

### F05-09 · Generar previews y thumbnails

**Implementación:** Preview barato y poster/miniatura de producción. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F05-08`.

**Validación y aceptación:** UI muestra vista previa correcta. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.7–5.0 h**; área responsable: **devops**.

### F05-10 · Implementar tests ffprobe y QA

**Implementación:** Codec/fps/resolution/duration/audio/hashes. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F05-09`.

**Validación y aceptación:** Autovalida media y bloquea defectos. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.4–6.0 h**; área responsable: **multimedia**.

### F05-11 · Benchmark real 10 iteraciones

**Implementación:** 2/4 min, 10/30 assets en functions y worker. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F05-10`.

**Validación y aceptación:** p50/p95 y coste publicado en ADR. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **5.1–7.0 h**; área responsable: **devops**.

### F05-12 · Abortar, reanudar y cleanup

**Implementación:** Cancelar render, purge temp, reintentos, trazas. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F05-11`.

**Validación y aceptación:** Sin archivos huérfanos/loops. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.7–5.0 h**; área responsable: **multimedia**.

## Gate de la fase 05

- [ ] Los 12 tickets anteriores cumplen su criterio de aceptación y tienen evidencia enlazada.
- [ ] CI, revisión técnica, seguridad de tenant y costos de uso no presentan fallas críticas.
- [ ] Material editorial de prueba no incluye afirmaciones no corroboradas ni assets sin licencia.
- [ ] El responsable entrega un acta GO/NO-GO y registra riesgos restantes.
- [ ] La documentación de arquitectura/operación refleja lo implementado, no lo planeado.

## Prompt operativo para un agente de desarrollo

> Actúa como ingeniero senior encargado de la **fase 05 — Motor FFmpeg y render asíncrono** de Cluster Viral Engine. Lee primero `source/requerimientos_originales.txt`, `README.md`, `docs/01-REQUISITOS-TRAZABILIDAD.md`, `docs/02-ARQUITECTURA-C4.md` y esta fase. Implementa únicamente tickets F05-01 a F05-12, uno por PR, con TypeScript, Next.js en Vercel, Neon PostgreSQL, TypeScript validation, scopes tenant, auditoría, idempotencia y tests. Entrega lista de cambios por archivo, migración, contratos, tests unit/integration, ejemplo de ejecución y evidencia de aceptación. Si depende de Meta o TTS sin credenciales, crea adapter mock y marca claramente `BLOCKED_EXTERNAL`, no simules éxito real. Mantén approval gate humano inviolable y no generes datos o claims falsos. No declares fase terminada sin tests y mediciones.
