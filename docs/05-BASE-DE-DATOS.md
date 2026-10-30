# 05 · Neon Postgres: modelo, migraciones y aislamiento

## Convenciones

- PostgreSQL 16+ compatible; `pgcrypto`/`gen_random_uuid` según compatibilidad del proyecto Neon.
- Timestamps `timestamptz`, estado `text` + CHECK, money `numeric(12,5)`, métricas `bigint`, IDs `uuid`.
- `organization_id` no puede cambiar tras crear el registro.
- `GET/POST` desde aplicación resuelven org desde sesión, no desde un input arbitrario.
- `scripts/migrate.sh` aplica migraciones numeradas mediante URL **directa** con `psql ON_ERROR_STOP=1`; no usar URL de pooler en DDL si hay limitaciones de transacciones.

## Tablas principales

`organizations`, `app_users`, `memberships`, `projects`, `references`, `stories`, `sources`, `claims`, `claim_evidence`, `scripts`, `script_versions`, `scenes`, `assets`, `asset_licenses`, `tts_generations`, `renders`, `approvals`, `social_accounts`, `publications`, `metrics_snapshots`, `provider_usage`, `jobs`, `outbox_events`, `audit_events`.

Neon no es storage de video. Guardar `object_key`, `mime`, `sha256`, `size_bytes`, autorización/licencia y tags. Tokens externos se cifran fuera del SQL.

## RLS

`db/migrations/002_rls.sql` contiene políticas de ejemplo basadas en `current_setting('app.organization_id', true)`. Esto exige crear y usar un **rol runtime sin BYPASSRLS y sin ser propietario** de las tablas. Los owners pueden bypass RLS salvo FORCE; se usa FORCE para las tablas incluidas. Configurar `SET LOCAL app.organization_id = '<uuid>'` dentro de la misma transacción que las consultas. En pooler transaction-mode nunca confiar en estado de sesión fuera de la transacción. Si se usa el driver HTTP de Neon sin transacciones compartidas y SET LOCAL, adoptar aislamiento mediante consultas con org_id y un adapter seguro; no proclamar RLS efectivamente activado hasta su prueba end-to-end.

## Claves compuestas

`organization_id` figura en índices y FKs de hijos principales. Revisar el DDL con un Postgres/Neon real: es un esquema de arranque, no migration history ya ejecutada. No abrir la API a usuarios hasta comprobar `deny cross-tenant` y que las funciones no ejecutan como DB owner.

## Branching

- Development: branch o proyecto Neon no productivo.
- Preview: branch automática por deployment si integración lo permite.
- Production: rama principal independiente con migraciones primero expand y luego contract.
- Datos reales nunca duplicados a previews sin anonimización.

## Respaldo y recuperación

Definir RPO/RTO; validar capacidades reales de restore por plan. Ejecutar `pg_dump` lógico cifrado externo + restore drill mensual y registrar checksum/tiempo de recuperación. Restore de Neon no sustituye pruebas de integridad.
