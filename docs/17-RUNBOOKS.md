# 17 · Manual operativo e incident response

## Incidente: render fallido

1. Identificar job y `manifest_sha256`; comprobar media inputs y licencias.
2. Leer `ffmpeg stderr` sanitizado, límites CPU/RAM, disk, timeout y cuota.
3. Reproducir en worker sandbox con manifest inmutable; no editar producción.
4. Corregir manifest/asset/codec; incrementar revisión si cambia output.
5. Reencolar con nueva idempotency key solo si corresponda; registrar postmortem.

## Incidente: Meta devuelve 403

Comprobar token de Page, permisos, App Review, Page access, modo Live y endpoint/duración. No intentar evadir revisiones ni usar cookies; notificar al administrador y cambiar a exportación manual temporal si el negocio lo aprueba.

## Incidente: publicación de estado incierto

Bloquear retry. Consultar remote media IDs, logs de intento y Page por API oficial. Si remoto ya publicó, almacenar ID y marcar PUBLISHED. Si no se puede determinar, mantener `NEEDS_RECONCILIATION` para humano; no lanzar otra publicación ciega.

## Incidente: sobregasto

Desactivar nuevas llamadas IA/TTS/render, no borrar evidencias. Revisar ledger, duplicados de jobs, desviación del plan; ajustar caps y registrar autorización de incremento con owner.

## Incidente: acceso cross-tenant

Sev1: revocar sesión/token, detener endpoints afectados, preservar audit, activar respuesta a incidentes y evaluar obligación de notificación según jurisdicción. Crear prueba regresión. No borrar logs.

## Neon caído / corrupción

Comprobar panel provider y logs; poner APIs en estado degradado, pausar workers. Para corrupción: restaurar branch/snapshot o dump validado, comprobar conteos y hashes, y ejecutar smoke tests sobre rama nueva antes de promover. Medir RTO/RPO y registrar evidencia.

## Routine diaria/semanal

Diario: jobs DEAD, tokens, gastos del día, publicación pendiente, QA de un video. Semanal: reconciliar facturación, comprobar storage, revisar métricas a edad homogénea y backlog de riesgos. Mensual: restore drill y versión de API/licencias.
