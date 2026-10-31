# Fase 01: fundaciones en preparación

Fecha: 30-10-2026. **NO_GO para aceptación completa de fase y producción.** El usuario autorizó avanzar técnicamente después de levantar la aplicación local. Esa instrucción permite preparar estas fundaciones; no firma Fase 00, no aprueba material editorial ni habilita publicación. El acta F00 conserva NO_GO.

## Arranque local

Aplicación: **http://127.0.0.1:3000**. Acceso: **http://127.0.0.1:3000/login**. PostgreSQL de este proyecto: loopback:55432; no se alteró el servicio existente en 5432.

```powershell
# Windows con Node 22, Python 3 y PostgreSQL 17:
powershell -File scripts/start-local.ps1
```

El script inicializa un cluster local exclusivo si hace falta, instala el lockfile de la raíz, crea una base de desarrollo independiente y los dos roles restringidos, aplica migraciones y ejecuta Next. El cluster solo escucha en 127.0.0.1; trust es exclusivo del cluster de desarrollo local. No usar esa autenticación del servidor PostgreSQL en redes compartidas ni en cloud. No se detienen procesos ni se borra un cluster ajeno si el puerto está ocupado.

Si PostgreSQL ya está levantado:

```powershell
npm ci
npm run local:bootstrap
npm run db:migrate
npm run dev
```

Credenciales sintéticas: `.local/dev-access.txt` (privado, ignorado por Git). Configuración real del servidor: `apps/web/.env.local` (privada). El bootstrap se niega a sobrescribir configuración, bases o roles existentes sin su archivo correspondiente. El usuario de prueba es editor, no administrador, y no representa un correo verificado externamente. No hay signup público. El acceso local se comprobó por HTTP con una cookie real del proveedor.

## Implementación

Monorepo npm workspaces: `apps/web` y `packages/contracts`; una sola instalación y lockfile en raíz. `next.config.ts` fija la raíz de Turbopack/tracing, comparte contratos y separa `.next-dev` de `.next` para mantener el servidor local al construir producción. Los archivos generados `next-env.d.ts` y artefactos quedan fuera del repositorio. `apps/web/AGENTS.md` es la guía generada por Next para su versión instalada.

Identidad: Better Auth con sesiones PostgreSQL, signup cerrado, cookies HttpOnly, CSRF, TOTP y backup codes. [ADR de identidad](ADR-IDENTIDAD.md) detalla las alternativas, diferencias y rotación. La pantalla de cuenta muestra permisos y enrolamiento MFA; no es el dashboard editorial. Nuevos endpoints de lectura: `/api/me`, `/api/organizations/{id}/context`. Las rutas de stories siguen sin CRUD y ahora rechazan sesiones ausentes. No se agregó ningún endpoint de publicación.

Seguridad de tenant: `app_users` solo se lee bajo un subject autenticado; el actor se deriva en servidor, luego se consultan memberships y se aplica org en **la misma conexión/transacción**. Los roles no tienen BYPASSRLS ni propiedad/inherencia del propietario. RLS se fuerza y las FK de organización siguen activas. Un timeout o transacción abortada no puede devolver éxito ni dejar contexto en el pool. Owner/admin requieren MFA. Auth y app usan roles distintos y no leen las tablas privadas del otro.

Migraciones 001–006: runner con URL directa, un lock de sesión para serializar, checksum por archivo y transacciones. La segunda ejecución es no-op; cambios de bytes en migración aplicada se rechazan. Una base antigua con versiones sin checksum necesita un baseline revisado, no se adopta silenciosamente. No se implementó un flag que invente ese baseline. Preferir una branch nueva y restauración revisada para migrar instalaciones anteriores.

Logs: JSON con request ID y, cuando hay contexto autorizado, tenant/job. Se excluyen mensajes de excepción, SQL, payloads, emails, cookies, claves y URLs de conexión. El handler configura la biblioteca para propagar errores a esta frontera; su fallback imprimiría SQL crudo. Logs y respuestas de errores se correlacionan con `X-Request-Id`. No se creó un panel editorial para observar errores; usar el sistema de logs de la plataforma.

## Pruebas

```powershell
npm run lint
npm run typecheck
npm test
# PostgreSQL administrador de servidor desechable: la suite F01 crea/borra solo su DB cve_test_*.
$env:PHASE01_TEST_ADMIN_URL='postgresql://<test-admin>@127.0.0.1:55432/postgres'
npm run test:db
npm run build
npm run verify:client
npm run scan:secrets
npm run test:http
```

La suite F00 necesita además `PHASE00_TEST_ADMIN_URL` sobre una base nueva y vacía. CI configura ambas suites y PostgreSQL 17 efímero. El test de F00 no acepta esquemas previamente usados. `verify:client` inspecciona el bundle y, cuando existe configuración local, busca también los valores reales sin imprimirlos. `test:http` se limita a loopback y consume la cuenta sintética privada; comprueba home/login/health, 401, login, perfil, scope real, cabeceras falsas, 403 cruzado y logout.

Evidencia de ejecución y estado externo: [EVIDENCIA.md](EVIDENCIA.md), [estado de tickets](status.json), [contrato API](../../api/foundation.openapi.yaml). Las pruebas locales no certifican Neon, permisos cloud o aprobación humana.

## Vercel y Neon

Vercel: proyecto `cluster-viral-engine`, equipo del usuario, Node 22, Root Directory `apps/web`, instalación `npm ci --prefix ../..`, fuentes fuera de raíz activadas. Metadatos sin secretos en `infra/phase01-vercel.json`; el despliegue previsto es solo **Preview**. URL y pruebas HTTPS en `evidence/vercel-preview.json`.

**Incidente abierto (31-10-2026):** el primer deploy se creó como Production pese a `--target preview` y sirve públicamente `cluster-viral-engine.vercel.app`, sin base de datos ni secretos. Debe retirarse con el comando registrado en la evidencia. Para desplegar, usar `vercel deploy` sin `--target` y confirmar con `vercel inspect`. Desplegar desde `git archive`, no desde el árbol de trabajo, para no subir archivos privados.

Neon: la integración anunciada devolvió `Unknown tool` al listar proyectos y describir el proyecto. Se registra **BLOCKED_EXTERNAL**; no se inventan project IDs, ramas DEV/PREVIEW/PROD, credenciales, pruebas de pooler ni restauraciones. Los contratos exigen host Neon, `sslmode=verify-full` y endpoint pooled para runtime; migrador directo independiente. Las tres ramas deben tener endpoints/bases distintos, retención/límites definidos y aislamiento probado antes de marcar verificado. Desbloquearlo requiere una acción de cuenta: una `NEON_API_KEY` en el entorno o la integración Neon de Vercel.

El Preview puede mostrar la interfaz y health aun sin credenciales Neon; auth permanece cerrado con 503 BLOCKED_EXTERNAL. No copiar la cuenta de desarrollo ni su clave al Preview. El email de invitación/recuperación y el primer owner productivo necesitan un flujo revisado antes de habilitar usuarios externos.

## Operación, rollback y coste

No hay migración/deploy productivo automático desde PR. Checks requeridos: validate-blueprint, web-build y phase00-postgres; las Actions están fijadas por SHA. Los tests no usan secretos cloud. La promoción exige revisión humana y gates pendientes; un build verde no equivale a GO editorial.

Rollback: revertir cambios de aplicación/Preview, detener acceso y restaurar branch/snapshot o ejecutar 006/005/004 en orden inverso dentro de transacción. Se conserva `auth_events`; la reaplicación de 004 exige restauración revisada. Los tests comprobaron esa conservación y recuperación por rollback de transacción. No hay instrucciones para borrar Neon ni datos de producción.

Coste observado de servicios pagados: desconocido, no cero. No se cambió plan ni se contrató un servicio de identidad/email. Vercel usa configuración estándar de la cuenta y solo un Preview técnico; su facturación se concilia en cuenta. Neon no se provisionó por fallo del conector. Objetivo <100 USD/mes no validado. Los 40–55 h del plan no se sustituyen por el tiempo de ejecución de las herramientas.

**Diferencia con el plan:** el plan pide una PR por ticket; la entrega es una sola PR porque login, RLS y cliente DB comparten primitivas y no compilan por separado. Las doce fichas de `pr/` siguen como guía de revisión por ticket. No se declara la fase completa ni se fusiona producción automáticamente.
