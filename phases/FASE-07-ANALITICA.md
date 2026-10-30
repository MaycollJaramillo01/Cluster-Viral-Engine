# Fase 07 · Métricas, costos y feedback editorial

**Esfuerzo previsto:** 35–50 horas, **duración orientativa:** 1 semana, **responsables:** Backend/data/frontend.

**Prerrequisito:** gate documentado y aprobado de la fase 06. El comienzo de una fase no habilita automáticamente la publicación en Meta.

## Objetivo verificable

Completar los cambios descritos abajo con evidencias de prueba y el gate final. Las horas son una estimación *sumada por fase* y presuponen personal competente en TypeScript, Postgres y FFmpeg. La aprobación editorial se mantiene durante todas las fases.

## Tareas atómicas, pruebas y entregables

### F07-01 · Modelar snapshots y taxonomía

**Implementación:** Definir source metric, definition, nullability, captured_at. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F06-12`.

**Validación y aceptación:** No mezclar definiciones Graph. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.4–3.4 h**; área responsable: **backend**.

### F07-02 · Construir MetricsProvider de Meta

**Implementación:** API versionada, permisos, paging, límites. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F07-01`.

**Validación y aceptación:** Datos reales donde disponibles. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.6–5.2 h**; área responsable: **frontend**.

### F07-03 · Programar snapshots 1h/24h/7d

**Implementación:** Scheduled jobs con windows y reconciliación. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F07-02`.

**Validación y aceptación:** Sin duplicados en ventana. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.0–4.3 h**; área responsable: **devops**.

### F07-04 · Implementar dashboard métricas

**Implementación:** Vistas, reach, watch time, shares y formatos faltantes. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F07-03`.

**Validación y aceptación:** No disponible distinto de 0. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.0–4.3 h**; área responsable: **frontend**.

### F07-05 · Agregar usage ledger proveedor

**Implementación:** Tokens/char/compute/storage/costos y estado. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F07-04`.

**Validación y aceptación:** Coste aproximado y final por video. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.6–5.2 h**; área responsable: **seguridad**.

### F07-06 · Presupuesto y alertas

**Implementación:** Soft/hard caps por org y job, umbrales. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F07-05`.

**Validación y aceptación:** Bloqueo automático de nuevas llamadas. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.0–4.3 h**; área responsable: **backend**.

### F07-07 · Comparación editorial

**Implementación:** Score v1 vs métricas comparables y temas. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F07-06`.

**Validación y aceptación:** Filtros por Page/edad video. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.0–4.3 h**; área responsable: **devops**.

### F07-08 · Exportar informes CSV

**Implementación:** Rangos, proyecciones y cohortes. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F07-07`.

**Validación y aceptación:** CSV reproducible y tenant-scoped. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.4–3.4 h**; área responsable: **devops**.

### F07-09 · Evaluación de score v1

**Implementación:** Revisar pesos sin sobreajustar, documentar limitación. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F07-08`.

**Validación y aceptación:** Informe con hipótesis y no predicciones falsas. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.0–4.3 h**; área responsable: **devops**.

### F07-10 · Simular métricas faltantes

**Implementación:** API retorna null/403/cambios de campos. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F07-09`.

**Validación y aceptación:** UI no inventa ingresos ni retención. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.4–3.4 h**; área responsable: **backend**.

### F07-11 · Instrumentar KPI operativos

**Implementación:** Tiempo humano, reproceso, costo fallo, lead time. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F07-10`.

**Validación y aceptación:** Panel fuente de métricas y alertas. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.0–4.3 h**; área responsable: **backend**.

### F07-12 · Control de presupuesto mensual

**Implementación:** Coste real vs US$100 y 30/60 vídeos. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F07-11`.

**Validación y aceptación:** Análisis de sensibilidad al cierre de 10 pilotos. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.6–3.6 h**; área responsable: **backend**.

## Gate de la fase 07

- [ ] Los 12 tickets anteriores cumplen su criterio de aceptación y tienen evidencia enlazada.
- [ ] CI, revisión técnica, seguridad de tenant y costos de uso no presentan fallas críticas.
- [ ] Material editorial de prueba no incluye afirmaciones no corroboradas ni assets sin licencia.
- [ ] El responsable entrega un acta GO/NO-GO y registra riesgos restantes.
- [ ] La documentación de arquitectura/operación refleja lo implementado, no lo planeado.

## Prompt operativo para un agente de desarrollo

> Actúa como ingeniero senior encargado de la **fase 07 — Métricas, costos y feedback editorial** de Cluster Viral Engine. Lee primero `source/requerimientos_originales.txt`, `README.md`, `docs/01-REQUISITOS-TRAZABILIDAD.md`, `docs/02-ARQUITECTURA-C4.md` y esta fase. Implementa únicamente tickets F07-01 a F07-12, uno por PR, con TypeScript, Next.js en Vercel, Neon PostgreSQL, TypeScript validation, scopes tenant, auditoría, idempotencia y tests. Entrega lista de cambios por archivo, migración, contratos, tests unit/integration, ejemplo de ejecución y evidencia de aceptación. Si depende de Meta o TTS sin credenciales, crea adapter mock y marca claramente `BLOCKED_EXTERNAL`, no simules éxito real. Mantén approval gate humano inviolable y no generes datos o claims falsos. No declares fase terminada sin tests y mediciones.
