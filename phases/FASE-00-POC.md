# Fase 00 · Factibilidad, PoC audiovisual y conexión Meta

**Esfuerzo previsto:** 40–60 horas, **duración orientativa:** 1–2 semanas, **responsables:** Tech lead, Multimedia, Meta integrator.

**Prerrequisito:** documento fuente y acceso a entorno de PoC. El comienzo de una fase no habilita automáticamente la publicación en Meta.

## Objetivo verificable

Completar los cambios descritos abajo con evidencias de prueba y el gate final. Las horas son una estimación *sumada por fase* y presuponen personal competente en TypeScript, Postgres y FFmpeg. La aprobación editorial se mantiene durante todas las fases.

## Tareas atómicas, pruebas y entregables

### F00-01 · Reunir requerimientos y criterios de bloqueo

**Implementación:** Inventariar requisitos secciones 1–20, formato final, video target y roles; acordar casos de prueba. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `NINGUNA`.

**Validación y aceptación:** Matriz firmada por cliente con no-go claros. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.1–3.1 h**; área responsable: **devops**.

### F00-02 · Definir dataset de prueba documental

**Implementación:** Seleccionar historia de bajo riesgo con 8–12 assets licenciados y 2 fuentes independientes; preparar 120s de guion. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F00-01`.

**Validación y aceptación:** Storyboard reproducible, licencias y claims validados. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.8–4.1 h**; área responsable: **devops**.

### F00-03 · Diseñar contrato de escenas JSON

**Implementación:** Definir timing ms, narración, sources, overlays y asset license status; validar JSON Schema. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F00-02`.

**Validación y aceptación:** Manifest fixture válido y ejemplo inválido rechazado. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.8–4.1 h**; área responsable: **devops**.

### F00-04 · Producir PoC de imágenes con movimiento

**Implementación:** FFmpeg Ken Burns, filtros escala/pad, 1080x1920, 30fps; 120–240s. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F00-03`.

**Validación y aceptación:** Render con al menos 8 recursos y transiciones legibles. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **4.1–6.2 h**; área responsable: **devops**.

### F00-05 · Generar voz y medir TTS

**Implementación:** Ensayar voces español LATAM, 3 min y coste real caracteres/reintentos. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F00-04`.

**Validación y aceptación:** Elección de voz documentada y coste medido. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.4–5.2 h**; área responsable: **multimedia**.

### F00-06 · Crear subtítulos temporizados

**Implementación:** Probar timestamps del proveedor o forced align, SRT/ASS y zona segura. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F00-05`.

**Validación y aceptación:** Diferencia audiovisual aceptada por reviewer. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.4–5.2 h**; área responsable: **multimedia**.

### F00-07 · Comparar RenderProvider local y Vercel

**Implementación:** 10 benchmarks de 2 y 4 min; CPU/RAM/latencia/coste; señalar límites. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F00-06`.

**Validación y aceptación:** Tabla p50/p95 y elección explícita de worker. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.4–5.2 h**; área responsable: **devops**.

### F00-08 · Verificar Meta OAuth/Page

**Implementación:** Crear App/Page autorizada y verificar permisos reales, review, token, version. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F00-07`.

**Validación y aceptación:** Matriz permisos y método de subida aprobado o bloqueo. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.4–5.2 h**; área responsable: **seguridad**.

### F00-09 · Probar 2–4 min con API oficial Meta

**Implementación:** Hacer dry-run y subir solo demo aprobado a Page de prueba; separar Reels/Page videos. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F00-08`.

**Validación y aceptación:** Video remoto trazable o gap explícito con alternativa manual. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **5.5–8.3 h**; área responsable: **devops**.

### F00-10 · Evaluar política derechos y originalidad

**Implementación:** Matriz licencias, reenactment labels y monetización, opinión legal si alto riesgo. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F00-09`.

**Validación y aceptación:** Checklist editorial y política propuesta. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.8–4.1 h**; área responsable: **devops**.

### F00-11 · Calcular coste de video prueba

**Implementación:** Registrar TTS, LLM, render, imágenes, almacenamiento y minutos humanos. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F00-10`.

**Validación y aceptación:** Costo/video observado y extrapolación 30/60. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **3.4–5.2 h**; área responsable: **multimedia**.

### F00-12 · Gate de salida firmado

**Implementación:** Revisión del comité editorial y técnico con pruebas audiovisuales, Meta y costos. **Entradas:** expediente/version vigente y configuración de organización; **salida:** artefacto o registro versionado, trazable por proyecto; **dependencia:** `F00-11`.

**Validación y aceptación:** GO/NO-GO registrado; tareas bloqueadas si falla. Implementar al menos prueba de camino feliz, error externo, autorización `organization_id`, repetición concurrente si la tarea crea recurso costoso y auditoría de cambios. Adjuntar evidencia real a la PR; no aceptar solamente resultado generado por LLM. Estimación: **2.9–4.1 h**; área responsable: **editorial**.

## Gate de la fase 00

- [ ] Los 12 tickets anteriores cumplen su criterio de aceptación y tienen evidencia enlazada.
- [ ] CI, revisión técnica, seguridad de tenant y costos de uso no presentan fallas críticas.
- [ ] Material editorial de prueba no incluye afirmaciones no corroboradas ni assets sin licencia.
- [ ] El responsable entrega un acta GO/NO-GO y registra riesgos restantes.
- [ ] La documentación de arquitectura/operación refleja lo implementado, no lo planeado.

## Prompt operativo para un agente de desarrollo

> Actúa como ingeniero senior encargado de la **fase 00 — Factibilidad, PoC audiovisual y conexión Meta** de Cluster Viral Engine. Lee primero `source/requerimientos_originales.txt`, `README.md`, `docs/01-REQUISITOS-TRAZABILIDAD.md`, `docs/02-ARQUITECTURA-C4.md` y esta fase. Implementa únicamente tickets F00-01 a F00-12, uno por PR, con TypeScript, Next.js en Vercel, Neon PostgreSQL, TypeScript validation, scopes tenant, auditoría, idempotencia y tests. Entrega lista de cambios por archivo, migración, contratos, tests unit/integration, ejemplo de ejecución y evidencia de aceptación. Si depende de Meta o TTS sin credenciales, crea adapter mock y marca claramente `BLOCKED_EXTERNAL`, no simules éxito real. Mantén approval gate humano inviolable y no generes datos o claims falsos. No declares fase terminada sin tests y mediciones.
