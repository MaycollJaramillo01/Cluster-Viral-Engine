# 03 · Architecture Decision Records (ADRs)

| ADR | Elección | Alternativa descartada por ahora | Condición de revisión |
|---|---|---|---|
| ADR-001 | Monolito modular Next.js 16 en Vercel | Microservicios / FastAPI dedicado | más de 3 equipos independientes o CPU backend dominante |
| ADR-002 | Neon PostgreSQL | Supabase | requerir features de Auth/Storage específicas no viables con add-ons |
| ADR-003 | Worker FFmpeg desacoplado | Encadenar FFmpeg dentro de un request de Vercel | PoC muestra p95 render estable y coste menor en Functions |
| ADR-004 | Postgres jobs+outbox como verdad | Cola volátil como única fuente | volumen alto; entonces Event Bus adicional |
| ADR-005 | SQL tipado/Drizzle opcional y migraciones SQL | ORM que oculta locking | equipo requiere ORM, sin perder SQL específico |
| ADR-006 | Almacén de medios privado | Media BLOB en Neon | nunca almacenar archivos grandes en DB |
| ADR-007 | Aprobación humana por render/version | Flag `project.approved` | criterio no negociable |
| ADR-008 | FFmpeg como engine MVP | Remotion completo | editor necesita composición interactiva muy avanzada |
| ADR-009 | Score heurístico interpretable | ML entrenado desde cero | más de 200 muestras y datos comparables válidos |
| ADR-010 | Meta Page publishing por API oficial comprobada | bots navegador no autorizados | solo cambiar al validar permisos y formato |

## Formato para registrar cambio

Contexto -> Opciones -> Decisión -> Consecuencias -> Riesgos -> Enlace a prueba -> Fecha y revisor. Una ADR aceptada nunca se borra: se marca superseded.
