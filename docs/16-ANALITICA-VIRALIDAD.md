# 16 · Analítica y aprendizaje editorial

## Ontología de métricas

`impressions`, `reach`, `plays`, `engaged_views`, `avg_watch_seconds`, `completion_rate`, `shares`, `comments`, `reactions`, `estimated_revenue` (solo si API lo concede), `cost_usd`, `published_at`, `scraped_at` (NO scrape, nombre recomendado `captured_at`), `graph_api_version`, `source_metric`, `availability_status`.

No confundir views de 3 s, play, alcance e impresiones; conservar la definición de proveedor y no combinar series no equivalentes. En dashboards mostrar fuente y ventana temporal; comparar video por edad desde publicación (1d/7d/30d) y también normalizar por impresiones cuando disponibles.

## Estudios y experimentos

- Hipótesis H01: hook interrogativo supera descriptivo en retención 3–10 s (si la API expone ese dato).
- H02: historias locales vs globales en compartidos/1000 impresiones.
- H03: duración 120 vs 180 vs 240 s por completion rate.
- H04: % visuales de archivo vs IA y desempeño.

Muestra pequeña => conclusiones cualitativas, no 'modelo predice viralidad'. Controlar hora, Page, pauta pagada/organica, edad de video, temática y cambiante distribución. Mantener historia del score por versión y no aprender de datos no expuestos.

## Reporting

Dashboard por mes: videos producidos/publicados/aprobados, coste total y/video, views/engagement, fuentes de coste, rechazos, tiempo humano, causas de fallo. Exportar CSV. Métricas `null` = no disponibles, `0` = disponibles y valor cero.
