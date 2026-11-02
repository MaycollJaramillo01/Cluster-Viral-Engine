# Contratos estructurados

`render-manifest.schema.json` se genera desde `apps/web/src/render/manifest.ts` y una prueba comprueba que no haya deriva. Es lo único que el motor de render acepta como entrada.

Schemas JSON Draft 2020-12 para investigación y escenas, aún no despliegues. Incorporar AJV o Zod/JSON Schema con integración real. El manifest no contiene URLs arbitrarias de inputs a FFmpeg: solo IDs/keys validadas contra organización. `license_approved` es informativo, **se vuelve a consultar la DB antes de aprobar**. La suma `duration_ms` debe ser 120000–240000 para MVP; valídela en dominio, no solo por JSON Schema.
