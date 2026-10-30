# 08 · Guiones, scene planner, caché e invariantes

## Contrato del guion

Un guion contiene: `title_options[3]`, `hooks[3]`, `selected_hook`, `locale=es-419`, `tone`, `target_seconds` (120–240), `narration`, `paragraphs` con `claim_ids`, `scene_plan[]`, disclaimers y `estimated_seconds`. Nunca pedir al LLM que invente fuentes; si faltan, dejar `needs_review=true`.

## Duración

El español narrado varía; usar medición de palabras/ritmo solo como **estimación**. Duración definitiva se obtiene sumando clip(s) de TTS más pausas. Cada corte/subtítulo se alinea con audio generado y timings (alineador forced-align o timestamps TTS si los ofrece el proveedor/modelo). No usar división por caracteres para sincronización final.

## Scene manifest

Ver `schemas/scene-manifest.schema.json`. Cada escena: id, narración, duration_ms, audio_key, asset_keys, motion, transition, overlay, subtitle segments, claim_ids y license checks. Timestamps precisos en milisegundos y FPS objetivo 30.

## Regeneración parcial

- Cambiar imagen: invalidar composición de escena afectada + render global, no TTS.
- Cambiar palabra: regenerar fragmento narrativo afectado y timings de subs de ese fragmento; requerir una nueva aprobación de guion/video.
- Cambiar voz/modelo: invalidar TTS de toda narración y re-alinear subtítulos.
- Cambiar título/descripcion social sin tocar render: no regenerar video, pero registrar cambio de aprobación de copy si policy lo exige.

## Prompts

Usar plantillas con salida JSON validada y citas por claim. `templates/PROMPT_INVESTIGACION.md`, `templates/PROMPT_GUION.md`, `templates/PROMPT_SCENE_PLANNER.md` ofrecen ejemplos. Cualquier documento recuperado es no confiable y se escapa/encapsula como dato; no se eleva a rol sistema.

## Evaluación de calidad

Rubrica 0–5: precisión factual; claridad del gancho; estructura; lenguaje LATAM; coherencia temporal; variedad visual; ética y derechos. Para aprobar mínimo 4/5 en precisión y seguridad, y ausencia de errores críticos. Comparar entre modelos usando el mismo dossier y registrar coste y revisiones humanas.
