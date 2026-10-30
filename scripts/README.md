# Scripts disponibles

`python3 scripts/validate_package.py` valida estructura, schemas JSON, tareas, horas y dependencias. `bash scripts/migrate.sh` requiere Neon directo + psql, no se ejecuta automáticamente. `bash workers/render/poc.sh` crea MP4 sintético sin llamadas externas.

En CI real añadir `npx tsc`, tests RLS en branch Neon, schema validator AJV, tests integraciones mocked, E2E y auditoría de dependencias.
