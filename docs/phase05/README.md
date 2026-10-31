# Fase 05: motor FFmpeg y render asíncrono

Fecha: 31-10-2026. **NO_GO para aceptación de fase.** Preparación técnica autorizada por el usuario sobre F00 a F04 sin firmar. No habilita publicación. Aquí no hay endpoint de aprobación ni de publicación.

## Qué funciona

API bajo `/api/organizations/{id}/projects/{projectId}/renders`, contrato en [render.openapi.yaml](../../api/render.openapi.yaml): pedir, listar, leer, cancelar y obtener URL firmadas de 5 minutos. El render corre en un worker aparte, nunca dentro de una petición HTTP.

- **Manifest:** esquema estricto publicado en [render-manifest.schema.json](../../schemas/render-manifest.schema.json). Liga el render a la versión de guion, a cada archivo por SHA-256, a la voz, a los subtítulos y a los créditos. Con otro material es otro render. Pedir lo mismo devuelve el mismo render.
- **Plan sin shell:** solo `ffmpeg` y `ffprobe`, con argumentos separados. Ningún texto de usuario llega a la línea de comandos y las entradas no pueden abrir la red.
- **Composición:** 1080x1920, 30 fps, H.264 y AAC con faststart. Cualquier proporción llena el 9:16 sobre su propio fondo desenfocado. Hay Ken Burns en imágenes, clips de video, fundidos, título opcional, rótulos y subtítulos ASS.
- **Mezcla:** narración, música con ducking medido sobre el archivo final y `loudnorm` a -14 LUFS.
- **Cola en PostgreSQL:** leases, latido, reintentos con espera y `DEAD`. El reclamo cruza organizaciones por una función que solo devuelve identificadores; todo lo demás corre con la organización fijada y RLS. Un worker que perdió el lease no pisa al relevo.
- **Worker aislado:** contenedor sin red, sin capacidades, con raíz de solo lectura, usuario sin privilegios y límites de CPU, memoria y procesos. No recibe secretos ni acceso a la base. Medido desde dentro en [docker-isolation.txt](evidence/docker-isolation.txt).
- **RenderProvider:** `submit`, `status`, `cancel` y `fetchArtifact`, con tres backends: `docker-ffmpeg`, `local-ffmpeg` y `fake`. Los dos últimos solo con `APP_ENV=local`. Sin backend configurado, el worker sale con `BLOCKED_EXTERNAL`.
- **Control de calidad:** 13 comprobaciones con ffprobe y ebur128 sobre el archivo final: códecs, resolución, fps, formato de píxel, duración, fotogramas, sincronía, faststart, nivel y picos. Lo que no se puede juzgar por programa queda como pendiente humano: legibilidad, movimiento, variedad y mezcla.
- **Preview y póster:** preview de 540x960 y póster JPG. Se descargan por URL firmada.
- **Cancelación y limpieza:** cancelar detiene el proceso con SIGKILL y borra el directorio de trabajo. Cada intento escribe sus propias claves y las anota antes de subir: si cae a mitad, el siguiente intento las borra.

## Reglas de bloqueo

- Sin guion aprobado, con bloqueos de medios o con el tope de gasto alcanzado no se encola nada.
- Un archivo de entrada con otro hash o que falta mata el trabajo sin reintentar.
- Una salida con defectos termina en `QA_FAILED`, no se reintenta y no entra en revisión.
- Si el material cambia mientras corre, el resultado queda guardado con `stale=true` y tampoco entra en revisión.
- Pedir un render nuevo con otro material cancela el que siga activo con el anterior.

## Mediciones

**La medición oficial no está hecha.** La pasada de 10 iteraciones por escenario empezó el 31-10-2026 a las 09:28 y se cortó a los 8 minutos: Docker Desktop dejó de responder y todo lo posterior falló con `CONTAINER_FAILED`. Se conserva en [benchmark-docker-interrumpido.json](evidence/benchmark-docker-interrumpido.json) y no vale como medición.

Lo único que llegó a medirse son 3 iteraciones de 120 s con 10 assets, con 4 hilos en un i5-13500 con 16 GB y material sintético:

| Medida | p50 | Máximo |
| --- | --- | --- |
| Tiempo total | 78,8 s | 84,6 s |
| CPU | 200 s | 221 s |
| Memoria máxima | 578 MiB | 588 MiB |
| Master | 91 MB | 91 MB |
| Disco de trabajo | 1,8 GB | 1,8 GB |

Las tres pasaron la QA con 3600 fotogramas exactos. Tres muestras no dan un p95 fiable, y faltan los escenarios de 240 s y los de 30 y 60 assets. Hay que repetirla con Docker en marcha y el equipo sin otra carga.

## Defectos reales que solo aparecieron en Linux

Los tres pasaron todas las pruebas en Windows. Hay tres versiones de FFmpeg en juego: la del host, la de CI y la 5.1.9 del contenedor.

1. **FFmpeg no moría al cancelar.** CI lo encontró: en Linux FFmpeg atrapa SIGTERM y sale con 255, así que el tiempo agotado se informaba mal y un proceso colgado podía no morir. Ahora se usa SIGKILL.
2. **Se perdía un fotograma por clip.** La primera medición en contenedor dio 3596 fotogramas en vez de 3600 en las 10 iteraciones. La QA lo detectó, y en producción habría matado cada render con `QA_FAILED`. La causa era `-t` en la entrada, con FFmpeg 5.1. Esa medición se descartó y se conserva en [benchmark-docker-defecto-frames.json](evidence/benchmark-docker-defecto-frames.json).
3. **Material roto giraba hasta el tiempo límite.** Al diagnosticar lo anterior se vio que un clip sin fotogramas decodificables dejaba `-stream_loop -1` girando 20 minutos por intento, y un WAV vacío hacía lo mismo en la música con el FFmpeg del host. Ahora el clip se lee una vez y la música se repite un número contado de veces. Un clip roto falla en menos de un segundo.

El diagnóstico está en [clip-frames-diagnosis.txt](evidence/clip-frames-diagnosis.txt). Las pruebas fijan ahora el número exacto de fotogramas en host, CI y contenedor, porque la tolerancia de ±1 de la QA ocultaba el defecto en vídeos con un solo clip.

## Lo que no está verificado

- `BLOCKED_EXTERNAL` **Almacenamiento (F05-08):** sin token de Blob. Todo se guardó en disco local y no hay lifecycle de renders reemplazados.
- `BLOCKED_EXTERNAL` **Vercel Functions y coste monetario (F05-11):** no se midió FFmpeg en Functions. No hay worker facturado, así que el coste por video queda en `null` y solo hay segundos de CPU.
- `BLOCKED_EXTERNAL` **Voz real:** la voz es un tono de prueba. El ducking y los niveles se midieron con tonos. Con voz real pueden cambiar, y el `loudnorm` de una pasada puede oírse o salirse del margen.
- **Revisión humana (F05-03 y F05-04):** nadie ha juzgado legibilidad, variedad documental ni mezcla. Revisé fotogramas sintéticos del host y del contenedor, y ninguno de los dos sustituye a la revisión de una persona. En [container-frames.jpg](evidence/container-frames.jpg) el encuadre es correcto, y el título, los subtítulos y el rótulo de IA se leen con tildes. El estilo pide Arial; el contenedor usa Liberation Sans, de medidas equivalentes. El rótulo de IA, a 30 px sobre 1080, es lo más pequeño y habría que comprobarlo en un teléfono.
- **Worker fuera de esta máquina:** nunca se ha desplegado. Las mediciones son de un portátil o sobremesa local, no del servidor final.
- **Transferencias:** no se midió subir ni descargar de almacenamiento, porque no hay almacenamiento real.
- Neon sigue bloqueado: todo se probó en PostgreSQL 17 local.

## Diferencias con el plan y los requisitos

- **Una PR por fase** en vez de una por ticket, por las primitivas compartidas.
- **Sin interfaz (F05-09):** `AGENTS.md` prohíbe el dashboard antes de verificar Meta. La preview existe, pero no hay UI que la muestre.
- **Títulos y mapas:** el guion no define títulos por escena, así que hay un título opcional por `title_index`. Los mapas son material visual subido, no se generan.
- **Fundidos a negro** en vez de `xfade`, porque cada escena se codifica aparte y luego se concatena sin recodificar.
- **Clip más corto que su escena:** se congela en el último fotograma. Antes se repetía en bucle; el bucle giraba con archivos rotos y además una repetición visible suele verse peor. Lo juzga el revisor.
- **Efectos de sonido:** se catalogan en F04, pero no se mezclan.
- **`loudnorm` de una pasada:** la QA acepta -14 ±2 LU. Pasar a dos si con voz real se sale del margen.
- **Disco:** `-fs` limita cada archivo y hay un tmpfs de 256 MB, pero no hay cuota sobre el volumen montado. `work_bytes` mide el pico por render.
- **Sin `ffprobe` previo de las entradas:** un archivo corrupto falla en FFmpeg, reintenta 3 veces y muere.
- **Artefactos en memoria** al subir. Pasar a streams con Blob real.
- **Claves de objeto:** por hash de intento bajo organización y proyecto, no `org/project/version`.
- **Limpieza de huérfanos** solo por `pending_object_keys`, sin barrido por listado.
- **Reclamo de leases vencidos** dentro de la función de la cola, en vez del scheduler de 5 minutos de `docs/04`. La segunda señal de parada consume un intento.
- **Doble `fake`:** puede llevar un proyecto a `VIDEO_REVIEW` con `APP_ENV=local`. Queda registrado como `provider='fake'` para que aprobarlo se pueda rechazar.
- **Mismo rol de base** para web y worker. Darle uno propio cuando corra fuera del proceso web.
- **Coste en `cpu_seconds`:** `provider_usage` registra unidades con coste 0 hasta que exista un worker facturado. Un render fallido no deja fila de uso.
- **Benchmark:** escenarios de 60 assets añadidos a los pedidos. Usa tonos en WAV como voz, no MP3 real.

## Ejecución

```powershell
npm run db:migrate
npm test
$env:PHASE01_TEST_ADMIN_URL='postgresql://<test-admin>@127.0.0.1:55432/postgres'
npm run test:db
npm run test:http
docker build -t cve-render:local workers/render
$env:RENDER_BACKEND='docker'; $env:RENDER_DOCKER_IMAGE='cve-render:local'
npm run render:worker --workspace=apps/web -- --once
```

Medición, desde `apps/web`:

```powershell
npx tsx src/render/benchmark-cli.ts --provider docker --iterations 10 --threads 4 --out <ruta>
```

Tras migrar fuera de local, un operador debe aplicar `db/runtime-grants.sql`.

## Rollback y coste

Rollback: revertir la PR y ejecutar `db/rollback/010_render.sql` en transacción, tras exportar renders. Conserva auditoría, outbox y ledger. Los objetos ya guardados no se borran.

Coste: sin llamadas a proveedores ni servicios contratados. Evidencia en [evidence/](evidence/) y estado por ticket en [status.json](status.json).
