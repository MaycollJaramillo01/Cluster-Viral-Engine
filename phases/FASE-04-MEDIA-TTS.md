# Fase 04 · Narración, sincronización, assets y derechos

**Esfuerzo previsto:** 50–70 horas, **duración orientativa:** 1–2 semanas, **responsables:** Multimedia, backend.

**Prerrequisito:** gate documentado y aprobado de la fase 03. El comienzo de una fase no habilita automáticamente la publicación en Meta.

## Objetivo verificable

Completar los cambios descritos abajo con evidencias de prueba y el gate final. Las horas son una estimación *sumada por fase* y presuponen personal competente en TypeScript, Postgres y FFmpeg. La aprobación editorial se mantiene durante todas las fases.

## Tareas atómicas, pruebas y entregables

### F04-01 · Implementar biblioteca privada

**Implementación:** Objetos con org prefix, signed URLs, SHA, MIME y tamaño. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F03-12`.

**Validación y aceptación:** Carga validada y rechazo de archivo incorrecto. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.7–5.1 h**; área responsable: **seguridad**.

### F04-02 · Construir tabla de licencias

**Implementación:** Autor, licencia, uso permitido, evidencia, expiración, aprobación. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F04-01`.

**Validación y aceptación:** Unlicensed assets bloquean aprobación. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.7–5.1 h**; área responsable: **devops**.

### F04-03 · Descubrimiento material documental

**Implementación:** Catálogos/manual, búsquedas con uso permitido. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F04-02`.

**Validación y aceptación:** Cada asset tiene source y metadata. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.4–6.2 h**; área responsable: **backend**.

### F04-04 · ElevenLabs adapter TTS

**Implementación:** Voz/modelo/locale/settings con timeout, errores, cuotas. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F04-03`.

**Validación y aceptación:** Audio latam con respuesta y coste registrados. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **5.1–7.2 h**; área responsable: **multimedia**.

### F04-05 · Caché granular de audios

**Implementación:** Fingerprint por texto+voz+modelo+config y org. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F04-04`.

**Validación y aceptación:** Regenerar imagen no invoca TTS. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.4–6.2 h**; área responsable: **multimedia**.

### F04-06 · Audio por fragmento/escena

**Implementación:** Clips por sección con stitching y pausas. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F04-05`.

**Validación y aceptación:** Cada escena puede corregirse por separado. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.4–6.2 h**; área responsable: **devops**.

### F04-07 · Timestamps/Subtítulos

**Implementación:** Alignment respaldado por timestamps reales o aligner. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F04-06`.

**Validación y aceptación:** SRT + ASS sin drift visible. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **5.1–7.2 h**; área responsable: **multimedia**.

### F04-08 · Política música/efectos

**Implementación:** Biblioteca con licencia comercial y duración/atribución. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F04-07`.

**Validación y aceptación:** Ninguna pista sin licencia llega a release. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.9–4.1 h**; área responsable: **devops**.

### F04-09 · Recreación visual IA opcional

**Implementación:** Prompt seguro, marca IA, gasto/caso y revisión. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F04-08`.

**Validación y aceptación:** No confundir recreación con hecho documentado. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.7–5.1 h**; área responsable: **devops**.

### F04-10 · Validación visual y accesibilidad

**Implementación:** Alt/contrast, safe areas, line breaks, B-roll variety. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F04-09`.

**Validación y aceptación:** Checklist QA con resultados. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.7–5.1 h**; área responsable: **devops**.

### F04-11 · Presupuesto/gasto TTS y assets

**Implementación:** Preflight estimador, caps, usage ledger y alertas. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F04-10`.

**Validación y aceptación:** Bloqueo al hard cap y ledger detallado. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.4–6.2 h**; área responsable: **multimedia**.

### F04-12 · Pruebas provider/resiliencia

**Implementación:** 429, timeout, fallo parcial, duplicado y cache. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F04-11`.

**Validación y aceptación:** No se duplica coste por mensaje repetido. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.5–6.3 h**; área responsable: **devops**.

## Gate de la fase 04

- [ ] Los 12 tickets anteriores cumplen su criterio de aceptación y tienen evidencia enlazada.
- [ ] CI, revisión técnica, seguridad de tenant y costos de uso no presentan fallas críticas.
- [ ] Material editorial de prueba no incluye afirmaciones no corroboradas ni assets sin licencia.
- [ ] El responsable entrega un acta GO/NO-GO y registra riesgos restantes.
- [ ] La documentación de arquitectura/operación refleja lo implementado, no lo planeado.

## Prompt operativo para un agente de desarrollo

> Actúa como ingeniero senior encargado de la **fase 04 — Narración, sincronización, assets y derechos** de Cluster Viral Engine. Lee primero `source/requerimientos_originales.txt`, `README.md`, `docs/01-REQUISITOS-TRAZABILIDAD.md`, `docs/02-ARQUITECTURA-C4.md` y esta fase. Implementa únicamente tickets F04-01 a F04-12, uno por PR, con TypeScript, Next.js en Vercel, Neon PostgreSQL, TypeScript validation, scopes tenant, auditoría, idempotencia y tests. Entrega lista de cambios por archivo, migración, contratos, tests unit/integration, ejemplo de ejecución y evidencia de aceptación. Si depende de Meta o TTS sin credenciales, crea adapter mock y marca claramente `BLOCKED_EXTERNAL`, no simules éxito real. Mantén approval gate humano inviolable y no generes datos o claims falsos. No declares fase terminada sin tests y mediciones.
