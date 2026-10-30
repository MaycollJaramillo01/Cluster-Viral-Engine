# Fase 03 · Generador de guiones y edición versionada

**Esfuerzo previsto:** 45–60 horas, **duración orientativa:** 1–2 semanas, **responsables:** AI/backend, frontend/editor.

**Prerrequisito:** gate documentado y aprobado de la fase 02. El comienzo de una fase no habilita automáticamente la publicación en Meta.

## Objetivo verificable

Completar los cambios descritos abajo con evidencias de prueba y el gate final. Las horas son una estimación *sumada por fase* y presuponen personal competente en TypeScript, Postgres y FFmpeg. La aprobación editorial se mantiene durante todas las fases.

## Tareas atómicas, pruebas y entregables

### F03-01 · Definir esquema guion JSON

**Implementación:** Hooks, narración, beats, escenas, claim links y duración. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F02-12`.

**Validación y aceptación:** Schema y fixtures válidos/inválidos. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.0–4.0 h**; área responsable: **devops**.

### F03-02 · Seleccionar modelos por costo/calidad

**Implementación:** Eval 10 historias con mismo prompt y fuentes, score rubric. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F03-01`.

**Validación y aceptación:** Comparativa quality/cost reproducible. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.8–5.0 h**; área responsable: **devops**.

### F03-03 · Implementar prompt de storytelling seguro

**Implementación:** Separar evidencias de instrucciones y citas obligatorias. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F03-02`.

**Validación y aceptación:** Sin claims sin fuente crítica aprobada. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.8–5.0 h**; área responsable: **devops**.

### F03-04 · Producir 3 hooks y títulos

**Implementación:** Generación JSON valida, riesgo semántico y alternativas. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F03-03`.

**Validación y aceptación:** 3 hooks y ≥3 títulos para cada script. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.0–4.0 h**; área responsable: **devops**.

### F03-05 · Estimar duración y ritmo

**Implementación:** Calcular palabras/idioma con ajuste por voz; marcar estimación. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F03-04`.

**Validación y aceptación:** Se comparan predicción y audio real. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.8–5.0 h**; área responsable: **devops**.

### F03-06 · Transformar guion en escenas

**Implementación:** Divide en escenas con claim refs, assets sugeridos y timing. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F03-05`.

**Validación y aceptación:** Manifest exportable sin campos faltantes. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.5–6.0 h**; área responsable: **editorial**.

### F03-07 · Diseñar editor de secciones

**Implementación:** Editable por párrafo, autosave y respuesta ante error. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F03-06`.

**Validación y aceptación:** Editar sin perder versiones previas. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.5–6.0 h**; área responsable: **devops**.

### F03-08 · Aplicar control de versiones optimista

**Implementación:** Version/revision, If-Match o transacción, audit. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F03-07`.

**Validación y aceptación:** 409 cuando dos editores pisan misma escena. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.8–5.0 h**; área responsable: **devops**.

### F03-09 · Regeneración parcial

**Implementación:** Párrafo con contexto y claim scope; otras escenas intactas. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F03-08`.

**Validación y aceptación:** Hash no cambia en escenas no afectadas. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.5–6.0 h**; área responsable: **devops**.

### F03-10 · Integrar revisión de guion

**Implementación:** Aprobación por reviewer de revisión exacta. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F03-09`.

**Validación y aceptación:** Edición posterior invalida aprobación. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.0–4.0 h**; área responsable: **devops**.

### F03-11 · Evaluar fidelidad factual

**Implementación:** Test 10 historias: trace claims, no inventar citas. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F03-10`.

**Validación y aceptación:** Informe por claim y errores. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.8–5.0 h**; área responsable: **devops**.

### F03-12 · Preparar API y UI de edición

**Implementación:** Errores 401/403/409, skeleton loading, estados. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F03-11`.

**Validación y aceptación:** E2E editor-reviewer completado. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.5–5.0 h**; área responsable: **devops**.

## Gate de la fase 03

- [ ] Los 12 tickets anteriores cumplen su criterio de aceptación y tienen evidencia enlazada.
- [ ] CI, revisión técnica, seguridad de tenant y costos de uso no presentan fallas críticas.
- [ ] Material editorial de prueba no incluye afirmaciones no corroboradas ni assets sin licencia.
- [ ] El responsable entrega un acta GO/NO-GO y registra riesgos restantes.
- [ ] La documentación de arquitectura/operación refleja lo implementado, no lo planeado.

## Prompt operativo para un agente de desarrollo

> Actúa como ingeniero senior encargado de la **fase 03 — Generador de guiones y edición versionada** de Cluster Viral Engine. Lee primero `source/requerimientos_originales.txt`, `README.md`, `docs/01-REQUISITOS-TRAZABILIDAD.md`, `docs/02-ARQUITECTURA-C4.md` y esta fase. Implementa únicamente tickets F03-01 a F03-12, uno por PR, con TypeScript, Next.js en Vercel, Neon PostgreSQL, TypeScript validation, scopes tenant, auditoría, idempotencia y tests. Entrega lista de cambios por archivo, migración, contratos, tests unit/integration, ejemplo de ejecución y evidencia de aceptación. Si depende de Meta o TTS sin credenciales, crea adapter mock y marca claramente `BLOCKED_EXTERNAL`, no simules éxito real. Mantén approval gate humano inviolable y no generes datos o claims falsos. No declares fase terminada sin tests y mediciones.
