# Fase 02: radar editorial e investigación

Fecha: 31-10-2026. **NO_GO para aceptación de fase.** Preparación técnica autorizada por el usuario sobre F00 y F01 sin firmar. No habilita publicación.

## Qué funciona

API por organización bajo `/api/organizations/{id}`, contrato en [research.openapi.yaml](../../api/research.openapi.yaml):

- **Historias:** crear, listar con filtros y seleccionar. Seleccionar crea un solo proyecto aunque se repita. El score v1 (0–100) guarda pesos, versión y explicación por factor. Es orientativo. Las de riesgo `HIGH` no se listan salvo que se pidan explícitamente.
- **Referencias:** registro manual de URLs con plataforma, versión, fecha y análisis. El servidor no descarga esas URLs: no hay scraping ni SSRF.
- **Plan de investigación:** consultas primarias, secundarias y de contraste, con ventana temporal y versión.
- **Fuentes y claims:** cada claim exige evidencia de fuentes del mismo proyecto. Se clasifica como confirmado, disputado, alegación, sin verificar, opinión o reconstrucción. Estado judicial: investigado, acusado, condenado, absuelto o proceso abierto.
- **Dossier:** revisión congelada por hash, con cronología y conflictos de fuentes, estado judicial y fechas.
- **Revisión humana:** un reviewer aprueba o rechaza el hash exacto. La transacción relee la base y rechaza si el contenido cambió. Editar un claim borra su verificación.

## Reglas de bloqueo

No se aprueba un dossier con: claims sin evidencia; `CONFIRMED` sin soporte o contradicho; claim de alto riesgo sin dos dominios independientes o una fuente primaria; alto riesgo o claim de modelo sin verificación humana; riesgo criminal sin estado judicial. Un modelo nunca confirma: su `CONFIRMED` se guarda como `UNVERIFIED`.

## Lo que no está verificado

- `BLOCKED_EXTERNAL` **LLM:** no hay claves OpenAI ni Anthropic. Propuestas y extracción devuelven 503 fuera de local. Con `APP_ENV=local` y `EDITORIAL_MODEL=mock` usan un mock cuya salida queda marcada como `MOCK`.
- `BLOCKED_EXTERNAL` **descubrimiento:** ninguna plataforma tiene adaptador real. La API informa la limitación y el fallback manual.
- `BLOCKED_EXTERNAL` **recuperación automática de fuentes:** las fuentes se registran a mano.
- **F02-12 es parcial:** prueba los validadores con diez historias ficticias y salidas hostiles simuladas. No mide un modelo real ni sustituye la prueba editorial con personas.
- Los límites de la heurística de riesgo y de la independencia por dominio están marcados en el código. La verificación humana los cubre, no los elimina.
- Sin probar contra Neon: todo se probó en PostgreSQL 17 local.

## Diferencias con el plan

- **Sin interfaz:** `AGENTS.md` prohíbe el dashboard antes de verificar Meta. La "UI indica limitación" de F02-03 es por ahora un campo de la API.
- **Una PR por fase** en vez de una por ticket, por las primitivas compartidas.
- **Score:** añade `source_quality`, definido en `docs/07`, al listado de la fuente §4.C.
- **Comentarios de revisión:** se guardan como nota de la aprobación, sin tabla propia.
- **Un mismo owner** puede crear y aprobar: no se exige separación de autor y revisor. Debe decidirlo el responsable editorial antes de producción.

## Ejecución

```powershell
npm run db:migrate
npm test
$env:PHASE01_TEST_ADMIN_URL='postgresql://<test-admin>@127.0.0.1:55432/postgres'
npm run test:db
npm run test:http
```

Tras migrar fuera de local, un operador debe aplicar `db/runtime-grants.sql`.

## Rollback y coste

Rollback: revertir la PR y ejecutar `db/rollback/007_research.sql` en transacción, tras exportar dossiers. Conserva auditoría y aprobaciones; revierte columnas nuevas.

Coste: sin llamadas a proveedores ni servicios contratados. El coste real de LLM sigue desconocido. Evidencia en [evidence/](evidence/) y estado por ticket en [status.json](status.json).
