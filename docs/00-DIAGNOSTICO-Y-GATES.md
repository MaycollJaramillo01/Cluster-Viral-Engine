# 00 · Evaluación de factibilidad y puertas go/no-go

## Diagnóstico trazado al requerimiento

La fuente fija **siete módulos**: (1) radar editorial, (2) investigación, (3) guion, (4) TTS y assets, (5) render, (6) revisión humana, (7) publicación/analítica. Objetivo: 1–2 videos/día, 120–240 s, 1080×1920, español latino, Facebook y máximo objetivo US$100/mes. Se exige evaluación con **diez videos de prueba** y que **ninguno se publique sin aprobación**. (Fuente: secciones 1–4, 9–12, 14–18.)

## Dictamen: GO CONDICIONAL

| Gate | Condición comprobable | Responsable | Momento | Si falla |
|---|---|---|---|---|
| G0.1 · Video | 1 export 1080×1920 H.264/AAC 120–240 s, subtítulos y calidad visual aprobada | multimedia/editor | Antes del panel | Rediseñar pipeline y/o worker |
| G0.2 · Meta | Cuenta/Page autorizada publica video 120–240 s con endpoint permitido y permisos reales | integraciones | Semana 1 | Mantener solo exportación manual; no anunciar autopublicación |
| G0.3 · Coste | 10 videos instrumentados; coste mensual extrapolado, incluido worker y almacenamiento | tech lead | Antes de go-live | Reducir gen IA, cambiar TTS/worker, subir presupuesto |
| G0.4 · Derechos | 100% assets con permiso/licencia y origen; recreaciones marcadas | editor legal | Antes de export | Bloquear publicación |
| G0.5 · Veracidad | Cada afirmación crítica tiene fuente y estado confirmado/no confirmado | investigador/editor | Antes del guion | Corregir/rechazar |
| G0.6 · Seguridad | Pruebas de aislamiento org, OAuth y tokens cifrados, auditoría y RBAC | backend/security | Antes de producción | No desplegar en producción |
| G0.7 · Idempotencia | Retries no duplican cobro TTS ni publicación | backend | Antes de publicar | Bloquear automatizaciones |

## Restricciones técnicas

- **Vercel Functions** pueden ejecutar operaciones backend, pero **no deben presuponerse adecuadas para todos los renders**. Duración máxima anunciada en 2026 no equivale a CPU ilimitada, disco persistente ni performance garantizada. Benchmark real antes de decidir.
- **Neon** conserva metadatos, estados, auditoría y gasto. Archivos grandes nunca en Postgres: usar Blob o S3/R2.
- **Meta Reels vs Page video**: no son el mismo flujo. Validar duración, tipo de publicación, permisos, versión Graph API, acceso a métricas, cuenta y modo Live. Nunca automatizar mediante scraping o credenciales compartidas.
- **Analytics monetización**: métricas de ingresos solo donde la cuenta/API realmente las exponen; no inventar RPM.
- **Monetización**: dependerá de elegibilidad/políticas y rendimiento. No prometer ingresos, viralidad o elegibilidad.

## Comparación de decisiones

| Tema | Elegido | Por qué | Prueba/mitigación |
|---|---|---|---|
| App/control | Next.js TypeScript en Vercel | menor fragmentación; APIs/SSR | workloads intensivos fuera de request |
| DB | Neon PostgreSQL + SQL tipado | Postgres transaccional + branching | RLS y tests cross-tenant |
| Render | FFmpeg bajo interface RenderProvider | determinismo/coste/control | benchmark Vercel vs worker Docker |
| Tareas | jobs persistentes Neon + scheduler/cola | recuperable e idempotente | leases, SKIP LOCKED, backoff, DLQ |
| Audio | ElevenLabs intercambiable | calidad esperada | pruebas español LATAM + créditos reales |
| LLM | OpenAI inicial y Anthropic opcional | coste/control del esquema | evaluación comparativa manual |
| Material | almacenamiento de objetos | costo y enlaces firmados | retención, privacidad/licencias |

## Decisiones fuera del MVP

Marketplace, suscripciones, auto-publicación sin aprobación, autoselección autónoma de temas, entrenamiento propio, edición NLE profesional, scraping de redes, generación IA de video completo, multired y monetización financiera inferida.
