# Cronograma de ejecución y dependencias críticas

| Fase | Bloque | Horas | Duración orientativa | Gate |
|---|---|---|---|---|
| 00 | PoC y Meta | 40–60 | 1–2 semanas | Demo real + endpoint duración |
| 01 | Vercel/Neon y Auth | 40–55 | 1–2 | CI + tenant |
| 02 | Radar e investigación | 45–65 | 1–2 | Dossier contrastado |
| 03 | Guiones y escenas | 45–60 | 1–2 | Script versionado/claims |
| 04 | TTS y assets | 50–70 | 1–2 | Audio/subs/licencias |
| 05 | FFmpeg y jobs | 55–75 | 1–2 | 1080×1920 + 2–4 min |
| 06 | Panel y Meta | 40–60 | 1–2 | Aprobación y publicación autorizada |
| 07 | Analítica y costes | 35–50 | 1 | Métricas reales disponibles |
| 08 | UAT y handover | 30–55 | 1–2 | 10 videos + costs + seguridad |
| **Total** | | **380–550** | **~10–14 semanas con un senior**, con solapamientos posibles | GO/NO-GO |

## Ruta crítica

Meta API y formato video están fuera de control del desarrollador: comprobar en fase 00 y repetir en fase 06. Composición FFmpeg y entrega de assets condicionan preview; privilegios DB y OAuth condicionan go-live. SaaS/billing se pospone.

## Hitos verificables

H0 PoC 120s y prueba Meta; H1 entorno Preview aislado; H2 dossier y guion con fuentes; H3 media+video final con hashes; H4 aprobación por versión + publicación; H5 dashboard y coste por video; H6 10 videos piloto y aceptación. Cada hito exige links de artefactos y prueba, no solo capturas de UI.
