# Plan de UAT de 10 pilotos (BORRADOR)

**Sin aprobar.** Es una propuesta para que la revisen el responsable editorial, el legal y el técnico. No hay temas elegidos: inventarlos aquí sería justo lo que el producto debe evitar. Los ejecuta F08-02, cuando existan credenciales y un reviewer real.

## Matriz

Cubre duración, cantidad de material, origen de lo visual y riesgo. Las hipótesis son las de `docs/16`.

| # | Duración | Assets | Visual | Riesgo editorial | Hipótesis | Tema |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 120 s | 10 | Archivo | Bajo | H03 | Por elegir |
| 2 | 120 s | 30 | Archivo | Bajo | H03 | Por elegir |
| 3 | 180 s | 20 | Archivo | Bajo | H03 | Por elegir |
| 4 | 240 s | 10 | Archivo | Bajo | H03 | Por elegir |
| 5 | 240 s | 30 | Archivo | Medio | H03 | Por elegir |
| 6 | 180 s | 20 | Archivo con recreación IA rotulada | Medio | H04 | Por elegir |
| 7 | 180 s | 20 | Mayoría recreación IA rotulada | Medio | H04 | Por elegir |
| 8 | 150 s | 20 | Archivo, historia local | Medio | H02 | Por elegir |
| 9 | 150 s | 20 | Archivo, historia global | Medio | H02 | Por elegir |
| 10 | 180 s | 30 | Archivo, personas vivas o asunto legal | Alto | Prueba del gate legal | Por elegir |

Los pilotos 1 a 5 también contrastan la medición de F05 con material y voz reales.

## Criterios por piloto

Ningún piloto cuenta como superado sin todo esto:

- **Fuentes:** cada claim del guion tiene fuente y está aprobado en el dossier, revisado por una persona.
- **Derechos:** cada archivo tiene licencia con prueba, uso comercial y atribución, y la recreación con IA lleva rótulo.
- **Render:** las 13 comprobaciones automáticas de QA en verde, en el contenedor de producción.
- **Revisión humana:** una persona mira el master completo y juzga legibilidad en un teléfono, movimiento, variedad y mezcla con voz real.
- **Aprobación:** el reviewer aprueba por el hash, y no quien creó el video.
- **Coste:** coste final por video comparado con la factura del proveedor (F08-07).
- **Tiempos:** quien produce anota cuánto tiempo humano dedicó, porque el sistema no lo registra.

## Se detiene si

- Una afirmación sin fuente llega al render aprobado.
- Un archivo sin licencia pasa la aprobación.
- Una organización ve datos de otra.
- Se publica algo sin aprobación por hash.

## Firmas

| Papel | Nombre | Fecha | Decisión |
| --- | --- | --- | --- |
| Responsable editorial | Pendiente | | |
| Legal | Pendiente | | |
| Responsable técnico | Pendiente | | |
