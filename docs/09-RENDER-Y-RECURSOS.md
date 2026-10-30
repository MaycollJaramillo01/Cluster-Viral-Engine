# 09 · Motor audiovisual y PoC FFmpeg

## Principios

Composición declarativa y reproducible: el renderer recibe manifiesto validado, resuelve assets aprobados y produce `mp4`, preview, poster y un `ffprobe.json`. No investiga, no toma decisiones editoriales y no publica. El código `workers/render/poc.sh` prueba infraestructura local con material sintético.

## Pipeline de producción

1. Descargar assets desde URL firmada y **verificar SHA-256** (sin acceso arbitrario a IPs privadas; bloquear SSRF).
2. Verificar licencia, relación de aspecto y formato con `ffprobe`/identificación.
3. Generar timeline con 30 fps; 1080×1920, SAR 1, pix_fmt yuv420p.
4. Animar fotografías con zoom/pan, pero evitar exageraciones y no inventar movimiento de personajes reales.
5. Insertar títulos, mapas y rótulos, zona segura para interfaz Facebook; reservar márgenes superiores/inferiores.
6. Superponer subtítulos desde tiempos reales; asegurar contraste, legibilidad y no más de 1–2 líneas por card.
7. Mezclar narración y música con ducking; normalizar loudness medido; evitar clip.
8. Codificar H.264/AAC, MP4 faststart. Exportar miniatura y hash.
9. Ejecutar QA automática y revisión humana antes de aprobar render.

## Benchmark obligatorio

- 2 min / 4 min, 10 / 30 / 60 assets, subtítulos, 2D pan, transiciones, música.
- Medir CPU, RAM pico, wall time, tasa fallos, costo por render, transferencias, reintentos.
- Hacer 10 ejecuciones por escenario y guardar p50/p95 y outputs `ffprobe`.
- Si excede timeout/costo de Functions o hay fallas intermitentes: mover a worker Docker dedicado con límites, sandbox, cola y disco efímero.

## ¿Por qué no Remotion como default?

Remotion facilita composición avanzada en React, pero tiene modelo de licencias específico; comprobar condiciones empresariales antes de vender SaaS. FFmpeg minimiza dependencias y puede renderizar escenas. MoviePy aporta ergonomía en Python, a costa de overhead y otra runtime. Una comparación en la PoC decidirá si la calidad dinámica exige Remotion.

## Criterios de artefacto

`ffprobe` debe reportar `width=1080`, `height=1920`, codec `h264`, audio `aac`, `duration` entre 120 y 240s (+ tolerancia editorial validada), subtítulos comprobados visualmente y sin clipping audible. El `poc.sh` genera 12 segundos por diseño para smoke test; **no cumple el requisito de duración final**.
