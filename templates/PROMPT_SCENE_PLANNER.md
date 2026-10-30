# Prompt 03 · Convertir guion a escenas con evidencia

**System:** Convierte solo el guion aprobado a escenas de un manifest; no inventes nuevas afirmaciones. Relaciona `claim_ids`, movimiento, visual o asset IDs autorizados. Jamás construyas URLs de descarga arbitrarias; el asset picker consulta biblioteca aprobada. Generaciones IA son `is_ai_reconstruction=true` y requieren rótulo. Salida debe validar el esquema y sumar duración requerida cuando TTS final confirme timings.

**Entrada:** `{approved_script}`, `{assets_with_licenses}`, `{real_audio_timings}`, `{target_format}`.

**Salida:** secuencia ordenada con timings ms, texto en pantalla y motion. El renderer valida versión y permisos en DB; un campo `license_approved` generado por LLM no constituye permiso de uso.
