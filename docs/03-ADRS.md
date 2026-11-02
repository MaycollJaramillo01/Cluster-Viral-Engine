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
| ADR-011 | Panel interno `/panel` sin publicación, antes de verificar Meta | Mantener solo API hasta tener Meta (regla 2 de `AGENTS.md`) | al verificar Meta, revisar si el panel pasa a dashboard completo |

## Formato para registrar cambio

Contexto -> Opciones -> Decisión -> Consecuencias -> Riesgos -> Enlace a prueba -> Fecha y revisor. Una ADR aceptada nunca se borra: se marca superseded.

## ADR-011 · Panel interno antes de verificar Meta

- **Contexto:** la regla 2 de `AGENTS.md` prohíbe dashboard y publicación antes de verificar Meta y la PoC multimedia. Meta sigue sin credenciales, así que las fases 02 a 08 quedaron solo como API y no había forma de usarlas sin `curl`.
- **Decisión (del propietario del producto, 2026-11-02):** se aparta de la regla 2 solo en la parte de dashboard. Se construye `/panel`, un panel interno que llama a la API existente: historias, plan, fuentes, claims, dossier, guion, material, licencias, voz, render y revisión. La única ruta nueva es `GET /projects/{projectId}` (solo lectura, `organization:read`).
- **Lo que no cambia:** no hay publicación ni conexión con Meta. Todas las comprobaciones siguen en la API (sesión, origen, rol, organización, RLS, hash exacto en cada aprobación). El panel no guarda secretos ni decide nada por sí mismo.
- **Consecuencias:** lo que depende de proveedores externos (LLM, ElevenLabs, almacenamiento en Vercel) responde `BLOCKED_EXTERNAL`. El render solo funciona en local con `npm run render:worker`. En local, `TTS_PROVIDER=mock` genera voz sintética marcada, y `local:bootstrap` crea una cuenta `reviewer` para poder aprobar.
- **Riesgos:** que el panel se tome por un sistema terminado. Mitigación: insignia fija «Publicación deshabilitada» y estados por módulo en la portada.
- **Prueba:** typecheck, lint y `npm test` en verde; recorrido en navegador local de login → historia → proyecto → plan → pestañas.
