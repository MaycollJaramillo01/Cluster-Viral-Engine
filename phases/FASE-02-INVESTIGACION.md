# Fase 02 · Radar editorial, búsqueda y verificación

**Esfuerzo previsto:** 45–65 horas, **duración orientativa:** 1–2 semanas, **responsables:** AI/backend, editor.

**Prerrequisito:** gate documentado y aprobado de la fase 01. El comienzo de una fase no habilita automáticamente la publicación en Meta.

## Objetivo verificable

Completar los cambios descritos abajo con evidencias de prueba y el gate final. Las horas son una estimación *sumada por fase* y presuponen personal competente en TypeScript, Postgres y FFmpeg. La aprobación editorial se mantiene durante todas las fases.

## Tareas atómicas, pruebas y entregables

### F02-01 · Diseñar modelo de story candidates

**Implementación:** Tabla stories/references/categories/status; filtros y orden. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F01-12`.

**Validación y aceptación:** Endpoints y migraciones con tenant scope. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.8–4.0 h**; área responsable: **backend**.

### F02-02 · Implementar importación referencias manuales

**Implementación:** Permitir URL social + captura metadata autorizada, sin scraping prohibido. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F02-01`.

**Validación y aceptación:** Formato y fecha/version de fuente guardados. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.5–5.0 h**; área responsable: **devops**.

### F02-03 · Integrar APIs de descubrimiento autorizadas

**Implementación:** Adapter por plataforma, fallbacks manuales, cuotas. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F02-02`.

**Validación y aceptación:** Si no hay permiso, UI indica limitación. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.2–6.0 h**; área responsable: **backend**.

### F02-04 · Generar propuestas IA estructuradas

**Implementación:** Título/resumen/hook/motivo/riesgo/material potencial, JSON Zod. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F02-03`.

**Validación y aceptación:** 3 propuestas reproducibles sin inventar fuentes. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.2–6.0 h**; área responsable: **devops**.

### F02-05 · Calcular score heurístico v1

**Implementación:** Pesos versionados, explicación y factors 0-100. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F02-04`.

**Validación y aceptación:** Unit tests con suma 100 y score 0-100. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.8–4.0 h**; área responsable: **devops**.

### F02-06 · Planificar búsqueda de investigación

**Implementación:** Queries diversas, primarias/secundarias, ventanas de tiempo. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F02-05`.

**Validación y aceptación:** Plan validado con contexto y riesgos. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.8–4.0 h**; área responsable: **devops**.

### F02-07 · Recuperar fuentes con atribución

**Implementación:** Fuente URL/fecha/editorial/tipo/cita mínima/fecha consulta. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F02-06`.

**Validación y aceptación:** ≥2 fuentes independientes cuando sea posible. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.8–7.0 h**; área responsable: **devops**.

### F02-08 · Extraer claims atómicos

**Implementación:** Clasificación de hecho/alegación/hipótesis/conflicto; JSON validado. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F02-07`.

**Validación y aceptación:** Each claim linked to evidence ids. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.2–6.0 h**; área responsable: **devops**.

### F02-09 · Detectar contradicciones y timelines

**Implementación:** Comparar claims y fechas; estatus judicial y eventos. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F02-08`.

**Validación y aceptación:** Dossier marca conflicto sin resolver. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.2–6.0 h**; área responsable: **devops**.

### F02-10 · Revisar riesgos editoriales

**Implementación:** Crimen, víctimas, menores, fuentes inestables y recreaciones. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F02-09`.

**Validación y aceptación:** Bloqueo de claims de alto riesgo no corroborados. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.5–5.0 h**; área responsable: **devops**.

### F02-11 · Implementar revisión humana de dossier

**Implementación:** Estado REVIEW + comentario + revisiones/autor. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F02-10`.

**Validación y aceptación:** Reviewer puede aprobar/rechazar exact revision. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.2–6.0 h**; área responsable: **editorial**.

### F02-12 · Prueba editorial y adversarial

**Implementación:** 10 historias de distintos riesgos; prompt injection simulado. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F02-11`.

**Validación y aceptación:** 0 evidencias inventadas sin marcar; registro de fallos. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.8–6.0 h**; área responsable: **editorial**.

## Gate de la fase 02

- [ ] Los 12 tickets anteriores cumplen su criterio de aceptación y tienen evidencia enlazada.
- [ ] CI, revisión técnica, seguridad de tenant y costos de uso no presentan fallas críticas.
- [ ] Material editorial de prueba no incluye afirmaciones no corroboradas ni assets sin licencia.
- [ ] El responsable entrega un acta GO/NO-GO y registra riesgos restantes.
- [ ] La documentación de arquitectura/operación refleja lo implementado, no lo planeado.

## Prompt operativo para un agente de desarrollo

> Actúa como ingeniero senior encargado de la **fase 02 — Radar editorial, búsqueda y verificación** de Cluster Viral Engine. Lee primero `source/requerimientos_originales.txt`, `README.md`, `docs/01-REQUISITOS-TRAZABILIDAD.md`, `docs/02-ARQUITECTURA-C4.md` y esta fase. Implementa únicamente tickets F02-01 a F02-12, uno por PR, con TypeScript, Next.js en Vercel, Neon PostgreSQL, TypeScript validation, scopes tenant, auditoría, idempotencia y tests. Entrega lista de cambios por archivo, migración, contratos, tests unit/integration, ejemplo de ejecución y evidencia de aceptación. Si depende de Meta o TTS sin credenciales, crea adapter mock y marca claramente `BLOCKED_EXTERNAL`, no simules éxito real. Mantén approval gate humano inviolable y no generes datos o claims falsos. No declares fase terminada sin tests y mediciones.
