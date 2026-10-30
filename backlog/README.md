# Backlog importable

`backlog.csv` contiene **108 tareas (9 fases × 12)** con prioridad, área, dependencia, horas mín/máx, evidencia y aceptación. UTF-8 con BOM para Excel en español. No confundir las horas con compromisos contractuales.

**Suma programática de las tareas:** 380.0–550.0 horas. Dependencias dentro de cada fase son secuencia sugerida, no prohibición de paralelizar tareas de bajo acoplamiento.

Importar el CSV en GitHub Projects/Jira y mapear `id`, `tarea`, `estado`, `fase`, `dependencia`. A cada ticket añadir link de PR, evidencia de QA y riesgo asociado antes de mover a DONE.
