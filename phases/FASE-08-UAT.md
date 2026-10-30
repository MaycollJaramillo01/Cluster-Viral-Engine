# Fase 08 · Hardening, diez videos piloto y handover

**Esfuerzo previsto:** 30–55 horas, **duración orientativa:** 1–2 semanas, **responsables:** Tech lead, QA, SRE, editor.

**Prerrequisito:** gate documentado y aprobado de la fase 07. El comienzo de una fase no habilita automáticamente la publicación en Meta.

## Objetivo verificable

Completar los cambios descritos abajo con evidencias de prueba y el gate final. Las horas son una estimación *sumada por fase* y presuponen personal competente en TypeScript, Postgres y FFmpeg. La aprobación editorial se mantiene durante todas las fases.

## Tareas atómicas, pruebas y entregables

### F08-01 · Formalizar plan UAT

**Implementación:** Matriz 10 videos y calificaciones narrativas/legales. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F07-12`.

**Validación y aceptación:** Acta de alcance aprobada. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **1.6–2.9 h**; área responsable: **devops**.

### F08-02 · Crear 10 documentales de prueba

**Implementación:** Completar de fuente a export, supervisados. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F08-01`.

**Validación y aceptación:** 10 outputs y fuentes trazables. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.2–7.7 h**; área responsable: **editorial**.

### F08-03 · Validar medios con ffprobe

**Implementación:** 1080x1920, fps, H264, audio, duracion, subtítulos. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F08-02`.

**Validación y aceptación:** 10 informes automatizados aprobados. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.1–3.9 h**; área responsable: **devops**.

### F08-04 · Ejecutar pruebas multi-tenant/RBAC

**Implementación:** Asumir identidad A/B y roles; 403/404 y RLS. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F08-03`.

**Validación y aceptación:** 0 accesos indebidos. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.6–4.8 h**; área responsable: **seguridad**.

### F08-05 · Realizar pruebas de carga y fallos

**Implementación:** Simular provider 429/5xx, queue restart, filesystem full. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F08-04`.

**Validación y aceptación:** SLO aceptables, sin publish duplicado. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.6–4.8 h**; área responsable: **backend**.

### F08-06 · Probar restore y rollback

**Implementación:** Restauración Neon en branch de ensayo, Vercel revert. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F08-05`.

**Validación y aceptación:** RPO/RTO real documentado. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.6–4.8 h**; área responsable: **devops**.

### F08-07 · Reconciliar costos reales

**Implementación:** Comparar 10 videos con provider billing y proyección. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F08-06`.

**Validación y aceptación:** Dictamen <100 mensual fundado en medición. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.6–4.8 h**; área responsable: **devops**.

### F08-08 · Verificar política Meta y derechos

**Implementación:** Assets y voces de 10 videos, contenido IA, App Review. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F08-07`.

**Validación y aceptación:** Checklist con cero incumplimientos críticos. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.6–4.8 h**; área responsable: **integraciones**.

### F08-09 · Documentar operación y on-call

**Implementación:** Runbooks Meta/worker/DB/costos; responsables. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F08-08`.

**Validación y aceptación:** Soporte ejecuta incidente simulado. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.1–3.9 h**; área responsable: **devops**.

### F08-10 · Revisar seguridad/supply chain

**Implementación:** Scan dependencias, secrets, CSP, logs, pentest básico. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F08-09`.

**Validación y aceptación:** 0 críticas abiertas. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.6–4.8 h**; área responsable: **devops**.

### F08-11 · Completar documentación entrega

**Implementación:** Arquitectura actualizada, ADR, APIs, README, historial. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F08-10`.

**Validación y aceptación:** Nuevo desarrollador recrea DEV/Preview. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.1–3.9 h**; área responsable: **devops**.

### F08-12 · Gate final go/no-go

**Implementación:** Reunir stakeholders, firmar evidencia, roadmap SaaS. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F08-11`.

**Validación y aceptación:** Registro de deudas, aceptación o rollback. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.3–3.9 h**; área responsable: **devops**.

## Gate de la fase 08

- [ ] Los 12 tickets anteriores cumplen su criterio de aceptación y tienen evidencia enlazada.
- [ ] CI, revisión técnica, seguridad de tenant y costos de uso no presentan fallas críticas.
- [ ] Material editorial de prueba no incluye afirmaciones no corroboradas ni assets sin licencia.
- [ ] El responsable entrega un acta GO/NO-GO y registra riesgos restantes.
- [ ] La documentación de arquitectura/operación refleja lo implementado, no lo planeado.

## Prompt operativo para un agente de desarrollo

> Actúa como ingeniero senior encargado de la **fase 08 — Hardening, diez videos piloto y handover** de Cluster Viral Engine. Lee primero `source/requerimientos_originales.txt`, `README.md`, `docs/01-REQUISITOS-TRAZABILIDAD.md`, `docs/02-ARQUITECTURA-C4.md` y esta fase. Implementa únicamente tickets F08-01 a F08-12, uno por PR, con TypeScript, Next.js en Vercel, Neon PostgreSQL, TypeScript validation, scopes tenant, auditoría, idempotencia y tests. Entrega lista de cambios por archivo, migración, contratos, tests unit/integration, ejemplo de ejecución y evidencia de aceptación. Si depende de Meta o TTS sin credenciales, crea adapter mock y marca claramente `BLOCKED_EXTERNAL`, no simules éxito real. Mantén approval gate humano inviolable y no generes datos o claims falsos. No declares fase terminada sin tests y mediciones.
