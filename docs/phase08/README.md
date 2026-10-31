# Fase 08: hardening y handover (sin pilotos)

Fecha: 31-10-2026. **NO_GO para el gate final.** Preparación técnica autorizada por el usuario sobre F00 a F07 sin firmar. No habilita publicación.

Esta fase pide diez documentales piloto, facturas reales, restore en Neon y la firma de los responsables. Nada de eso existe todavía: no hay credenciales de Meta, TTS ni LLM, Neon solo tiene un Preview de F01 en la PR #8, y no hay reviewer. Por eso solo se hizo lo que no depende de ellos. El estado por ticket está en [status.json](status.json).

## Estado por fase

Ninguna fase está aceptada: todos los gates siguen en **NO_GO**, sin firmar. "Local" significa PostgreSQL 17 y disco en esta máquina, con material y audio sintéticos.

| Fase | Funciona en local | Falta para aceptarla |
| --- | --- | --- |
| F00 | Contrato, render de 120 y 240 s, benchmark y mocks rotulados | Formato de Meta, TTS LATAM, derechos y firmas |
| F01 | Login, sesiones, MFA, roles, RLS y migraciones con checksum | Sesión real y MFA en Preview con Neon (PR #8), y firmas |
| F02 | Radar, fuentes, claims y revisión de dossier, por API | LLM real y firmas |
| F03 | Guiones versionados, escenas y revisión de la versión exacta, por API | LLM real y firmas |
| F04 | Biblioteca, licencias, voz por escena y control de gasto, por API | ElevenLabs y Blob reales, y firmas |
| F05 | Render con FFmpeg, worker aislado en Docker y cola durable | Worker desplegado, Blob, voz real, una persona que juzgue el video, y firmas |
| F06 | Revisión y aprobación por hash, por API | Interfaz y publicación (regla 2 de `AGENTS.md`), Meta y firmas |
| F07 | Indicadores de operación y coste por video, por API | Métricas de Meta, pilotos y firmas |
| F08 | Barrido de acceso, CSP, runbook y plan UAT en borrador | Pilotos, restore en Neon, costes reales, pentest y firmas |

## Qué se hizo

- **Plan de pilotos (F08-01):** [UAT-PLAN.md](UAT-PLAN.md), en borrador. Matriz de 10 pilotos por duración, material, origen visual y riesgo, con criterios de aceptación y motivos de parada. No elige temas ni lleva firmas.
- **Acceso entre organizaciones (F08-04):** `test:http` ya no prueba solo las rutas que alguien recordó. Lee todos los `route.ts` bajo `/api/organizations/{id}` y llama a cada uno de los 45 endpoints:
  - Con sesión, sobre una organización ajena: las lecturas deben dar 403. Las escrituras, 400, 403 o 415, porque validan el cuerpo antes de autorizar y un 400 no entrega nada. Un 2xx, 404 o 409 haría fallar la prueba, porque delataría que pasó la organización.
  - Sin sesión: 401 en todos.
  - Una ruta nueva sin autorización falla aquí sin tener que añadir su prueba.
- **CSP (F08-10):** `Content-Security-Policy` en todas las respuestas, con `frame-ancestors 'none'`, `object-src 'none'` y conexiones solo al propio origen. `test:http` falla si falta. `/login` carga sin violaciones en el navegador.
- **Dependencias y secretos (F08-10):** `npm audit` da 0 vulnerabilidades en runtime y 0 altas o críticas. Quedan 16 moderadas, solo de desarrollo: el `minimatch` de eslint, sin arreglo que no rompa, como en F01. El secret scan da 0 hallazgos.
- **Runbook del worker (F08-09):** [docs/17](../17-RUNBOOKS.md) lista los códigos de error reales de F05, si se reintentan y qué mirar en cada uno.
- **Benchmark:** `all_qa_passed` era `true` en escenarios sin ningún render correcto. Ahora es `null`.

## Lo que no está verificado

- `BLOCKED_EXTERNAL` **Pilotos, ffprobe de los masters, costes y política de Meta (F08-02, F08-03, F08-07 y F08-08):** sin credenciales ni reviewer no hay ningún video real.
- `BLOCKED_EXTERNAL` **Restore y rollback (F08-06):** Neon solo tiene el Preview de F01 de la PR #8, y nadie ha probado revertir un deployment de Vercel. Los scripts de rollback sí se ejecutan en transacción en las pruebas de PostgreSQL. RPO y RTO de Neon sin medir. Lo único hecho es un [simulacro local](evidence/restore-drill.txt): `pg_dump` y `pg_restore` de la base de desarrollo, 37 tablas y 316 filas en 11 s, con conteos, migraciones, RLS y permisos idénticos. Comprueba que la copia restaura el esquema y sus permisos, no cómo se comporta Neon.
- **Medición de F05:** la pasada oficial se interrumpió al caer Docker Desktop. Ver [docs/phase05](../phase05/README.md#mediciones). Hay que repetirla.
- **Carga y fallos (F08-05):** 429, 5xx, caída de worker y lease vencido están probados desde F04 y F05. No hay prueba de carga ni de disco lleno.
- **Personas (F08-09 a F08-11):** nadie de soporte ha ejecutado un incidente simulado, ningún desarrollador nuevo ha recreado DEV y nadie ha hecho un pentest.
- **Gate final (F08-12):** ninguna fase está firmada. No hay acta.
- **Neon:** F02 a F08 nunca han corrido contra Neon. La PR #8 conecta un Preview con las migraciones 001 a 006, y estas fases añaden de la 007 a la 011.

## Qué hace falta para seguir

- **Meta:** app, Page autorizada, permisos y App Review, para saber si acepta videos de 120 a 240 s. Hasta entonces no se puede construir el panel ni la publicación.
- **Voz:** clave de ElevenLabs, una voz LATAM elegida y su licencia.
- **LLM:** clave de un proveedor para radar y guiones. Debe pasar por `reserveSpend`, igual que TTS e imágenes.
- **Almacenamiento:** token de Vercel Blob.
- **Neon:** aplicar de la 007 a la 011 en la rama de Preview con la URL directa, y repetir `npm run check:environment`.
- **Worker:** decidir dónde corre. Vercel Functions está sin medir, y el worker nunca se ha desplegado.
- **Personas:** responsable editorial, legal y técnico para revisar `UAT-PLAN.md` y firmar los gates, un reviewer para los pilotos y un responsable de guardia.
- **Decisión editorial:** si un owner puede aprobar lo que creó. Hoy puede.

## Registro de deudas

Simplificaciones hechas a propósito, marcadas con `ponytail:` en el código.

| Dónde | Hoy | Cambiar cuando |
| --- | --- | --- |
| `apps/web/next.config.ts` | CSP con `'unsafe-inline'` y sin host de Blob | Las páginas muestren contenido de terceros (nonce) o exista el reproductor |
| `db/runtime-grants.sql` | El worker usa el mismo rol que la web | El worker corra fuera del proceso web |
| `db/migrations/007_research.sql` | El dominio aproxima la independencia de las fuentes | Subdominios o grupos de medios pasen por independientes |
| `research/policy.ts` | Sin adaptador real por plataforma | Haya acceso autorizado |
| `research/policy.ts` | Riesgo por palabras clave: solo añade, nunca reduce | La revisión humana no dé abasto |
| `scripts/policy.ts` | Atribución solo de nombres propios tras "según" | Igual: hoy lo cubre una persona |
| `media/policy.ts` | Márgenes del encuadre sin verificar contra Meta | Se valide el formato con Meta |
| `media/store.ts` | `VOICING` sin usar: voz y material van juntos | Haya que separarlos |
| `server/media-api.ts` | Subida en memoria hasta 50 MB, solo en local | Blob real: Vercel admite unos 4,5 MB |
| `render/plan.ts` | `-fs` por archivo, sin cuota del volumen | El worker salga a producción |
| `render/plan.ts` | `loudnorm` de una pasada | Con voz real se salga del margen |
| `render/plan.ts` | Una entrada por escena, unos 24 KB de comando | Suba el máximo de 120 escenas |
| `render/worker-cli.ts` | Un directorio de trabajo por worker | Dos workers deban compartirlo |
| `render/worker.ts` | Artefactos en memoria | Blob real: pasar a streams |
| `render/worker.ts` | CPU sin precio | Exista un worker facturado |
| `operations/store.ts` | `retried` mira solo la última tanda | Haga falta el historial completo |

## Riesgos abiertos

- **Fusionar en `main` despliega en Production.** Vercel desplegó así la PR #7 en `cluster-viral-engine.vercel.app`, una URL pública. La publicación sigue deshabilitada y no hay signup, pero conviene revisar las variables de Production antes de fusionar.
- **Sin límite de peticiones por organización:** solo limita el login. Una cuenta válida puede insistir contra la API.
- **Sin antivirus ni sandbox al subir archivos:** se comprueba el tipo por contenido, no más (`docs/13`, punto 6).
- **Sin DAST, pentest ni SBOM** (`docs/13`, punto 10). `npm audit` y el secret scan no los sustituyen.
- **Alertas sin canal:** la alerta de gasto del 80 % llega al outbox, y nada la entrega todavía.
- **Las mediciones son de esta máquina:** el worker nunca ha corrido en el servidor final.

## Diferencias con el plan y los requisitos

- **Un solo cambio para la fase** en vez de uno por ticket, como en F01 a F07.
- **CSP con `'unsafe-inline'` en scripts:** Next añade scripts de arranque en línea. Pasar a nonce con `proxy.ts` cuando las páginas muestren contenido de terceros, y añadir el host de Blob a `media-src` con el reproductor.
- **El barrido no prueba roles:** usa la cuenta local, que es editor. Los permisos por rol se prueban contra PostgreSQL desde F01.
- **Sin firmas inventadas:** el plan UAT y el gate quedan en blanco hasta que firmen las personas responsables.

## Ejecución

```powershell
npm run db:migrate
npm test
$env:PHASE01_TEST_ADMIN_URL='postgresql://<test-admin>@127.0.0.1:55432/postgres'
npm run test:db
npm run build
npm start
npm run test:http
npm audit --omit=dev --audit-level=moderate
npm run scan:secrets
```

## Evidencia

En [evidence/](evidence/), del 31-10-2026, sobre esta rama ya integrada con `main`: typecheck, lint, 55 unitarias (1 omitida: la del contenedor, con Docker parado), 73/73 en PostgreSQL con la suite de F00, `check:environment` en `READY` con las 11 migraciones, build, bundle de cliente, secret scan, `npm audit`, 174 comprobaciones HTTP contra el build de producción y el simulacro de restauración.

## Rollback y coste

Rollback: revertir la PR. No hay migración ni datos nuevos.

Coste: sin llamadas a proveedores ni servicios contratados.
