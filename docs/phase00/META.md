# F00-08/09: matriz Meta y ensayo bloqueado

Estado: **BLOCKED_EXTERNAL**. Sin App/Page autorizada, token de Page, App Review ni versión Graph probada en esta sesión. La consulta a [Reels Publishing oficial](https://developers.facebook.com/docs/video-api/guides/reels-publishing/) devolvió HTTP 429 al navegador de investigación; una recuperación HTTPS posterior logró HTTP 200, registrada con hash en `evidence/source-retrieval.json`.

**Gap documental confirmado, no prueba de cuenta:** la guía recuperada el 30-10-2026 especifica 3–90 segundos para este flujo de Reels, por lo que no respalda el objetivo de 120–240 s. También describe 24–60 fps, 9:16, 1080×1920 recomendado, permisos `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, tarea de Page CREATE_CONTENT y requisitos de GOP/audio. No se extiende esa restricción a vídeo nativo, anuncios u otros endpoints. La opción PAGE_VIDEO debe verificarse de forma independiente con la cuenta/API reales o registrarse alternativa manual autorizada.

El render local demuestra el contrato técnico de F00-04. No certifica el GOP ni bitrate exigidos por Meta: contiene AAC silencioso y preset de benchmark. Antes de un demo remoto deberá generarse el archivo final con voz, normalización y parámetros oficiales, y aprobarse por hash.

| Evidencia requerida | PAGE_VIDEO | REEL |
|---|---|---|
| App, propietario y Page de prueba | Sin acceso | Sin acceso |
| OAuth state/redirect y sesión real | Pendiente | Pendiente |
| Scopes concedidos y App Review | Pendiente; comprobar `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` según flujo oficial vigente | Pendiente; verificar por separado |
| Versión Graph y fecha de expiración token | null / sin verificar | null / sin verificar |
| MP4 1080×1920, 30 fps, 120/240 s admitidos | Sin prueba remota | Gap: guía consultada indica 3–90 s; sin prueba de cuenta |
| Subida, procesamiento y permisos Page | Sin prueba remota | Sin prueba remota |
| Copia social/render hash aprobado | Pendiente humano | Pendiente humano |
| ID remoto / URL / respuesta real | null | null |
| Scheduling, insights, monetización | No comprobados | No comprobados |

Los scopes de Reels se corroboraron documentalmente en la guía recuperada; no fueron concedidos a una App real ni verificados para PAGE_VIDEO. El mock `dryRun` comprueba estructura, organización y hash; devuelve siempre bloqueo y no construye un resultado remoto ficticio. `editorial_ready` solo informa estados del fixture, no autoriza un envío. No hay función ni endpoint de upload en esta fase.

Para desbloquear: registrar versión y caso de uso; OAuth con state/expiry y tokens solo backend; comprobar permisos reales; render con voz y aprobación humana por hash; registrar licencias/claims y rol/actor en la misma transacción que autorice el intento. Validar ambos tipos con demo autorizado y conservar request ID, respuesta saneada, hash local y ID remoto. No reintentar POST incierto sin reconciliar. Ningún `approved=true`, estado mock o acta local suple ese gate.

Alternativa provisional: exportar MP4 para revisión y carga manual por un humano autorizado en la Page de prueba, **únicamente después de aprobación editorial**. Registrar persona, hash, URL remota y fecha. Una carga manual tampoco demuestra integración API ni cierra F00-09 como flujo automatizado.
