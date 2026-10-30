# 10 · Meta Graph: conexión, aprobación y publicación

## Gate P0: verificación real

Validar versión vigente de Graph, permisos mínimos, review y relación Page/usuario/Business. La colección **Meta Facebook API en Postman** documenta flujo de Reels separado del Page video. No asumir que Reels acepta 120–240 s; verificar contra API Graph **con Page propia**, formato, duración y autenticación. No automatizar autenticación por navegador ni scrapeo.

## OAuth/tokens

1. Registrar App y caso de uso; redirect URI exacta HTTPS.
2. Solicitar permisos necesarios según funcionalidad y API versionada; documentar justificación y screencast para App Review.
3. OAuth con `state` anti-CSRF y expiración; intercambio de token en backend, jamás en navegador.
4. Obtener páginas autorizadas, guardar `page_id` y token de Page cifrado AES-GCM. Registrar `expires_at` cuando aplique, scopes y revocación.
5. Revalidar Page y permisos antes de publicar; si token inválido pausar el job y notificar.
6. Suscribir webhooks relevantes solo si la API los ofrece; validar HMAC y evento.

## Algoritmo de publicación sin duplicación

`POST /publish` exige `render_id`, `manifest_sha256`, `approved_by`, `approved_at`, `page_id`, licencia OK, claim check OK, budget OK, horario permitido y copia aprobada. Transacción crea `publication` con key única y estado PREPARING + outbox. Worker obtiene lease; consulta remoto si hubo intento previo incierto. Sube media de forma resumible donde exista soporte, verifica estado de procesamiento y publica por mecanismo autorizado. Guarda remote_video_id, response truncada y marca PUBLISHED. Si timeout después de subida, **no repetir a ciegas**: consultar estado remoto.

## Programación

Si el mecanismo oficial permite scheduling para el tipo de media elegido, usarlo. Si no, scheduler propio dispara envío a hora elegida con tolerancia/alertas; nunca prometer publicación exacta si API o cola fallan.

## Métricas

Guardar periodic snapshots T+1h, T+24h, T+7d si permisos. `views`, `reach`, `average_watch_time`, `retention`, `shares`, `comments`, `revenue` solo si API/insights los devuelve para Page/video concreto. Usar `null` para no disponible y almacenar respuesta agregada permitida, versión Graph y timestamp.

## Errores

- 401/403: token/permisos/Review; intervención manual.
- 429: backoff y límites por Page.
- 400 formato/duración: bloqueo, corrección del render.
- 5xx: retry limitado con reconciliación remota.
- Política de cuenta o monetización: no existe bypass válido; bloquear y elevar al propietario.

## Ensayo sin publicación

Implementar `dry_run` que valide todo y construya payload sin enviar a Meta; un switch de producción no basta para autorización: gate humano sigue obligatorio y no anulable por job.
