# 15 · Estrategia de pruebas y 10 videos piloto

## Pirámide

**Unitarias:** pesos score, role matrix, coste, transiciones, hashes, licencia y claims, rejection invalidates approval. **Integración:** Neon branch real, constraints, RLS, SKIP LOCKED, outbox y concurrent publish. **Contratos:** mocks y fixtures de OpenAI/Anthropic/ElevenLabs/Meta con 429/5xx/timeout, sin tokens en CI. **E2E:** Playwright: editor→reviewer→render→approve→publish dry-run→metrics. **Media:** ffprobe, muestras reales + golden screenshot review.

## Casos negativos obligatorios

- Usuario org A lee proyecto org B => 404.
- Viewer/analyst intenta aprobar => 403.
- Revisor aprueba render r1, luego editor cambia imagen => publicación r1 antigua debe bloquearse si el render actual cambia.
- Asset sin licencia => render de preview permitido bajo marca de prueba, **publicación bloqueada**.
- Claim acusatorio sin revisión => aprobación bloqueada.
- Worker recibe 2 mensajes iguales => solo un costo/recurso persistente.
- API Meta timeout tras subida => reconciliar antes de POST nuevo.
- Token vencido => job suspendido y acción de reconectar.
- Presupuesto hard cap alcanzado => proveedor no es llamado.
- Webhook firma incorrecta => 401/403 y cero efectos.

## Protocolo pilotos

Elegir 10 historias heterogéneas, pero de riesgo editorial controlable, con fuentes confiables y derechos claros. Por video registrar: idioma, duración objetivo/real, categorías, assets, reclasificaciones de claims, número de revisiones, coste por proveedor, tiempo total y humano, p95 de render, puntuación 0–5 de calidad narrativa/voz/visual/factual, errores y evaluación final. No publicar automáticamente los pilotos; primero dry-run y Page de prueba autorizada.

## Aceptación del MVP

[ ] 10 videos completos, revisión humanamente firmada. [ ] todos MP4 H264 1080×1920 120–240 s. [ ] subs sincronizados y audio audible. [ ] sin fuentes críticas faltantes ni licencias pendientes. [ ] prueba de publicación por API válida o gap registrado con opción exportación manual (en tal caso **MVP completo de autopublicación NO aprobado**). [ ] métricas obtenidas si API lo permite. [ ] factura/consumo conciliados. [ ] rollback y restore demostrados. [ ] roles/tenants verificados.
