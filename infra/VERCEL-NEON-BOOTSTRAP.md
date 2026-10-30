# Bootstrap de infraestructura — instrucciones

## Vercel

- Crear proyecto de repo privado; root directory `apps/web` y framework Next.js.
- Configurar domain TLS, `Production`/`Preview` envs, protección de Preview, alertas de errores y uso.
- Configurar `DATABASE_URL` (pooled) por entorno con **secrets**, nunca commit.
- Si existe integración Neon oficial: configurar branch por Preview; confirmar que las secrets Preview no apuntan a DB Production.
- Las funciones Next.js solo **orquestan**; no aceptar un render síncrono de 4 minutos por HTTP sin benchmarks.

## Neon

- Crear proyecto PostgreSQL; runtime user con privilegios mínimos, migrator separado.
- Migrations: `psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -1 -f db/migrations/001_init.sql`, y 002_rsl equivalente. **Probar primero en Development.**
- Habilitar auditoría, backups/restore según plan y efectuar restore drill.
- Configurar query timeout, pooling y retries específicos de serverless.

## Worker FFmpeg

- Docker container con FFmpeg auditado (licencia y codecs), usuario no-root, límites CPU/RAM/FS y sin acceso a redes internas.
- Jobs se asignan por lease/queue, se leen assets con pre-signed URLs de duración limitada, se confirma hash, se publica output en storage privado, se notifica fin de job autenticado.
- Despliegue externo puede ser Railway/Fly/VM/cloud-run-like previa comparación de precio; **no se ha seleccionado proveedor ni se incluye credencial real**.

## CI/CD

`git checkout -b feature/x` -> PR -> GitHub Actions validator -> Vercel Preview -> Neon Preview Branch -> migrations -> smoke/E2E -> merge -> expand migration -> deploy prod -> smoke -> log release. Rollback app separado de DB.
