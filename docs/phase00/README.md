# Fase 00: implementación local y expediente de aceptación

Fecha de corte: 30-10-2026. **Gate: NO_GO; fase sin aceptación final.**

Se implementan herramientas de factibilidad, sin dashboard nuevo ni publicación. El video técnico usa ocho diagramas originales, movimiento, fundidos y subtítulos. Incluye una pista AAC silenciosa rotulada: **no es narración TTS ni documental editorial aprobado**. Las duraciones de 120 y 240 segundos prueban formato y cómputo; el guion de 293 palabras está previsto para ensayar 120 segundos. La variante de cuatro minutos estira el timing para benchmark, no un guion aprobado de cuatro minutos.

## Ejecución reproducible

Desde la raíz, con Node 22, Python 3.13, FFmpeg/ffprobe con libx264 y libass y Arial o DejaVu Sans:

```powershell
python -m pip install -r workers/render/requirements-poc.txt
python workers/render/generate_dataset.py
cd apps/web
npm ci
npm run typecheck
npm test
npm run build
npm run poc -- validate
npm run poc -- reports
npm run poc -- render --seconds 120 --out ../../workers/render/out/demo-120
npm run poc -- render --seconds 240 --out ../../workers/render/out/demo-240
npm run poc -- benchmark --runs 10 --out ../../workers/render/out/benchmarks-v2
```

Cada benchmark hace diez ejecuciones por duración: veinte renders reales locales. Cada directorio contiene MP4, SRT/ASS, manifiesto, métricas por proceso, checksum de artefacto/inputs/código, ffprobe y auditoría local. Se necesita espacio para intermedios; los binarios se excluyen de Git. `samples.json` y `benchmarks.json` se actualizan tras cada ejecución. p50/p95 usan nearest-rank y se separan por proveedor y duración. RAM pico y CPU son **muestreados cada 100 ms**, no mediciones del host entero ni telemetría cloud. Nunca se deduce coste monetario de la latencia.

Repetir `render` con los mismos inputs y salida valida el hash y reutiliza el archivo; un cambio de inputs provoca conflicto. Un lock de directorio niega ejecución simultánea en la misma salida. Tras caída, inspeccionar el proceso y su evidencia antes de retirar `.render-lock`; no existe reintento automático de una operación incierta. El modo local no es una frontera de seguridad para usuarios hostiles del mismo equipo.

## PostgreSQL / Neon

Migraciones: `001_init.sql`, `002_rls.sql`, `003_phase00.sql`, en ese orden, en una base/branch vacía. `003` agrega `phase00_runs`, RLS forzado, clave idempotente por org/proyecto/operación, integridad de proyecto/actor y protección de registros terminales y auditoría. La reserva y sus eventos de auditoría/outbox comparten una transacción. El estado inicial `RUNNING` es una reserva; no hay dispatcher automático en esta fase. Si el operador cae, queda pendiente de reconciliación, sin reintento ciego.

Rol runtime: NO SUPERUSER, NO BYPASSRLS, no miembro del propietario. Conceder `USAGE` sobre `public`; `SELECT` sobre `memberships`, `projects`, `phase00_runs`; `INSERT,UPDATE` sobre `phase00_runs`; `INSERT` sobre `audit_events,outbox_events`. No conceder UPDATE/DELETE de auditoría. Las credenciales se suministran por entorno. El actor procede de una sesión verificada futura o de un operador de confianza; **no se admite un actor enviado por HTTP**. Los endpoints existentes de CRUD siguen sin implementar.

```powershell
# Solo una base vacía y desechable. No usar producción ni una branch con datos.
$env:PHASE00_TEST_ADMIN_URL='postgresql://<test-admin>@127.0.0.1:55432/phase00_test'
npm run test:db

# Modo CLI persistente: organization/project/membership deben existir en esa branch.
$env:PHASE00_DATABASE_URL='<runtime URL desde entorno protegido>'
$env:PHASE00_ACTOR_ID='<UUID de operador autorizado>'
npm run poc -- render --key F00-04-demo-v1 --seconds 120 --out ../../workers/render/out/persisted-demo
```

El test de integración aplica migraciones, crea un rol restringido y datos de dos organizaciones. Se niega a ejecutarse sobre un esquema ya existente. La CI usa PostgreSQL 17 efímero. Las pruebas locales contra PostgreSQL 17 no verifican el pooler ni un despliegue de Neon. No se ejecutaron migraciones sobre Neon sin acceso.

Rollback: exportar evidencia, detener operaciones, ejecutar `db/rollback/003_phase00.sql` en transacción; conserva auditoría y elimina la tabla de runs. Retirar el código nuevo junto con la migración. No usar CASCADE ni borrar auditoría.

## Artefactos y contratos

`contract.ts` es el contrato TypeScript/Zod; `schemas/phase00-manifest.schema.json` es su exportación JSON Schema 2020-12, separada del borrador de manifiesto de producción. `npm run poc -- schema` regenera el esquema; los tests detectan deriva. JSON Schema comprueba estructura; TypeScript añade referencias, timeline continuo, duración total, cantidad de recursos, derechos y scope. `fixtures/phase00/invalid-manifest.json` demuestra rechazo. Los estados PENDING son obligatorios hasta revisión real.

`store.ts` implementa transacciones, autorización y auditoría persistente. `render.ts` ejecuta procesos con argumentos, sin shell, limita rutas reales al directorio de assets y verifica ffprobe. Los overlays salen del manifiesto y se escapan mediante validación; los subtítulos tienen márgenes laterales 110 px e inferior 340 px. No se aceptan rutas HTTP ni descargas arbitrarias en el render.

`providers.ts` solo contiene mocks de Meta/TTS: devuelven `BLOCKED_EXTERNAL`, `remote_id=null`, `actual_cost_usd=null`. No generan voz ni realizan OAuth/uploads. `subtitles.ts` convierte timestamps del proveedor cuando existan; el fixture usa tiempos estimados que no se presentan como forced alignment. No hay aprobación editorial automatizada. `reports.ts` calcula estadísticas, costes parciales y acta; el reporte local jamás habilita publicación, aun con un GO administrativo futuro.

## Estado por ticket y entregas para revisión

| Ticket | Implementación revisable | Aceptación pendiente |
|---|---|---|
| F00-01 | Matriz 1–20, diferencias, roles, no-go, registro auditado | Firma del cliente y aprobación de casos |
| F00-02 | Historia de bajo riesgo, 2 fuentes, 8 diagramas y guion | Revisión de claims/derechos y aceptación de dataset ilustrado |
| F00-03 | Zod, JSON Schema, fixtures y tests | Revisión técnica del contrato |
| F00-04 | Render técnico 1080×1920/30 fps y evidencia ffprobe | Calidad audiovisual humana con voz real |
| F00-05 | Mock TTS y clave de cache por org/voz/modelo/settings | BLOCKED_EXTERNAL: voz LATAM, ensayo 3 min, consumo/reintentos/factura |
| F00-06 | Exportación SRT/ASS, conversión de timestamps y zona segura | BLOCKED_EXTERNAL: alineación con voz y aprobación audiovisual |
| F00-07 | Runner y p50/p95 local por 120/240 s | BLOCKED_EXTERNAL: Vercel, tarifas, comparación y decisión final de worker |
| F00-08 | Matriz y contrato bloqueado | BLOCKED_EXTERNAL: App/Page, OAuth, scopes, review y versión reales |
| F00-09 | Dry-run mock separado por PAGE_VIDEO/REEL, hash exacto | BLOCKED_EXTERNAL: demo humano aprobado y vídeo remoto trazable |
| F00-10 | Checklist de derechos/originalidad y reconstrucciones | Aceptación editorial/legal cuando corresponda |
| F00-11 | Ledger nulo explícito, fórmulas 30/60, tests | BLOCKED_EXTERNAL: conciliación de facturas, cloud y minutos humanos |
| F00-12 | Acta computada NO_GO con hash de evidencia | Comité editorial/técnico y firmas; depende de los once anteriores |

La preparación técnica de un ticket no satisface sus dependencias ni permite aprobarlo antes que el anterior. No hay firmas de cliente/revisor inventadas. Se preparan doce fichas en `docs/phase00/pr/`, una por futura PR, con archivos, diseño, pruebas, rollback y coste. La entrega se preparó originalmente en una carpeta sin Git y se publica después en [MaycollJaramillo01/Cluster-Viral-Engine](https://github.com/MaycollJaramillo01/Cluster-Viral-Engine). Las fichas son documentos para futuras revisiones; no son PR abiertas. Esta primera entrega corresponde a Fase 00 con gate NO_GO; Fase 01 sigue pendiente de su prerrequisito.

Consultar [TRAZABILIDAD.md](TRAZABILIDAD.md), [DATASET.md](DATASET.md), [META.md](META.md), [EDITORIAL.md](EDITORIAL.md), [COSTOS.md](COSTOS.md), [MEDICIONES.md](MEDICIONES.md) y [EVIDENCIA.md](EVIDENCIA.md).
