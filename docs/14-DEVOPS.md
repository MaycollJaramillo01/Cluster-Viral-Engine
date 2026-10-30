# 14 · Infraestructura y despliegue Vercel + Neon

## Entornos

`development`: Neon no productivo, Blob sandbox, Meta API mock. `preview`: Vercel Preview + rama Neon aislada, datos sintéticos y secretos reducidos. `production`: Vercel Pro estimado, Neon Launch/Scale según carga, storage privado, Meta Live al obtener permisos.

## Bootstrap seguro

1. Crear repo privado y activar 2FA, branch protection, required checks, secret scanning.
2. Crear proyecto Vercel, conectar repo, Root Directory `apps/web`, target Next.js. Configurar dominios HTTPS y variables exclusivas por entorno.
3. Crear Neon, configurar pooling para runtime y URL directa separada para migraciones. Habilitar backups/restore de acuerdo con plan contratado.
4. Integración Vercel/Neon y Preview database branches si disponible. Probar PR con migration. **No correr migraciones contra producción desde Preview**.
5. Crear Blob/R2/S3; token con permisos mínimos; políticas de acceso y lifecycle.
6. Desplegar worker Docker FFmpeg externo si PoC lo exige. Configurar consumo de jobs con permiso limitado y autenticación mutua/firmas.
7. Configurar observabilidad y alertas antes de API Meta Live.

## Variables

Consultar `apps/web/.env.example`; no subir secretos. `DATABASE_URL` runtime pooled; `DATABASE_URL_UNPOOLED` para DDL, `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `META_*`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `WORKER_SHARED_SECRET`, `CRON_SECRET`, `MAX_COST_USD_PER_VIDEO`. Variables sensibles solo del lado server. **El .env no contiene tokens reales**.

## CI/CD

GitHub Actions corre Python validator, unit tests TypeScript cuando se instalen, lint, `tsc --noEmit`, SCA y build. Vercel Preview para PRs; migraciones en rama Neon; smoke test en Preview. Merge con aprobación; despliegue de DB en expand/contract antes del código compatible. Rollback Vercel no revierte DDL.

## Monitoreo y SLO

Métricas: `job_queue_depth`, `job_oldest_age`, `render_p95_minutes`, `failure_rate`, `media_egress_bytes`, `cost_usd_per_video`, `meta_publish_failures`, `token_refresh_failures`, `tenant_denied_attempts`. Todos los logs con org_id, project_id, job_id y request_id, **nunca secretos**.

## Seguridad de migraciones

`psql -v ON_ERROR_STOP=1` con direct URL en entorno protegido; respaldar previo y verificar `schema_migrations`; migraciones transaccionales. Prohibido editar una migration aplicada; crear nueva. Restauración drill trimestral.
