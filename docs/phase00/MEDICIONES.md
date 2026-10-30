# Mediciones locales de render

Fecha de corte: 30-10-2026. Mismo dataset técnico, sin voz TTS. Cada muestra incluye render de escenas y mux/subtítulos.

| Proveedor | Duración | n | p50 pared | p95 pared | CPU media muestreada | RSS pico muestreado |
|---|---|---|---|---|---|---|
| local | 120 s | 10 | 18.001 s | 19.838 s | 48.159 s | 207.58 MiB |
| local | 240 s | 10 | 32.942 s | 40.329 s | 95.191 s | 209.57 MiB |
| vercel | 120 s | 0 | null | null | null | null |
| vercel | 240 s | 0 | null | null | null | null |

Vercel: BLOCKED_EXTERNAL. No hay comparación de velocidad/precio ni elección productiva final. Media monetaria null en todos los grupos. No se cuenta una reutilización de reserva como ejecución nueva.

Las muestras viven en evidence/samples.json y el detalle de cada ejecución en workers/render/out/benchmarks-v2/. Hardware en evidence/hardware.json. CPU suma tiempo de threads de procesos secuenciales: puede superar el tiempo de pared. RSS es el mayor pico de un proceso del pipeline, no memoria del host ni una factura.

Pruebas grabadas: 9 unitarias y 6 subcasos de integración PostgreSQL, typecheck, build y validación del paquete. La batería de render terminó con 20 muestras, todas comprobadas por ffprobe. Se decodificaron completamente los primeros archivos 120/240 s sin errores.

Decisión actual: worker local para PoC. Gate NO_GO: faltan revisión editorial/derechos, TTS LATAM, integración oficial Meta compatible con duración, Neon/Vercel reales, conciliación de costes y firmas.
