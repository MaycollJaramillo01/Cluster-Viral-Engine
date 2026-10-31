# Conexión pendiente de Neon y verificación del entorno

Comprobación de cuenta: **31-10-2026**. La integración Neon responde y lista proyectos,
pero no existe un proyecto dedicado a Cluster Viral Engine. La única organización
accesible está administrada por Vercel. `create_project` devuelve
`action restricted; reason: "organization is managed by Vercel"`. No se creó una base
alternativa ni se reutilizó la de otra aplicación. Vercel no tiene variables
configuradas para este proyecto en la comprobación realizada.

## Acción de cuenta necesaria

En Vercel, abrir el proyecto **cluster-viral-engine → Storage → Create Database → Neon**.
Crear una base dedicada; revisar el plan y sus límites antes de aceptar un coste.
Conectarla inicialmente a Development/Preview. Este procedimiento no autoriza una
promoción a Production ni levanta el gate editorial.

Después de crear la base:

1. Mantener ramas separadas para desarrollo, Preview y producción, sin copiar datos
   de usuarios a entornos de prueba. No apuntar dos entornos al mismo endpoint/base.
2. Desde un entorno de administración autorizado, aplicar las migraciones con
   `npm run db:migrate`, una URL **directa** y `sslmode=verify-full`.
3. Provisionar dos roles LOGIN propios sin SUPERUSER, BYPASSRLS, propiedad ni
   membresía en el rol migrador. Aplicar `db/runtime-grants.sql` con esos nombres.
   La integración puede entregar una URL de propietario: no usarla como runtime.
4. Configurar `DATABASE_URL` y `AUTH_DATABASE_URL` con esos roles distintos y el
   endpoint **pooled** de la misma rama/base. Configurar `DATABASE_URL_UNPOOLED`
   solo en el entorno de administración que ejecuta migraciones y diagnósticos;
   el servidor web no necesita esa credencial privilegiada.
5. Completar `APP_ENV`, `BETTER_AUTH_URL` (origen HTTPS exacto) y una
   `BETTER_AUTH_SECRET` aleatoria de al menos 32 caracteres. Usar el gestor de
   variables de Vercel o `apps/web/.env.local`; no pegar claves en chat ni Git.
6. Ejecutar `npm run check:environment` desde la raíz en el entorno autorizado.

El diagnóstico abre transacciones de solo lectura, verifica que los roles no
heredan propiedad ni pueden saltarse RLS, exige cinco tablas con RLS forzado,
comprueba separación entre identidad y aplicación y rechaza auditorías modificables.
Contrasta las seis migraciones y sus checksums mediante la conexión directa.
Devuelve códigos sin mensajes del driver ni URLs, y sale con código 1 si falla.
No amplía los permisos de runtime para leer el historial de migraciones.

`DATABASE_READY` confirma estas comprobaciones de base de datos; no prueba login
de extremo a extremo, aislamiento entre ramas, email, TTS, facturación ni Meta.
El siguiente paso es probar sesión real, MFA, aislamiento de organizaciones y
Preview HTTPS antes de aceptar la fase. No crear usuarios de producción con
`seedDevelopmentIdentity`: ese helper solo crea identidades sintéticas locales.

## Arranque en Linux/macOS

Con PostgreSQL 17, Node 22 y Bash instalados:

```bash
# Si pg_ctl no está en PATH, indicar el directorio de PostgreSQL:
export CVE_PG_BIN=/ruta/a/postgresql/17/bin
npm run local:start
```

El launcher detecta `pg_ctl`/`pg_config`, inicializa un cluster propio dentro del
proyecto y escucha solo en `127.0.0.1:55432`, con sockets Unix deshabilitados.
Instala el lockfile, crea la cuenta sintética privada, migra y arranca Next.
No detiene PostgreSQL del sistema; un puerto ocupado provoca un error. La
autenticación trust es exclusivamente para este desarrollo en un equipo propio,
no para un servidor compartido. En Windows sigue disponible `scripts/start-local.ps1`.

## Diseño, diferencias, rollback y coste

Este cambio cubre preparación de F01-03/F01-08/F01-12. Los bloqueos de Meta y
narración de Fase 00 siguen vigentes. No implementa el dashboard posterior al gate,
de acuerdo con `AGENTS.md`. Se agrupan los cambios en una PR porque comparten el
diagnóstico y las pruebas de fundaciones; esto difiere de la recomendación de una
PR por ticket. No se declara la fase completa.

Rollback: revertir estos scripts, los comandos npm y las pruebas añadidas. No hay
migraciones nuevas ni cambios de datos que revertir. El launcher deja el cluster
local disponible; el operador puede detener exclusivamente ese cluster con
`pg_ctl -D .local/postgres stop` (o `.phase00-postgres` si fue el reutilizado).
El diagnóstico no consume APIs de pago; cada ejecución sí puede despertar compute
de Neon. Los costes reales de base de datos y del piloto siguen sin conciliarse.
