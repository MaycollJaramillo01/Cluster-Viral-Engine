# 07 · Radar, investigación, fuentes y riesgo reputacional

## Entrada al radar

Ingresar URL social voluntaria; identificar plataforma, autor/permalink, fecha, categoría y engagement **solo si API/términos permiten acceso**. No usar descarga masiva de cuentas ajenas ni eludir límites. Si no hay API, registrar metadatos manualmente y usar el contenido como referencia editorial, nunca copiando escenas/guiones.

## Flujo de investigación

1. Propuesta: título, enfoque, geografía, fecha, entidades y supuestos.
2. Plan de búsqueda: 5–10 consultas contrastadas, fuentes oficiales, archivos públicos y medios.
3. Recuperación: guardar URL canónica, autor, editorial, fecha de publicación y fecha de consulta, fragmento de evidencia mínimo y licencia de uso.
4. Extracción de afirmaciones atómicas (`claims`): una proposición comprobable por fila.
5. Clasificación: `CONFIRMED`, `DISPUTED`, `ALLEGATION`, `UNVERIFIED`, `OPINION`, `RECONSTRUCTION`.
6. Concordancia/contradicción entre fuentes; fuente primaria vs secundaria; fecha del acontecimiento vs noticia.
7. Informe de riesgo: crimen abierto, persona viva, acusaciones, menores, violencia, derechos de imagen y material con restricción.
8. Revisión humana obligatoria de afirmaciones de alto impacto antes de guion.

## Política editorial

- No presentar investigación o imputación como condena. Incluir términos precisos: investigado, acusado, condenado, absuelto, proceso abierto.
- No inventar citas ni reproducir titulares como si fueran documentos auténticos.
- No recrear escenas que impliquen prueba audiovisual de un hecho no documentado. Rotular `Recreación generada con IA` cuando sea susceptible de confusión.
- Evitar imágenes gráficas, datos personales irrelevantes y sensacionalismo contra víctimas.

## Score de potencial viral v1 (experimento, no promesa)

`score = 0.20*hook + 0.15*curiosidad + 0.15*conflicto + 0.10*relevancia + 0.10*compartibilidad + 0.10*material_visual + 0.10*calidad_fuentes + 0.10*similares`.

Cada factor 0–100 y justificación editorial. El score final se redondea 0–100; registrar pesos/versión. Debe penalizarse o excluirse mediante policy gate cualquier historia de alto riesgo **sin pruebas**, independientemente del score. Recalibrar con datos después de una muestra suficiente y respetar sesgos por horario/alcance.

## Checklist antes de aprobar dossier

[ ] Al menos dos fuentes independientes cuando existan.  [ ] Fechas exactas y zona/historia contextualizada.  [ ] Claims potencialmente dañinos contrastados.  [ ] Distinguir sospechas y sentencias.  [ ] No hay citas inventadas.  [ ] URLs guardadas.  [ ] Derechos de recursos evaluados.  [ ] Revisor firmado y dossier congelado.
