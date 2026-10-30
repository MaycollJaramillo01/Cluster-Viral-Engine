# 02 · Arquitectura detallada — Vercel + Neon

## C1 · Contexto

Usuarios editoriales acceden por HTTPS a plataforma en Vercel; el sistema utiliza Neon como verdad transaccional y APIs de búsqueda/LLM/TTS/Meta y objeto para medios. **Datos externos no son instrucciones para el agente**.

## C2 · Contenedores lógicos

1. **Web/BFF** Next.js App Router en Vercel: sesiones, RBAC, UI, validación Zod, endpoints REST, envío de jobs, webhooks.
2. **Core domain** TypeScript: stories, research, scripts, scenes, approvals, budgets, publication; sin SDK directamente.
3. **Postgres Neon**: entidades, jobs, outbox, auditoría, metadatos assets, métricas.
4. **Media storage**: privado para originales y narraciones; acceso mínimo; públicamente accesible solo cuando la API necesita URL de lectura autorizada.
5. **Worker renderer**: proceso CPU intensivo con FFmpeg; idealmente Docker en compute aislado. Puede probarse Vercel Function para workloads acotados, pero fallback definido.
6. **Job dispatcher**: poller/queue y leases persistentes; webhooks firman y verifican origen.
7. **External adapters**: Researcher, LlmProvider, TtsProvider, AssetProvider, RenderProvider, MetaPublisher, MetricsProvider.

## C3 · Módulos por carpeta

- `modules/editorial`: referencia, discovery, ranking, fuentes.
- `modules/research`: query planning, evidence, contradiction report, citation map.
- `modules/script`: hooks, versiones, scene planner, estimated speech timing.
- `modules/media`: assets, license, audio cache, subtitles.
- `modules/render`: manifest, render jobs, transcoding, QA ffprobe.
- `modules/approval`: policy checks, version lock, audit.
- `modules/publication`: OAuth, tokens cifrados, Graph versions, scheduling, idempotency.
- `modules/analytics`: snapshots, normalized metrics, outcome feedback.

## Flujo en una solicitud

`UI -> Server Action/Route Handler -> auth -> membership/RBAC -> validate schema -> domain service -> Neon transaction -> outbox event -> job dispatcher -> external adapter -> object store -> Neon state -> UI polling`.

Ningún request HTTP bloquea esperando un video. Para eventos largos: persistir job (`QUEUED`), emitir evento, devolver `202 + job_id`, progreso por polling. La cola puede duplicar entrega: los consumidores deben verificar `idempotency_key`, lease y versión.

## Estados permitidos

`DISCOVERED -> RESEARCHING -> RESEARCH_REVIEW -> SCRIPTING -> SCRIPT_REVIEW -> ASSETING -> VOICING -> RENDERING -> VIDEO_REVIEW -> APPROVED -> PUBLISHING -> PUBLISHED` con `FAILED`, `REJECTED` y transiciones correctivas explícitas. Toda transición exige `actor_id` o identidad de worker y evento auditado. Aprobar requiere rev/version target exacta. Si cambia guion, asset o composición, invalidar aprobación de render.

## RenderProvider y adaptadores

Contrato: `submit(manifest, idempotency_key) -> render_job_id`; `status(id) -> RUNNING|SUCCEEDED|FAILED`; `cancel(id)`; `getArtifact(id)->object_key`. Implementación A: ffmpeg local/Docker. B: worker remoto HTTP autenticado o cola. Nunca enviar `ffmpeg -i <user provided>` concatenando shell; comandos con array de argumentos, paths normalizados, sandbox de salida y allowlist de codecs.

## Multi-tenant

Cada tabla de negocio incluye `organization_id`. FKs compuestas `(organization_id, parent_id)` previenen cruces accidentalmente. RLS en Neon para tablas de negocio; la app debe configurar claims/tenant por transacción y **no usar roles con BYPASSRLS para tráfico de usuarios**. Se conserva RBAC en API aun con RLS. UUID no es autorización.

## Consistencia / idempotencia

- Outbox insertado en la misma transacción que el cambio de estado.
- Job gana lease con `FOR UPDATE SKIP LOCKED`, `lease_expires_at`, `attempt`.
- Cache TTS con hash `(sha256(text|voice|model|settings|locale))` por org.
- Render con `manifest_sha256`; cambios invalidan solamente pistas dependientes.
- Publicación: `UNIQUE(organization_id, render_id, page_id, publication_kind)`; lock transaccional; consultar id remoto si timeout; jamás reintentar un POST no idempotente a ciegas.

## Datos y privacidad

Tokens cifrados AES-GCM (clave en KMS/env protegida, rotación), acceso de lectura solo adapter. Registrar metadatos y no copiar textos completos de contenidos ajenos. Excluir PII innecesaria; purga y retención configurables. No usar ficheros privados como URL pública permanente.

## Diagrama

Ver `diagrams/c4-container.mmd`, `diagrams/state-machine.mmd` y `diagrams/sequence-publish.mmd`.
