# Migraciones y rol de aplicación

La Fase 00 añade `003_phase00.sql` y rollback reversible de esa migración. Se verificaron las tres migraciones en PostgreSQL 17 local aislado, con rol restringido, RLS, concurrencia y auditoría append-only. Esto **no valida Neon ni el pooler real**. Ver `docs/phase00/README.md` para permisos mínimos y pruebas; el esquema de fases futuras sigue siendo diseño.

1. Provisionar **Neon branch de desarrollo vacía**, ejecutar SQL `001_init.sql`, luego `002_rls.sql` con rol de migración privilegiado.
2. Crear rol runtime restringido `cve_runtime` (NO SUPERUSER, NO BYPASSRLS, NO propiedad de tablas). Conceder `USAGE` schema y DML explícito sobre tablas necesarias. **No copiar la connection string de propietario al runtime**.
3. **NOTA importante:** una app basada en serverless HTTP SQL y RLS de `SET LOCAL` debe ejecutar setting y consulta en misma transacción. Evaluar driver/transaction semantics; si no se asegura, no declarar RLS listo. Controlar tenant también en backend.
4. `app_users` es global; requiere una política self-id especializada e integración de identidad verificada antes de usuarios reales. Su exposición HTTP está bloqueada por defecto en starter.
5. `claim_evidence` requiere además garantizar que `claim.project_id = source.project_id` por servicio/trigger, no solo tenant: crear test y constraint/trigger cuando se complete implementación.
6. Añadir control de `approvals` por transacción a nivel servicio; DDL por sí solo NO permite asegurar que aprobación corresponda a un video actual.
7. Las migraciones de este ZIP son **base de diseño**, no se probaron contra una instancia Neon real (no se dispuso de credenciales). Ejecutar tests de integración antes de usar producción.

## Consulta de jobs

```sql
BEGIN;
SELECT id, organization_id FROM jobs
 WHERE status IN ('QUEUED','RETRY_WAIT') AND scheduled_at <= now()
 ORDER BY scheduled_at ASC FOR UPDATE SKIP LOCKED LIMIT 1;
-- Actualizar RUNNING, attempt, locked_by y lease_expires_at antes de COMMIT.
COMMIT;
```

Un worker global que consume jobs de todos los tenants debe tener un diseño específico de identidad de servicio con permisos acotados y pruebas auditadas; no eliminar RLS globalmente por comodidad.
