# 06 · HTTP APIs, proveedores y estándares

**Los contratos en `api/openapi.yaml` son diseño pendiente de implementación.**

## Seguridad común

Session cookie HttpOnly Secure SameSite=Lax o proveedor OAuth/OIDC elegido con rotación; CSRF en mutaciones si aplica; `Origin` allowlist; rate-limit por usuario/org; validación Zod; autorización de org en servidor; errores JSON sin detalles internos. Webhooks externos con verificación de firma en cuerpo crudo y ventana anti-replay.

## APIs internas

- `GET /api/health`: estado superficial, sin secretos.
- `GET /api/stories?status=`: listado paginado por org.
- `POST /api/stories`: crea propuesta manual (editor).
- `POST /api/projects/{id}/research`: job de investigación (editor).
- `POST /api/projects/{id}/scripts`: guion versionado (editor).
- `PATCH /api/scenes/{id}`: update optimista por `If-Match` o revision.
- `POST /api/projects/{id}/render`: retorna 202 y job.
- `POST /api/renders/{id}/approve`: actor reviewer; valida licencias, afirmaciones, checksum y revisión.
- `POST /api/renders/{id}/publish`: requiere aprobación exacta, page autorizada y budget; nunca publica si falta auth.
- `GET /api/jobs/{id}`: estado y progreso.
- `POST /api/webhooks/meta`: Meta HMAC con `X-Hub-Signature-256` y raw body.

## Integraciones y dependencias

| Proveedor | Necesita | Verificar antes de activar |
|---|---|---|
| OpenAI o Anthropic | API key en servidor, modelo, presupuesto, estructurado JSON | modelos, límites, costes, retención de datos |
| ElevenLabs | clave, voice ID, modelo/voz/locale | créditos por carácter, idioma, sincronización, licencia voz |
| Meta Graph API | app, business/page access, permisos App Review, tokens y versión | endpoint legal para 2–4 min, vídeo vs Reel, scheduling e insights por cuenta |
| Almacén (Blob/S3/R2) | tokens mínimos y firma/URLs de acceso | políticas de lectura de Meta, TTL, CORS, retención |
| Fact-check fuentes | motores de búsqueda/licencias | términos de uso, robots, derechos de cita |

## Errores y status HTTP

400 JSON inválido; 401 sin sesión; 403 sin rol/tenant; 404 entidad ausente en tenant (no revelar si existe en otro); 409 versión obsoleta/duplicado; 422 contenido editorial inválido; 429 cuota; 502 provider; 503 integración inactiva o gate pendiente. Jobs devuelven `202 Accepted` con id.

## No prometer permisos ni métricas

La API Meta y el modelo de monetización se verifican con una Page **real y autorizada**. Métricas faltantes son `null`, nunca `0`. Se conserva `raw_metric_name` y fecha de extracción para cambios de versiones.
