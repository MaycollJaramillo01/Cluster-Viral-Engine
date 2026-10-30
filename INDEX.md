# Índice detallado

## Documento base

`source/requerimientos_originales.txt`: texto exacto recibido del cliente.

## Diseño

`docs/00..19` cubren diagnóstico, trazabilidad, arquitectura, ADRs, jobs, base de datos, interfaces, investigación, guiones, FFmpeg, Facebook, costos, riesgos, seguridad, despliegue, QA, analítica, escalado y runbooks.

## Ejecución y pruebas

`phases/FASE-00..08`: 9 fases con objetivos, 108 tareas, estimación por ticket, dependencias, pruebas y prompts para agentes. `backlog/backlog.csv` es la versión importable de las tareas. `scripts/validate_package.py` comprueba integridad de proyecto y 380–550h sumadas.

## Código de referencia

`apps/web` arranque Next.js 16, UI informativa y API `health`; los endpoints de datos no implementados devuelven 501 por seguridad. `db/migrations` crea tablas y RLS de ejemplo que requieren test en Neon real y runtime role adecuado. `workers/render/poc.sh` PoC audiovisual sintética; `api/openapi.yaml` contrato de REST diseñado.

## Limitaciones claras

El ZIP no contiene claves, conexión real a Neon, Meta App aprobada, licencia de medios, ni los 10 videos documentales finales. Es el **paquete de ingeniería y plan de implementación solicitado**, no el producto construido.
