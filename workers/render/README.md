# Worker de render

`run-plan.mjs` es la única puerta de ejecución de FFmpeg, en local y en el contenedor: solo admite `ffmpeg` y `ffprobe`, sin shell, con un plan JSON generado desde un manifest ya validado. El contenedor no tiene red, secretos ni base de datos: recibe un directorio de trabajo y deja allí los artefactos. Diseño, mediciones y bloqueos en [`docs/phase05/README.md`](../../docs/phase05/README.md).

```bash
docker build -t cve-render:local workers/render
```

El proceso que reclama trabajos corre fuera del contenedor, porque es quien habla con la base y con el almacén. Backends de `RENDER_BACKEND`: `docker` (requiere `RENDER_DOCKER_IMAGE`), y solo con `APP_ENV=local`, `local-ffmpeg` y `fake`. El doble `fake` no produce video.

```bash
RENDER_BACKEND=docker RENDER_DOCKER_IMAGE=cve-render:local npm run render:worker
```

## FFmpeg PoC offline

La implementación nueva de Fase 00 genera renders técnicos de **120 y 240 segundos**, ocho ilustraciones originales, SRT/ASS y benchmarks. Usar las instrucciones de [`docs/phase00/README.md`](../../docs/phase00/README.md) y sus evidencias. La voz TTS real y la aceptación editorial siguen pendientes. El script antiguo de 12 s descrito abajo se conserva como smoke test independiente.

**Qué hace:** el script `poc.sh` sintetiza tres tarjetas gráficas (NO fotos reales), audio de prueba, un SRT y MP4 con movimiento de zoom y fundidos cruzados; no llama APIs ni necesita secretos. Es un **smoke test técnico de 12 segundos**, no la PoC documental 120–240 s que exige fase 00.

```bash
bash workers/render/poc.sh
bash workers/render/check_output.sh workers/render/out/poc.mp4 12
# Alta resolución opcional para estudiar consumo: 
CVE_WIDTH=1080 CVE_HEIGHT=1920 bash workers/render/poc.sh
```

Requiere `ffmpeg` con `drawtext`, `subtitles` (libass), `xfade`, `zoompan`, `ffprobe`, y `python3` local. Si faltan filtros, el script avisa mediante error de ffmpeg. Cambia input sintético por biblioteca legal, usa duración real de TTS y escena manifest en fase 05. El `poc.sh` sobrescribe solo `workers/render/out/poc.mp4`.
