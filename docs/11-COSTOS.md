# 11 · Costos, sensibilidad y unit economics

## Base documental vs proyección

**Documento del cliente:** US$65–95/mes de referencia; LLM US$5–12, ElevenLabs ~US$22, infraestructura US$10–18, IA visual US$15–25, reserva US$13–18. **No son cotizaciones garantizadas.**

**Propuesta:** modelos 30/60 videos con costos *ilustrativos* y sin impuestos, desarrollo, mano de obra, herramientas de investigación de pago, comisiones de cobro ni capacidad media de almacenamiento. Ver `costos/escenarios.csv` y `costos/sensibilidad.csv`.

| Escenario | 30 videos/mes | 60 videos/mes | Comentario |
|---|---:|---:|---|
| Bajo con biblioteca y mínimo IA visual | US$62 | US$91 | posible solo si cuota TTS y worker alcanzan; verificar |
| Base | US$88 | US$137 | base de decisión, no oferta proveedor |
| Alto con regeneraciones e IA visual | US$145 | US$246 | no cumple US$100 |

**Conclusión:** objetivo **<US$100 no asegurado**; más razonable en 30 videos con edición eficiente y sin depender de visuales IA por escena. Para 60 videos, el escenario base supera objetivo. El coste real de TTS escala con caracteres/modelo/uso y cualquier plan puede tener límites.

## Fórmula

`coste_mensual = gastos_fijos + Σ(llm_tokens * tarifa_modelo + tts_caracteres * tarifa_voz + imagenes * tarifa_imagen + minutos_worker * tarifa_compute + storage + egreso + reintentos)`.

`coste_por_video = (gastos_fijos asignados / videos_aprobados) + coste_variable_video`; reportar también costos de videos fallidos porque consumen presupuesto.

## Hard caps y controles

- Per-video: `estimated_usd > max_usd_per_video` requiere aprobación de presupuesto; si gasto real llega a 120% presupuesto bloquea próximas llamadas.
- Org mensual: soft 80%; hard 100% para IA y render (excepto admin con aumento explícito auditado).
- Quotas por proveedor/voice/model, tokens y caracteres por job; límite de generación de imágenes por historia.
- Caché por fingerprint y facturación única por request; registrar reintentos/costo no recuperado.
- Alertas diarias y reconciliación semanal con billing real.

## Estimación de trabajo

380–550 h, según fases. A US$25/h = US$9,500–13,750; a US$40/h = US$15,200–22,000; a US$60/h = US$22,800–33,000 **solo referencia de costos de trabajo, no precio de mercado**. Infra, QA externo, legal y Meta Review no garantizados en estas horas. Plazos: un senior 10–14 semanas con 40 h/semana; dos personas pueden paralelizar, pero no eliminar dependencias.

## Plan de calibración con 10 videos

Medir costo de 1) investigación, 2) guion, 3) assets, 4) narración, 5) render, 6) transferencias, 7) revisiones y 8) fallos. Sumar fijos de infraestructura y comparar modelos/voz. Calcular distribución p50/p95, tasa de rechazo, minutos humanos y proyección 30/60. Decisión go/no-go al final de fase 08.
