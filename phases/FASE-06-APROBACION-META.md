# Fase 06 · Panel revisión, seguridad editorial y publicación

**Esfuerzo previsto:** 40–60 horas, **duración orientativa:** 1–2 semanas, **responsables:** Full-stack, Meta integrator, reviewer.

**Prerrequisito:** gate documentado y aprobado de la fase 05. El comienzo de una fase no habilita automáticamente la publicación en Meta.

## Objetivo verificable

Completar los cambios descritos abajo con evidencias de prueba y el gate final. Las horas son una estimación *sumada por fase* y presuponen personal competente en TypeScript, Postgres y FFmpeg. La aprobación editorial se mantiene durante todas las fases.

## Tareas atómicas, pruebas y entregables

### F06-01 · Dashboard de proyectos y estados

**Implementación:** Vista de pipeline por estado/owner/aging. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F05-12`.

**Validación y aceptación:** Filtros por tenant y roles. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.5–3.7 h**; área responsable: **frontend**.

### F06-02 · Editor de escenas + player

**Implementación:** Preview, reorder, compare version, comments y thumbnails. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F06-01`.

**Validación y aceptación:** Cambios invalidan render aprobado. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.7–5.5 h**; área responsable: **frontend**.

### F06-03 · Bandeja de revisión y asignación

**Implementación:** Revisor ve fuentes, claims, licencias, coste y video. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F06-02`.

**Validación y aceptación:** Gate bloquea si falta evidencia. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.1–4.6 h**; área responsable: **devops**.

### F06-04 · Aprobar render inmutable

**Implementación:** Approval vinculada a render hash, usuario y timestamp. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F06-03`.

**Validación y aceptación:** No basta aprobar un proyecto. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.3–6.5 h**; área responsable: **multimedia**.

### F06-05 · Implementar OAuth Meta/Page

**Implementación:** State, permisos, token cifrado, revoked management. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F06-04`.

**Validación y aceptación:** Page conectada sin token en cliente. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.3–6.5 h**; área responsable: **devops**.

### F06-06 · Diseñar publicación por adapter

**Implementación:** Page video/Reels según compatibilidad comprobada, copy y schedule. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F06-05`.

**Validación y aceptación:** Dry-run payload verificado. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.7–5.5 h**; área responsable: **devops**.

### F06-07 · Implementar idempotencia de publish

**Implementación:** Unique key, remote lookup, reconcile on timeout. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F06-06`.

**Validación y aceptación:** Cero duplicados bajo fallas simuladas. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.7–5.5 h**; área responsable: **devops**.

### F06-08 · Validar Graph API y App Review

**Implementación:** Page de prueba, condiciones de duración y permisos. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F06-07`.

**Validación y aceptación:** Video de 2–4 min aceptado o salida bloqueada. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.3–6.5 h**; área responsable: **devops**.

### F06-09 · Añadir notificaciones

**Implementación:** Aviso contenido listo/aprobación/errores y re-auth. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F06-08`.

**Validación y aceptación:** Notificación sin filtrar datos de otro tenant. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.5–3.7 h**; área responsable: **devops**.

### F06-10 · Historial de publicaciones

**Implementación:** Estado, remote id, error redacted, retry manual. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F06-09`.

**Validación y aceptación:** Auditoría completa por versión. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.5–3.7 h**; área responsable: **devops**.

### F06-11 · Pruebas negativas de permisos

**Implementación:** Cross-org, viewer approve, canceled render, no license. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F06-10`.

**Validación y aceptación:** 403/409 adecuados, sin publicación. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.1–4.6 h**; área responsable: **multimedia**.

### F06-12 · UAT con reviewer real

**Implementación:** Piloto completo de revisión/corrección/aprobación. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F06-11`.

**Validación y aceptación:** Acta firmada de gate editorial. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.3–3.7 h**; área responsable: **devops**.

## Gate de la fase 06

- [ ] Los 12 tickets anteriores cumplen su criterio de aceptación y tienen evidencia enlazada.
- [ ] CI, revisión técnica, seguridad de tenant y costos de uso no presentan fallas críticas.
- [ ] Material editorial de prueba no incluye afirmaciones no corroboradas ni assets sin licencia.
- [ ] El responsable entrega un acta GO/NO-GO y registra riesgos restantes.
- [ ] La documentación de arquitectura/operación refleja lo implementado, no lo planeado.

## Prompt operativo para un agente de desarrollo

> Actúa como ingeniero senior encargado de la **fase 06 — Panel revisión, seguridad editorial y publicación** de Cluster Viral Engine. Lee primero `source/requerimientos_originales.txt`, `README.md`, `docs/01-REQUISITOS-TRAZABILIDAD.md`, `docs/02-ARQUITECTURA-C4.md` y esta fase. Implementa únicamente tickets F06-01 a F06-12, uno por PR, con TypeScript, Next.js en Vercel, Neon PostgreSQL, TypeScript validation, scopes tenant, auditoría, idempotencia y tests. Entrega lista de cambios por archivo, migración, contratos, tests unit/integration, ejemplo de ejecución y evidencia de aceptación. Si depende de Meta o TTS sin credenciales, crea adapter mock y marca claramente `BLOCKED_EXTERNAL`, no simules éxito real. Mantén approval gate humano inviolable y no generes datos o claims falsos. No declares fase terminada sin tests y mediciones.
