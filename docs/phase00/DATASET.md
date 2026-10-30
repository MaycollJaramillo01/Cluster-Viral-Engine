# F00-02: La historia de un segundo

Propuesta de bajo riesgo: explicación de una unidad de medida, sin personas investigadas ni material violento. Guion original de 293 palabras, ocho escenas contiguas de 15 s, duración objetivo 120 s a comprobar con voz LATAM. Claims y assets **PENDING**, sin firma editorial. La independencia editorial de las dos instituciones y la suficiencia de evidencia por claim requieren aceptación humana; dos dominios distintos son solamente un control técnico mínimo.

Fuentes consultadas el 30-10-2026: [BIPM, definición del segundo](https://www.bipm.org/en/si-base-units/second) y [NIST, funcionamiento de los relojes atómicos](https://www.nist.gov/atomic-clocks/how-do-atomic-clocks-work). El primero respalda la unidad y el valor de frecuencia; el segundo explica oscilación, conteo y realización de relojes. Las frases son redacción original; no se descargan fotos/logos ni se confunde el enlace documental con permiso para reutilizar imágenes de esas páginas.

| Escena | Tiempo | Asset original | Narrativa / fuente |
|---|---|---|---|
| 1 | 0–15 s | assets/01.png, reloj esquemático | Pregunta sobre referencia común / NIST |
| 2 | 15–30 s | assets/02.png, unidad entre laboratorios | Unidad SI y símbolo / BIPM |
| 3 | 30–45 s | assets/03.png, señal periódica | Oscilación y conteo / NIST |
| 4 | 45–60 s | assets/04.png, cesio-133 | Átomo de referencia / BIPM |
| 5 | 60–75 s | assets/05.png, dos niveles | Transición conceptual sin escala / BIPM |
| 6 | 75–90 s | assets/06.png, contador/frecuencia | Valor de frecuencia / BIPM |
| 7 | 90–105 s | assets/07.png, comparación de relojes | Realización práctica / NIST |
| 8 | 105–120 s | assets/08.png, fuentes y revisión | Cierre y comprobación humana / ambas |

Los ocho recursos se dibujan con `workers/render/generate_dataset.py` usando geometría/texto, sin imágenes de terceros ni API generativa. Procedencia `ORIGINAL`, comprobante: código y checksums de PNG en `asset-checksums.json`. Esa procedencia **no significa licencia contractual aceptada** ni asigna una licencia pública en nombre del cliente. La titularidad/uso comercial y las condiciones de la tipografía deben aprobarse antes de uso editorial. Los PNG muestran “ILUSTRACIÓN ORIGINAL / NO ES ARCHIVO” y “POC TÉCNICA / SIN VOZ TTS”. Son esquemas, no reconstrucciones de evidencia histórica.

Diferencia respecto del objetivo documental: se ensaya con diagramas originales en vez de 8–12 fotografías/archivos licenciados. El cliente debe aceptar este dataset para PoC o aportar un set documental con permisos comprobables. No se presenta esa diferencia como requisito cumplido. La variante de 240 s conserva los ocho recursos y estira tiempos solamente para medir render.

Fixture versionada: `fixtures/phase00/valid-manifest.json`; fixture inválida: `fixtures/phase00/invalid-manifest.json`. Los IDs y la revisión vinculan fuentes, claims y assets con proyecto/org. Los timestamps de subtítulos son estimados; el proveedor o forced alignment debe reemplazarlos al disponer de voz real. Un reviewer debe medir/aceptar el desfase y la legibilidad.
