# F00-01: inventario, diferencias y criterios de bloqueo

Baseline: `source/requerimientos_originales.txt`, secciones 1–20. Estado de firma cliente: **PENDING**. Organización fixture: `11111111-1111-4111-8111-111111111111`; proyecto fixture: `22222222-2222-4222-8222-222222222222`. No son cuentas de producción.

| Sección | Requerimiento fuente | Aplicación en Fase 00 / evidencia de aceptación posterior |
|---|---|---|
| 1 | Plataforma propia, investigación/producción/Facebook | Factibilidad condicionada; nada publicado |
| 2 | 120–240 s, 9:16, 1080p, LATAM, 1–2/día, <100 USD | Formato en contrato/ffprobe; voz, volumen y presupuesto sin verificar |
| 3 | Siete módulos independientes | Solo herramientas de PoC; interfaces separadas |
| 4 | Referencias, discovery, viral score experimental | Fuera de fase; no crear radar/dashboard |
| 5 | Fuentes, hechos/hipótesis, acusaciones/estatus judicial | 2 fuentes identificadas; claims PENDING, historia sin crimen |
| 6 | Guion original, hooks/títulos, escenas y versiones | Fixture narrativo 293 palabras/8 escenas; generación LLM y tres hooks fuera de PoC |
| 7 | ElevenLabs, LATAM, cache y sincronización | Mock bloqueado; clave cache testeada; calidad/coste reales pendientes |
| 8 | Archivo, AI selectiva, biblioteca/licencias | 8 ilustraciones originales; licencia/autoría pendiente de aceptación editorial; no archivo ajeno |
| 9 | FFmpeg/MoviePy/Remotion; movimientos, transiciones y subs | FFmpeg real, JSON, SRT/ASS y hashes; música/SFX opcionales ausentes |
| 10 | Dashboard y editores | No se implementan antes de los gates multimedia/Meta |
| 11 | Meta oficial y aprobación humana | Mocks separados, sin upload; permiso/versión y gate transaccional de publicación no implementados |
| 12 | Métricas y optimización | Fuera de fase; no datos remotos imputados |
| 13 | FastAPI, Next/React, Postgres/Supabase, VPS, cola | Diferencia: TypeScript/Next en Vercel y Neon según restricciones del paquete; worker local de prueba |
| 14 | Menos de 100 USD/mes y controles por vídeo | Costes faltantes null; proyección solo con ledger completo; ninguna garantía |
| 15 | Cuatro etapas, ocho semanas orientativas | Diferencia: nueve fases 00–08 y 380–550 h del paquete; sin compromiso contractual |
| 16 | Preparación multiempresa, SaaS futuro | Tenant scopes/RLS/FK e idempotencia probados; sin facturación/planes nuevos |
| 17 | Aprobación, fuentes, derechos, políticas y auditoría | Auditoría append-only; checklist; sin verificación Meta ni aprobación humana real |
| 18 | MVP funcional y al menos 10 vídeos de prueba | Benchmark repetido de una fixture NO equivale a diez documentales editoriales de UAT |
| 19 | Propuesta técnica y PoC antes de panel | Código, esquema, medidas, costes faltantes y guías entregados; voz/Meta bloquean aceptación |
| 20 | Calidad, viralidad y sostenibilidad comercial | Ninguna métrica de viralidad, monetización o sostenibilidad declarada verificada |

Roles: owner administra; admin gestiona equipo; editor modifica y solicita render; reviewer aprueba humano; analyst consulta; worker procesa sin poder aprobar. El store de PoC niega analyst y actores sin membership; no hay sesión pública ni API de CRUD nuevos. Ningún booleano `approved=true` concede permiso.

No-go: fuentes/claims o derechos pendientes; ausencia de demo/voz aceptados; formato Meta no comprobado; rol runtime con BYPASSRLS/propiedad; pruebas cross-org fallidas; coste observado incompleto o presupuesto no aceptado; firmas ausentes. Cada condición impide avanzar al panel/publicación. La fase tiene estimación 40–60 h del plan; ejecución de herramientas no sustituye revisión, accesos y horas de las personas responsables.

Diferencia adicional de formato: la guía oficial del endpoint Reels recuperada en esta sesión indica 3–90 s; no respalda los 120–240 s requeridos. No extrapolar a otros tipos de vídeo. Mantener NO_GO hasta validar PAGE_VIDEO u otro mecanismo oficial con cuenta autorizada; ver META.md y el registro de recuperación de fuentes.

Casos: fixture válida/rechazo estructural, referencias/timing/licencias, tenant/rol/proyecto, repetición simultánea, fallo de auditoría con rollback, error de proceso, hash antiguo de render, API mock bloqueada, datos/costes desconocidos y gate sin firmas. Resultados ejecutados en EVIDENCIA.md. La firma debe vincular esta versión exacta y sus casos: **pendiente de cliente**.
