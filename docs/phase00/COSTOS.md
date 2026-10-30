# F00-07/11: costes y elección de procesamiento

Estado: **BLOCKED_EXTERNAL** para TTS, cloud y coste/video completo. El ledger de `fixtures/phase00/costs.json` distingue `actual_usd` de `estimated_usd` y conserva unidades, intentos y evidencia. Un dato desconocido es null, no cero. El coste directo de API para los ocho diagramas programáticos es cero; minutos humanos, electricidad y cómputo no están cotizados ni medidos en USD.

`costReport` solo calcula observado/video al contar con las seis categorías: TTS, LLM, render, imágenes, almacenamiento y humano. Con costes completos: mes(30)=coste/video×30+fijos y mes(60)=coste/video×60+fijos. Sin conciliación completa o fijos conocidos retorna null. La meta <100 USD no está verificada; también faltan reintentos reales, cuotas, impuestos y condiciones comerciales de planes.

Decisión explícita actual: **worker local únicamente para PoC**. Vercel conserva Web/BFF y orquestación; Neon conserva la verdad transaccional. No se ha decidido proveedor de render productivo sin comparar cuenta/plan reales y facturación. El runner soporta 10 muestras por 120/240 s y separa local de Vercel; grupo Vercel sin acceso se informa BLOCKED_EXTERNAL, con n=0 y percentiles null.

No usar un límite antiguo como prueba de inviabilidad: el [anuncio oficial de Vercel del 15-06-2026](https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes) describe hasta 30 minutos para Pro/Enterprise en Node/Python, con condiciones Fluid/beta para más de 800 s. Deben comprobarse plan, memoria, empaquetado, almacenamiento temporal y límites efectivos del deployment. Ese anuncio no es un benchmark de FFmpeg ni una cotización.

La [API oficial de ElevenLabs con timestamps](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps) devuelve audio y alineación por caracteres. No se invocó aquí. F00-05 exige comparar voces LATAM con una muestra real de 3 min y registrar caracteres facturados, request IDs, intentos y factura; la cache debe conservar audio cuando solo cambia una imagen. El helper de clave de cache probado no sustituye integración/persistencia de audio real.
