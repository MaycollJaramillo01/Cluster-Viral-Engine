# Fase 03: guiones y edición versionada

Fecha: 31-10-2026. **NO_GO para aceptación de fase.** Preparación técnica autorizada por el usuario sobre F00, F01 y F02 sin firmar. No habilita publicación.

## Qué funciona

API por proyecto bajo `/api/organizations/{id}/projects/{projectId}/script`, contrato en [scripts.openapi.yaml](../../api/scripts.openapi.yaml):

- **Guion estructurado:** en español latinoamericano, con 3 ganchos, 3 o más títulos, tono, duración objetivo y secciones (gancho, contexto, desarrollo, revelación, desenlace) ligadas a claims del dossier.
- **Versiones:** cada guardado crea una versión inmutable y conserva las anteriores. Un trigger solo deja cambiar su estado. Sin dossier aprobado no se guarda nada.
- **Conflictos:** quien guarda declara `base_version`. Si otra persona guardó antes, recibe 409.
- **Escenas:** cada versión genera un manifest con identificador, narración, duración estimada, claims, movimiento, transición y hash. Editar una sección no cambia el hash de las escenas de otras secciones.
- **Generación y regeneración por modelo:** idempotentes, con la llamada fuera de transacción y la salida marcada por origen. Regenerar no puede citar claims distintos a los de esa sección. Si otra persona guarda mientras el modelo responde, se devuelve 409 y el job queda `DEAD`.
- **Revisión humana:** un reviewer aprueba o rechaza el hash exacto. La transacción relee versión, dossier y reglas. Editar después devuelve el proyecto a `SCRIPTING` y deja la aprobación sin efecto.

## Reglas de bloqueo

No se aprueba un guion con:

- Duración estimada fuera de 120–240 s.
- Claim inexistente o sin verificar, o reconstrucción sin rotular.
- Sección factual sin claim, o ningún claim citado en todo el guion.
- Cifra que no aparece en el texto, la evidencia o la fecha de los claims citados.
- Cifra en una sección no factual.
- Atribución a un nombre que no está en las fuentes ni en los claims citados.
- Alegación o disputa sin matiz.
- Afirmación de culpabilidad sin condena, también en títulos y ganchos.

Las secciones no factuales y el lenguaje absoluto en titulares quedan como aviso para el revisor.

## Lo que no está verificado

- `BLOCKED_EXTERNAL` **LLM:** no hay claves OpenAI ni Anthropic. Generar y regenerar devuelven 503 fuera de local. Con `APP_ENV=local` y `EDITORIAL_MODEL=mock` usan un mock cuya salida queda marcada como `MOCK`. No se ha evaluado calidad narrativa ni coste.
- `BLOCKED_EXTERNAL` **F03-02:** sin comparativa de modelos, porque requiere proveedores reales.
- `BLOCKED_EXTERNAL` **F03-05:** la duración es una estimación por palabras y va marcada como tal. Compararla con audio real requiere TTS.
- **F03-11 es parcial:** [fidelity.json](evidence/fidelity.json) prueba el trazado con guiones construidos sobre diez historias ficticias. No mide un modelo real.
- **Reglas heurísticas:** detectan cifras, atribuciones con mayúscula tras "según" y términos judiciales. No ven un hecho inventado sin cifra ni nombre, ni uno escrito en una sección marcada como no factual. Por eso cubren la revisión humana, no la sustituyen.
- **`asset_hint`** es el inicio de la narración, no una sugerencia real de material.
- **F03-12:** el flujo completo editor y reviewer se prueba contra PostgreSQL. Por HTTP solo se prueban errores y permisos, porque la cuenta local es editor.
- La rúbrica de `docs/08` existe como función, pero nadie ha puntuado guiones todavía.
- Sin probar contra Neon: todo se probó en PostgreSQL 17 local.

## Diferencias con el plan y los requisitos

- **Sin interfaz:** `AGENTS.md` prohíbe el dashboard antes de verificar Meta. El editor de F03-07 y F03-12 es por ahora solo API: sin autosave ni estados de carga.
- **Una PR por fase** en vez de una por ticket, por las primitivas compartidas.
- **409 por versión, no por escena:** dos ediciones sobre la misma versión chocan aunque toquen secciones distintas. Es más estricto de lo pedido; se revisará si el editor real lo hace incómodo.
- **`base_version` en el cuerpo** en vez de `If-Match`; el ticket admite ambas.
- **Estado de aprobación por versión, no por escena:** los requisitos lo piden por escena. Se aprueba el guion completo. El audio y el recurso visual de cada escena quedan en `null` hasta F04.
- **Referencias editoriales:** los requisitos piden usar ejemplos de contenido exitoso. El prompt todavía no los recibe; conviene añadirlos al evaluar un modelo real.
- **Un mismo owner** puede crear y aprobar, como en F02. Debe decidirlo el responsable editorial antes de producción.

## Ejecución

```powershell
npm run db:migrate
npm test
$env:PHASE01_TEST_ADMIN_URL='postgresql://<test-admin>@127.0.0.1:55432/postgres'
npm run test:db
npm run test:http
```

Tras migrar fuera de local, un operador debe aplicar `db/runtime-grants.sql`.

## Rollback y coste

Rollback: revertir la PR y ejecutar `db/rollback/008_scripts.sql` en transacción, tras exportar guiones. Conserva auditoría y aprobaciones.

Coste: sin llamadas a proveedores ni servicios contratados. El coste real de LLM sigue desconocido. Evidencia en [evidence/](evidence/) y estado por ticket en [status.json](status.json).
