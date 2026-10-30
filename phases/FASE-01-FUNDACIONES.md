# Fase 01 · Fundación Next.js, Neon, identidad, tenancy, CI

**Esfuerzo previsto:** 40–55 horas, **duración orientativa:** 1–2 semanas, **responsables:** Full-stack, DBA/SRE.

**Prerrequisito:** gate documentado y aprobado de la fase 00. El comienzo de una fase no habilita automáticamente la publicación en Meta.

## Objetivo verificable

Completar los cambios descritos abajo con evidencias de prueba y el gate final. Las horas son una estimación *sumada por fase* y presuponen personal competente en TypeScript, Postgres y FFmpeg. La aprobación editorial se mantiene durante todas las fases.

## Tareas atómicas, pruebas y entregables

### F01-01 · Crear repositorio y estructura modular

**Implementación:** Monorepo apps/web, packages/contracts, workers, scripts, docs; branches protegidas. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F00-12`.

**Validación y aceptación:** Build reproducible y PR template. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.2–3.0 h**; área responsable: **backend**.

### F01-02 · Desplegar proyecto Next.js en Vercel

**Implementación:** Configurar domains, preview, production y rootDirectory; deploy basico. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F01-01`.

**Validación y aceptación:** Rutas health y UI responden HTTPS. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.6–5.0 h**; área responsable: **devops**.

### F01-03 · Provisionar Neon por entorno

**Implementación:** Branches DEV/PREVIEW/PROD, URL pooled/unpooled, límites y retention. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F01-02`.

**Validación y aceptación:** Test de aislamiento entre entornos. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.9–4.0 h**; área responsable: **devops**.

### F01-04 · Versionar migraciones SQL

**Implementación:** Aplicar esquema inicial, schema_migrations y pipeline protegido. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F01-03`.

**Validación y aceptación:** Migraciones reejecutables o no-op y test DDL. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.4–6.0 h**; área responsable: **devops**.

### F01-05 · Elegir proveedor de identidad

**Implementación:** Evaluar Auth.js/Clerk/Neon Auth disponibilidad y MFA, seleccionar. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F01-04`.

**Validación y aceptación:** ADR+flujos de sesión con rotación. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.2–3.0 h**; área responsable: **devops**.

### F01-06 · Implementar login/sesión

**Implementación:** Cookies HttpOnly, CSRF, expiration, protect routes. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F01-05`.

**Validación y aceptación:** Tests 401/CSRF expiración. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.4–6.0 h**; área responsable: **backend**.

### F01-07 · Implementar memberships y RBAC

**Implementación:** Server-side roles owner/admin/editor/reviewer/analyst y scope derivado. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F01-06`.

**Validación y aceptación:** Deny by default en endpoints. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.4–6.0 h**; área responsable: **frontend**.

### F01-08 · Activar RLS segura Neon

**Implementación:** Role sin BYPASSRLS, políticas y org per transaction; tests. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F01-07`.

**Validación y aceptación:** Cross-tenant queries denegadas de forma reproducible. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.4–6.0 h**; área responsable: **devops**.

### F01-09 · Implementar cliente DB y transacciones

**Implementación:** Queries parametrizadas, pooled runtime, unpooled migración. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F01-08`.

**Validación y aceptación:** Sin secretos en navegador, manejo de timeouts. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.9–4.0 h**; área responsable: **devops**.

### F01-10 · Automatizar CI y PR gates

**Implementación:** Lint, typecheck, unit, migration smoke, secret scan, npm audit. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F01-09`.

**Validación y aceptación:** PR roja no despliega producción. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.6–5.0 h**; área responsable: **devops**.

### F01-11 · Instalar observabilidad inicial

**Implementación:** Structured logs con request/tenant/job, dashboard errores. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F01-10`.

**Validación y aceptación:** Errores correlacionables sin secretos. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.9–4.0 h**; área responsable: **devops**.

### F01-12 · Documentar bootstrap reproducible

**Implementación:** Manual variables, DNS, claves, scopes y rollback. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F01-11`.

**Validación y aceptación:** Otro developer recrea Preview sin ayuda. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.1–3.0 h**; área responsable: **devops**.

## Gate de la fase 01

- [ ] Los 12 tickets anteriores cumplen su criterio de aceptación y tienen evidencia enlazada.
- [ ] CI, revisión técnica, seguridad de tenant y costos de uso no presentan fallas críticas.
- [ ] Material editorial de prueba no incluye afirmaciones no corroboradas ni assets sin licencia.
- [ ] El responsable entrega un acta GO/NO-GO y registra riesgos restantes.
- [ ] La documentación de arquitectura/operación refleja lo implementado, no lo planeado.

## Prompt operativo para un agente de desarrollo

> Actúa como ingeniero senior encargado de la **fase 01 — Fundación Next.js, Neon, identidad, tenancy, CI** de Cluster Viral Engine. Lee primero `source/requerimientos_originales.txt`, `README.md`, `docs/01-REQUISITOS-TRAZABILIDAD.md`, `docs/02-ARQUITECTURA-C4.md` y esta fase. Implementa únicamente tickets F01-01 a F01-12, uno por PR, con TypeScript, Next.js en Vercel, Neon PostgreSQL, TypeScript validation, scopes tenant, auditoría, idempotencia y tests. Entrega lista de cambios por archivo, migración, contratos, tests unit/integration, ejemplo de ejecución y evidencia de aceptación. Si depende de Meta o TTS sin credenciales, crea adapter mock y marca claramente `BLOCKED_EXTERNAL`, no simules éxito real. Mantén approval gate humano inviolable y no generes datos o claims falsos. No declares fase terminada sin tests y mediciones.
