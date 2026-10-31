# CLUSTER VIRAL ENGINE — Blueprint técnico Vercel + Neon

**Fecha de corte: 30-10-2026 · Idioma: español · Versión: 1.0 (plan técnico y código de referencia)**

Este paquete es una **propuesta técnica ejecutable por fases**, no una aplicación SaaS finalizada. Incluye requerimientos trazables, arquitectura, un esquema SQL inicial, especificación de API, backlog importable, ejemplos de código seguro, PoC reproducible de FFmpeg, pruebas de validación, plantillas y guías de operación.

## Resultado de la evaluación

- **Viable condicionalmente** si se valida primero la calidad del render y el mecanismo oficial de publicación Meta para videos de 120–240 segundos. **No asumir que el flujo específico de Facebook Reels acepta 2–4 minutos**: la documentación oficial consultada para el flujo Reels contiene restricciones que deben comprobarse con la versión de API y cuenta reales.
- **Vercel + Neon son el núcleo obligatorio**: Next.js (panel/API/orquestación) en Vercel, PostgreSQL en Neon (datos, auditoría, jobs y costes), almacenamiento de objetos para medios; **worker de FFmpeg aparte** si la PoC de rendimiento de funciones Vercel no satisface SLO/coste.
- Meta, TTS, LLM y archivos externos se integran solo por interfaces/adaptadores. **Publicación imposible sin aprobación humana verificable**.
- Meta de gasto **<USD 100/mes no está garantizada**: se mide con diez videos y se imponen límites por organización y video.
- Duración de desarrollo estimada: **380–550 horas**. Estimación exploratoria y no cotización contractual.

## Orden sugerido para leer e implementar

1. `docs/00-DIAGNOSTICO-Y-GATES.md`: decisiones que bloquean el proyecto.
2. `docs/01-REQUISITOS-TRAZABILIDAD.md` + `docs/02-ARQUITECTURA-C4.md`: alcance, seguridad y componentes.
3. `phases/FASE-00-POC.md` y `workers/render/README.md`: ejecutar y evaluar la PoC antes del panel.
4. `phases/FASE-01-FUNDACIONES.md` … `phases/FASE-08-UAT.md`: entregables fase por fase.
5. `backlog/backlog.csv`: tareas atómicas con ID, dependencia y criterio de aceptación.
6. `db/migrations/001_init.sql`, `docs/05-BASE-DE-DATOS.md`: Neon y aislamiento multi-tenant.
7. `api/openapi.yaml` + `schemas/*.json`: contratos propuestos, **no implementaciones completas**.
8. `docs/11-COSTOS.md` + `costos/*.csv`: presupuestos variables y umbrales.
9. `docs/14-DEVOPS.md` + `docs/17-RUNBOOKS.md`: despliegue, colas, incidentes.

## Qué se puede ejecutar realmente

La preparación de **Fase 01** añade arranque local, login/sesiones/MFA con PostgreSQL, scopes/RLS y migraciones con checksum. Consultar [docs/phase01/README.md](docs/phase01/README.md) para bootstrap, acceso local, Preview y bloqueos externos. No se considera fase aceptada ni habilita publicación.

Arranque en Linux/macOS: `npm run local:start`. Diagnóstico de roles y migraciones
sin modificar datos: `npm run check:environment`. El bloqueo actual de creación
de Neon desde una organización administrada por Vercel y los pasos para resolverlo
están en [DESBLOQUEO-NEON.md](docs/phase01/DESBLOQUEO-NEON.md).

La implementación local de **Fase 00** está descrita en [docs/phase00/README.md](docs/phase00/README.md): contrato validado, dataset de ocho ilustraciones, render de 120/240 s, benchmark medido, mocks explícitos, pruebas PostgreSQL y gate **NO_GO**. Meta, TTS LATAM, Neon/Vercel reales, derechos y firmas siguen pendientes. No hay endpoint de publicación nuevo.

```bash
# Prueba de render local: requiere ffmpeg, ffprobe y python3.
bash workers/render/poc.sh
bash workers/render/check_output.sh workers/render/out/poc.mp4 12

# Validación de documentación / contratos / backlog (stdlib Python).
python3 scripts/validate_package.py

# Monorepo Next.js: instalación desde la raíz y servidor local.
npm ci
# PostgreSQL local listo en 127.0.0.1:55432:
npm run local:bootstrap
npm run db:migrate
npm run dev
```

> El PoC genera **material sintético de prueba**, no un documental publicado. Nunca se habilita Meta para producción hasta completar OAuth, App Review, permisos, pruebas end-to-end y el gate de aprobación. Los endpoints no implementados en el starter devuelven 501, por diseño.

## Convenciones

- `FUENTE` = requerimiento indicado por Cluster Media, adjunto en `source/requerimientos_originales.txt`.
- `DISEÑO` = propuesta de arquitectura; debe aprobarse.
- `VERIFICAR` = condición externa que no podemos dar por satisfecha sin acceso a cuentas/API o benchmark.
- `MVP` = exactamente una organización + roles + pipeline aprobado + publicación en una Page autorizada + métricas disponibles. SaaS comercial y facturación quedan fuera.
- Cualquier URL o precio en la investigación puede cambiar; validar en fuentes oficiales antes de contratar o desplegar.

## Árbol del paquete

`docs/` diseño profundo · `phases/` historias, tareas, pruebas y prompts por fase · `backlog/` CSV · `db/` migraciones · `api/` OpenAPI · `schemas/` contratos · `workers/` render de referencia · `apps/web/` starter Next.js · `diagrams/` Mermaid · `infra/` despliegue · `costos/` escenarios · `templates/` formularios/editorial · `scripts/` comprobaciones.

**Límite principal:** El código aportado demuestra patrones y la PoC, no sustituye implementación, revisión de seguridad, permisos Meta ni diez pruebas reales.
