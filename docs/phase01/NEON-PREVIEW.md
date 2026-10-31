# Neon conectado: entorno de Preview aislado

La conexión de Vercel corresponde al recurso `neon-cerise-saddle`, proyecto Neon
`lingering-art-50517638`. La rama principal `br-dark-snow-b809s3vu` conserva el
esquema administrado `neon_auth`; no se aplicaron allí las tablas de la aplicación.
El proveedor de identidad de la aplicación sigue siendo Better Auth propio,
según el ADR existente. No se migró a Neon Auth por activar su opción en Marketplace.

## Preparación verificada

- Rama de aplicación: `cve-preview-foundations` (`br-autumn-base-b8zn5dub`).
- PostgreSQL observado: 18.6. Las pruebas CI continúan usando PostgreSQL 17.
- Migraciones 001–006 aplicadas y checksums verificados; repetición directa: seis no-op.
- `npm run check:environment`: `DATABASE_READY`, roles y migraciones `READY`.
- Roles separados de aplicación y auth, sin SUPERUSER, BYPASSRLS, CREATEDB,
  CREATEROLE, propiedad ni herencia del rol migrador.
- Variables de aplicación añadidas solo a Preview de `codex/neon-preview`;
  no se cambiaron las variables globales de la integración ni las de producción.
- La credencial migradora directa no se entrega a la aplicación desplegada.
- Cuenta inicial preparada con correo sin verificar; el acceso se entrega mediante
  invitación manual privada, sin afirmar que se envió email. Owner requiere MFA
  para acceder a recursos de organización. No se publican contraseñas ni enlaces
  de verificación en Git.

La primera ejecución del runner recibió la URI pooled que devolvió el conector;
las seis migraciones finalizaron. Se corrigió la conexión a la URI directa y se
repitió el runner: seis migraciones omitidas y checksums coincidentes. No usar
la URI pooled en migraciones futuras: el advisory lock es de sesión.

La cuenta rechaza modificar `suspend_timeout_seconds` desde la API. La creación
de la rama se completó conservando el valor permitido por el proveedor y compute
de 0.25 CU. No se cambió el plan Free. Coste real y presupuesto mensual siguen
pendientes de conciliación; no se declara coste cero.

## Origen y acceso del Preview

Con `APP_ENV=preview`, `VERCEL=1` y `VERCEL_ENV=preview`, la aplicación puede usar
`https://$VERCEL_BRANCH_URL` si no hay `BETTER_AUTH_URL` explícita. Se acepta
exclusivamente un hostname `*.vercel.app`, sin rutas, credenciales ni puertos.
No se confía en Host/Origin de una petición. Producción sigue requiriendo su
origen explícito. El alias estable evita invalidar el origen al reconstruir el Preview.

Tras entrar, cambiar la contraseña inicial en Cuenta y seguridad y activar TOTP.
El cambio exige la contraseña actual y revoca otras sesiones. El formulario no
guarda contraseñas en almacenamiento del navegador. El signup público permanece
cerrado y la publicación sigue deshabilitada.

## Validación y rollback

Pruebas nuevas: origen de Preview válido, variables ausentes, host malicioso,
configuración de producción, contraseña actual incorrecta, longitud insuficiente,
cambio correcto, rechazo de contraseña anterior y revocación de otra sesión.
El resto de las suites de identidad, RLS y migraciones se mantiene.

La suite de fundaciones se ejecutó contra una base desechable creada dentro de
la rama de Preview en Neon 18.6: 15 pruebas pasaron, cero fallaron. La suite F00
se omitió en esa ejecución porque no recibió una base vacía propia; se mantiene
en CI. La suite ahora usa HTTPS y configuración Preview al recibir un host Neon,
manteniendo HTTP local en CI. El caso de cambio de contraseña usa otra IP
sintética para no agotar el límite de login de los casos previos; no se desactiva
el rate limiting. El correo de la primera cuenta permanece sin verificar hasta
que su destinatario abra el enlace de invitación entregado privadamente.

Rollback de código: revertir esta PR. Dejar de usar el Preview y retirar sus
variables específicas desde Vercel si se abandona el entorno. No eliminar ramas
ni usuarios ni restaurar datos de forma automática; conservar auditoría. No hay
migraciones nuevas en esta PR. La promoción a producción y el gate de aceptación
de Fase 00/Fase 01 siguen pendientes; no se implementa dashboard editorial.
