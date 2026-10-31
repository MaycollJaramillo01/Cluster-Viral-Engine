# Fase 08: hardening y handover (sin pilotos)

Fecha: 31-10-2026. **NO_GO para el gate final.** Preparación técnica autorizada por el usuario sobre F00 a F07 sin firmar. No habilita publicación.

Esta fase pide diez documentales piloto, facturas reales, restore en Neon y la firma de los responsables. Nada de eso existe aquí: sin credenciales de Meta, Neon, Vercel, TTS ni LLM, y sin reviewer. Por eso solo se hizo lo que no depende de ellos. El estado por ticket está en [status.json](status.json).

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
- `BLOCKED_EXTERNAL` **Restore y rollback (F08-06):** sin Neon ni Vercel. Los scripts de rollback sí se ejecutan en transacción en las pruebas de PostgreSQL. RPO y RTO sin medir.
- **Medición de F05:** la pasada oficial se interrumpió al caer Docker Desktop. Ver [docs/phase05](../phase05/README.md#mediciones). Hay que repetirla.
- **Carga y fallos (F08-05):** 429, 5xx, caída de worker y lease vencido están probados desde F04 y F05. No hay prueba de carga ni de disco lleno.
- **Personas (F08-09 a F08-11):** nadie de soporte ha ejecutado un incidente simulado, ningún desarrollador nuevo ha recreado DEV y nadie ha hecho un pentest.
- **Gate final (F08-12):** ninguna fase está firmada. No hay acta.
- Neon sigue bloqueado: todo se probó en PostgreSQL 17 local.

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

En [evidence/](evidence/), del 31-10-2026: typecheck, lint, 51 unitarias (1 omitida: la del contenedor, con Docker parado), 72/72 en PostgreSQL con la suite de F00, build, bundle de cliente, secret scan, `npm audit` y 174 comprobaciones HTTP contra el build de producción.

## Rollback y coste

Rollback: revertir la PR. No hay migración ni datos nuevos.

Coste: sin llamadas a proveedores ni servicios contratados.
