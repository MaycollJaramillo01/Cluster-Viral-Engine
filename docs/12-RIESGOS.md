# 12 · Registro de riesgos priorizados

Escala: P/I 1–5; exposición = P×I. Owners asignados por rol propuesto.

| ID | Riesgo | P | I | Score | Tratamiento / trigger | Owner |
|---|---|---:|---:|---:|---|---|
| R01 | Meta no admite videos 2–4 min en endpoint elegido | 4 | 5 | 20 | PoC real primera semana; alternativa Page video/manual export | Integración |
| R02 | Render lento/caro en Vercel | 4 | 4 | 16 | benchmark y worker externo bajo interface | Multimedia |
| R03 | Afirmación criminal falsa/difamatoria | 3 | 5 | 15 | claim evidence + revisión obligatoria | Editorial |
| R04 | Assets sin licencia/restricciones | 4 | 5 | 20 | bloqueo por metadata y licencia | Editorial/legal |
| R05 | Publicación duplicada por retry | 3 | 5 | 15 | idempotencia + reconciliación Meta | Backend |
| R06 | Acceso entre organizaciones | 3 | 5 | 15 | RLS + RBAC + pentest cross tenant | Seguridad |
| R07 | Gastos TTS/IA superan US$100 | 4 | 4 | 16 | presupuestos duros; 10 video benchmark | Producto |
| R08 | Métricas monetización no disponibles | 4 | 3 | 12 | `null`; manual capture opcional permitido | Analytics |
| R09 | Token Meta revocado o expira | 4 | 3 | 12 | reauth notificada, estado pausado | Integración |
| R10 | Prompt injection en fuentes | 4 | 4 | 16 | untrusted content + schemas + tool sandbox | IA |
| R11 | Violencia gráfica o deepfake confundible | 3 | 5 | 15 | política editorial, marcas recreación | Revisor |
| R12 | Caída/corrupción de objetos | 3 | 4 | 12 | hashes + lifecycle + backup/restore | SRE |
| R13 | Colas atascadas | 3 | 4 | 12 | lease, DLQ, alertas | Backend |
| R14 | Permisos/licencia voz | 3 | 4 | 12 | TOS y prueba contractual | Legal |
| R15 | Dependencia de un proveedor | 4 | 3 | 12 | adapters, posibilidad de migración | Arquitecto |

Acción obligatoria: cada riesgo con score ≥15 debe tener dueño, mitigación medible y estado antes de aprobar fase 00 o fase 08. `templates/REGISTRO_RIESGO.csv` para seguimiento.
