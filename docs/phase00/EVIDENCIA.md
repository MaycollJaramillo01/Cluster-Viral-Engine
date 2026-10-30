# Evidencia ejecutada de Fase 00

Fecha de corte: 30-10-2026. Se conserva evidencia de ejecución local, con versiones/hashes; no representa una firma editorial o una integración cloud verificada.

Pruebas: `apps/web/tests/phase00.test.ts` (9 casos), `apps/web/tests/phase00.integration.ts` (6 subcasos en PostgreSQL real, 7 resultados TAP contando el contenedor). Ver salidas originales en `evidence/unit-tests.txt`, `evidence/postgres-tests.txt`, `evidence/typecheck.txt`, `evidence/build.txt` y `evidence/package-validation.txt`. La base efímera se levanta en localhost:55432, independiente del servicio existente en 5432. Se detiene al terminar.

Los artefactos versionables se encuentran en `docs/phase00/evidence/`: muestras/resultados de benchmark, costes, dry-runs, acta, manifiestos y ffprobe de los primeros renders 120/240 s. Los medios binarios quedan en `workers/render/out/benchmarks-v2/local-120-1/poc.mp4` y `workers/render/out/benchmarks-v2/local-240-1/poc.mp4`; no se envían a almacenamiento externo ni Git. Cada uno tiene `evidence.json`, métricas por escena y `audit.jsonl`. Para compartirlos en una PR se debe adjuntar el binario revisado y vincular su SHA256, respetando el scope de la organización.

Las veinte muestras son ejecuciones locales distintas de la misma fixture: diez de 120 s y diez de 240 s. El runner comprueba ancho/alto, fps, H.264, yuv420p, AAC y duración con tolerancia de 0.2 s antes de registrar una muestra. **No son veinte documentales editoriales diferentes**, ni cumplen el UAT de diez vídeos. Los percentiles por duración constan en `evidence/benchmarks.json`; Vercel conserva n=0, percentiles null y BLOCKED_EXTERNAL. Las métricas de CPU/RAM son muestreadas por proceso, no equivalen a cuota facturada.

QA visual técnica: se inspeccionó un fotograma y se corrigió un solapamiento del rótulo con subtítulos; se reinició la batería con layout corregido. `evidence/contact-sheet.png` permite inspeccionar las ocho escenas. Los overlays dinámicos, fundidos y subtítulos están presentes. La inspección del agente no sustituye aceptación de legibilidad/sincronía por un reviewer. No existe voz real: el AAC es silencio y los tiempos del fixture son estimados. No se declara verificado TTS LATAM ni desfase audiovisual.

`fixtures/phase00/gate.json` enlaza archivos y hashes sin atribuir aceptaciones a personas; `accepted_by`/`accepted_at` permanecen null. `npm run poc -- reports` comprueba hashes de esos enlaces y genera un **NO_GO**, publicación deshabilitada. Ningún PDF de firma o aceptación de cliente se ha inventado.

Limitaciones abiertas: acceso a Neon y Vercel; benchmark cloud y tarifas; audio LATAM de 3 min y facturación; sustitución/aceptación de dataset ilustrado y licencias/tipografía; claims corroborados y revisión editorial; cuenta Meta y API versionada, permiso/duración por tipo, demo aprobado e ID remoto; presupuesto reconciliado y firmas. `BLOCKED_EXTERNAL` es una condición abierta, no un test de proveedor aprobado.

La comprobación de integridad del paquete original en `SHA256SUMS.txt` corresponde al ZIP inicial. Los ficheros implementados y evidencias de esta fase se trazan mediante `evidence/SHA256SUMS.txt` y los hashes de input/código/artefactos de cada render.
