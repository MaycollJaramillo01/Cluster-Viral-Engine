# Fase 04: narración, sincronización, material y derechos

Fecha: 31-10-2026. **NO_GO para aceptación de fase.** Preparación técnica autorizada por el usuario sobre F00 a F03 sin firmar. No habilita publicación.

## Qué funciona

API bajo `/api/organizations/{id}`, contrato en [media.openapi.yaml](../../api/media.openapi.yaml):

- **Biblioteca privada:** cada archivo se guarda bajo su organización y proyecto, con nombre derivado de su SHA-256. El tipo se decide por los bytes, no por lo que declara el cliente. Se admiten PNG, JPG, MP4, MP3, WAV y PDF. Subir el mismo contenido dos veces devuelve el registro existente. El listado incluye fuente, licencia, escena asignada y estado de aprobación.
- **URL firmadas:** caducan a los 5 minutos y están ligadas a la clave exacta. Se sirven como `attachment` con `nosniff`, para que un archivo no se ejecute en este origen.
- **Licencias:** autor, uso permitido, prueba y caducidad. Sin URL ni documento de prueba no se registra. Una licencia nueva anula la aprobación anterior.
- **Revisión de material:** un reviewer aprueba o rechaza el hash exacto, y la transacción relee los derechos. Cambiar material que ya se usa devuelve el proyecto de `RENDERING` o `VIDEO_REVIEW` a `ASSETING`.
- **Voz por escena:** exige guion aprobado. Cada escena se genera y confirma por separado, con huella de organización, texto, voz, modelo y ajustes. Un fallo parcial conserva lo pagado y el reintento solo genera lo que falta.
- **Estado de medios:** `GET .../media` devuelve bloqueos, avisos, checklist de QA, línea de tiempo con pausas (150 ms entre escenas y 400 ms entre secciones), SRT y ASS. La duración sale del audio real y deja de ser una estimación por palabras.
- **Recreaciones con IA:** se suben con rótulo, prompt y gasto obligatorios. El rótulo aparece sobre la escena en el ASS.
- **Gasto:** preflight sin llamar al proveedor, tope por video y tope mensual, ledger sin `DELETE` ni edición del coste estimado, y alerta en el outbox al cruzar el 80 %.

## Reglas de bloqueo

No hay estado de medios limpio con:

- Escena sin material o sin voz, o voz de un texto que ya cambió.
- Material o música sin aprobar, sin licencia, con licencia vencida, sin uso comercial, sin la atribución exigida o sin prueba.
- Recreación con IA sin rótulo.
- Música sin duración.
- Duración total fuera de 120–240 s.
- Subtítulos que no se pueden construir de forma segura.

Los tiempos `SYNTHETIC` y los fallos de QA quedan como aviso para el revisor.

## Coste y fallos del proveedor

La reserva de gasto y la del job se hacen en una transacción con candado por organización, y la llamada al proveedor va fuera. Dos peticiones iguales a la vez hacen una sola llamada: la segunda recibe 409.

| Resultado del proveedor | Job | Coste |
| --- | --- | --- |
| 429 o error 5xx | `RETRY_WAIT` con espera | Se libera |
| Clave rechazada o texto rechazado | `DEAD` | Se libera |
| Sin respuesta o respuesta malformada | `DEAD`; repetir exige `confirm_retry` | La estimación sigue contando |
| Audio recibido y fallo al guardar | `DEAD`; repetir exige `confirm_retry` | La estimación sigue contando |

Repetir tras una respuesta perdida puede cobrarse dos veces si el proveedor llegó a cobrar la primera. Por eso se exige confirmación explícita y el gasto anterior sigue sumando al tope.

## Lo que no está verificado

- `BLOCKED_EXTERNAL` **ElevenLabs (F04-04):** no hay clave. El adaptador solo se ha probado contra un servidor falso. La página consultada de la API confirma ruta, cuerpo y respuesta. No documenta las cabeceras `xi-api-key`, `character-cost` ni `request-id`, y el código lo marca como pendiente de comprobar. No hay audio latam real ni voz elegida.
- **Mock TTS:** con `APP_ENV=local` y `TTS_PROVIDER=mock` produce un tono WAV marcado `mock-elevenlabs`, con 65 ms por carácter y tiempos `SYNTHETIC`. No es voz y no mide calidad.
- `BLOCKED_EXTERNAL` **Almacenamiento:** sin token de Blob. Fuera de local, subir y generar devuelven 503.
- **Sincronización (F04-07):** con tiempos sintéticos solo se comprueba la aritmética: cues ordenados, dentro de su escena y con el último terminando en la duración total. La deriva visible con voz real sigue sin medir.
- **Márgenes seguros:** son una suposición de partida sin validar con Meta. El contraste comprueba el color del texto frente a su contorno, no frente a la imagen real. La revisión visual queda como `NEEDS_HUMAN`.
- **Tarifas:** las pruebas usan tarifas ficticias. `ELEVENLABS_USD_PER_1K_CHARS` debe venir del plan contratado, y el coste real por video sigue desconocido.
- **Recreaciones (F04-09):** no hay proveedor de imagen. El gasto lo declara quien sube el archivo y nadie ha evaluado un prompt seguro.
- **Revisor humano:** el flujo editor y reviewer se prueba contra PostgreSQL. Por HTTP solo se prueban errores y permisos, porque la cuenta local es editor.
- Sin probar contra Neon: todo se probó en PostgreSQL 17 local.

## Diferencias con el plan y los requisitos

- **Sin interfaz:** `AGENTS.md` prohíbe el dashboard antes de verificar Meta. Todo es API.
- **Una PR por fase** en vez de una por ticket, por las primitivas compartidas.
- **Selección de voz:** se envía `voice_id`, pero no hay listado de voces porque requiere el proveedor real.
- **Sin descarga de audio de voz por API:** la voz se escuchará en la preview de F05. Los requisitos piden conservar el archivo y eso sí se cumple.
- **Búsqueda de material (F04-03):** el catálogo es manual, sin búsquedas externas con uso permitido.
- **Efectos de sonido:** se catalogan con su licencia, pero no se asignan a escenas ni se mezclan.
- **Caché entre proyectos:** la huella es por organización, como pide F04-05. Otro proyecto de la misma organización reutiliza el audio aunque su objeto esté guardado bajo el primer proyecto.
- **`voice_generations`** es la tabla del esquema existente; `docs/05` usa otro nombre para este concepto.
- **`VOICING` sin uso:** voz y material se trabajan a la vez en `ASSETING`.
- **Tope por video como bloqueo duro:** no hay flujo para aprobar una excepción.
- **Tope mensual:** se lee de `organizations.monthly_budget_usd`, no de `MONTHLY_HARD_CAP_USD`. Subirlo es una operación manual de base de datos, sin el aumento explícito y auditado que pide `docs/11`.
- **Sin WebP ni SVG:** el SVG podría ejecutar código y WebP no se ha necesitado aún.
- **Límite de 50 MB en memoria y solo en local:** Vercel Functions admite unos 4,5 MB, así que con Blob real la carga deberá ir directa al almacenamiento.
- **Firma local:** deriva de `BETTER_AUTH_SECRET`. Con Blob real se usarán las URL del proveedor.
- **Sin recuperación automática de leases:** un proceso caído deja el job `RUNNING` 3 minutos. Después solo se retoma con `confirm_retry`, porque no hay scheduler.
- **Estilo de subtítulos:** el rótulo baja a margen superior 200 en `media/captions.ts`. El PoC conserva 70 en `phase00/subtitles.ts` porque el acta de F00 enlaza ese archivo por hash. Hay por eso una copia pequeña del formato.
- **Un mismo owner** puede crear y aprobar, como en F02 y F03. Debe decidirlo el responsable editorial antes de producción.

## Ejecución

```powershell
npm run db:migrate
npm test
$env:PHASE01_TEST_ADMIN_URL='postgresql://<test-admin>@127.0.0.1:55432/postgres'
npm run test:db
npm run test:http
```

Para generar voz simulada en local: `TTS_PROVIDER=mock` y `APP_ENV=local`. Tras migrar fuera de local, un operador debe aplicar `db/runtime-grants.sql`.

## Rollback y coste

Rollback: revertir la PR y ejecutar `db/rollback/009_media.sql` en transacción, tras exportar material, licencias y voz. Conserva auditoría, aprobaciones y ledger. Los objetos ya guardados no se borran.

Coste: sin llamadas a proveedores ni servicios contratados. Un guion de prueba de unos 150 s tiene unos 2 200 caracteres; su coste real depende de la tarifa del plan. Evidencia en [evidence/](evidence/) y estado por ticket en [status.json](status.json).
