# Fase 07: analítica operativa (solo API, sin métricas de Meta)

Fecha: 31-10-2026. **NO_GO para aceptación de fase.** Preparación técnica autorizada por el usuario sobre F00 a F06 sin firmar. No habilita publicación.

Casi toda esta fase mide videos publicados, y aquí no se publica nada: `AGENTS.md` lo prohíbe hasta verificar Meta. Por eso solo se construyó lo que sale de datos propios. No hay métricas de Meta, ni simuladas ni de ejemplo. El estado por ticket está en [status.json](status.json).

## Qué funciona

API bajo `/api/organizations/{id}`, contrato en [media.openapi.yaml](../../api/media.openapi.yaml). Ambas rutas exigen `organization:read`, que incluye analyst.

- **`GET .../operations?days=30`:** indicadores de los últimos `days` días (1 a 366).
  - Plazos: de crear el proyecto a la primera aprobación del render, y de terminar el render a la primera decisión, con número de casos, p50 y p95.
  - Renders: totales, correctos, fallidos, cancelados, reintentados y segundos de CPU.
  - Causas de fallo, y decisiones por tipo y resultado.
  - Coste por proveedor y operación, coste de trabajos muertos, y presupuesto con sus límites.
- **`GET .../usage`:** añade `by_project`, con el coste estimado y final de cada video, y cuántas filas faltan por liquidar.

## Lo no medido es null, nunca cero

Sigue la regla de `docs/16`. Con `null`, `0` queda reservado para "medido y es cero".

| Campo | Por qué es `null` |
| --- | --- |
| `human_minutes` | Nadie registra el tiempo de trabajo de las personas |
| `failed_render_cpu_seconds` | Un render fallido no deja fila de uso |
| `audience` | No hay publicaciones ni métricas de Meta |
| `lead_time.p50_seconds` y similares | Solo cuando aún no hay ningún caso |
| `by_project[].actual_usd` | Mientras nada de ese video se haya liquidado |

## Lo que no está verificado

- `BLOCKED_EXTERNAL` **Métricas de Meta (F07-01, F07-02, F07-03 y F07-10):** sin credenciales ni publicaciones. La tabla `metrics_snapshots` existe desde el esquema inicial, con RLS y sin uso. Las definiciones de `docs/16` siguen sin contrastar con la Graph API.
- **Datos reales:** los indicadores solo se han probado con renders del doble de pruebas y filas de coste de prueba. Sin pilotos, ningún número describe aún el negocio.
- **Tope para LLM (F07-06):** no hay adaptador LLM. Cuando exista, debe pasar por `reserveSpend`, igual que TTS e imágenes. Hoy el tope bloquea TTS, imágenes generadas y renders.
- **Ledger incompleto (F07-05):** registra caracteres de TTS, imágenes y segundos de CPU de los renders correctos. No registra tokens, porque no hay LLM, ni almacenamiento. El CPU no tiene precio hasta que exista un worker facturado.
- **Presupuesto mensual (F07-12):** comparar con US$100 y 30/60 videos exige los 10 pilotos.
- Sin probar contra Neon: todo se probó en PostgreSQL 17 local.

## Diferencias con el plan y los requisitos

- **Sin panel (F07-04 y F07-11):** la regla 2 de `AGENTS.md`. La API es la fuente de datos que usará el panel.
- **Sin CSV (F07-08):** el ticket pide rangos, proyecciones y cohortes de métricas, y esas métricas no existen. No se añadió un CSV de lo poco que hay.
- **Sin tabla ni migración nuevas:** todo sale de consultas sobre lo existente.
- **Reproceso limitado:** `retried` mira solo la última tanda de cada render, porque pedirlo de nuevo reinicia el contador. El historial completo está en `audit_events`, que el rol de la aplicación solo puede escribir. Decidí no ampliarle ese permiso por esto.
- **El plazo mide espera, no trabajo:** `review_wait` es cuánto tarda alguien en decidir, no cuánto trabaja en ello.
- **Sin alertas nuevas:** la alerta del 80 % ya llega al outbox desde F04, sin canal de entrega. El informe expone los límites del presupuesto.

## Ejecución

```powershell
npm run db:migrate
npm test
$env:PHASE01_TEST_ADMIN_URL='postgresql://<test-admin>@127.0.0.1:55432/postgres'
npm run test:db
npm run test:http
```

## Rollback y coste

Rollback: revertir la PR. No hay migración ni datos nuevos.

Coste: sin llamadas a proveedores ni servicios contratados. Evidencia: se verificó junto con F08, en [phase08/evidence](../phase08/evidence/).
