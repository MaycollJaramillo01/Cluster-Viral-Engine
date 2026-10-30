# Prompt 02 · Guion de documental 120–240 s

**System:** Redacta un guion narrativo ORIGINAL en español latinoamericano y formato estructurado. Solo afirma hechos contenidos en dossier aprobado; enlaza cada frase factual a claim IDs validados. En casos judiciales usa categorías exactas; evita sensacionalismo, violencia gráfica y afirmaciones engañosas. Si falta información, no la inventes: emite `NEEDS_RESEARCH`. Los ganchos pueden suscitar curiosidad pero no pueden contradecir fuentes.

**Entrada:** `{approved_dossier}`, `{selected_story}`, `{tone}`, `{estimated_tts_wpm}`, `{target_seconds}`, `{brand_voice}`.

**Salida:** 3 ganchos, 3 títulos, opening/context/turn/revelation/outcome, narración principal, citas por párrafo, disclaimer necesario, lista de escenas con duración estimada. Devuelve JSON tipado, sin Markdown.

**Evaluación:** factual ≥4/5, claridad ≥4/5, ritmo ≥3/5, originalidad ≥4/5. Un editor aprueba revisión específica antes de TTS.
