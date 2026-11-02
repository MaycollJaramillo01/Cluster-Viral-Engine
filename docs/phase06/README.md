# Fase 06: revisión y aprobación de render (solo API)

Fecha: 31-10-2026. **NO_GO para aceptación de fase.** Preparación técnica autorizada por el usuario sobre F00 a F05 sin firmar. No habilita publicación: aquí no hay dashboard, endpoint de publicación ni conexión con Meta.

Esta rama solo cubre la parte de la fase que `AGENTS.md` permite antes de verificar Meta y el PoC multimedia. El resto queda registrado como bloqueado en [status.json](status.json).

## Qué funciona

API bajo `/api/organizations/{id}/projects/{projectId}/renders/{renderId}`, contrato en [render.openapi.yaml](../../api/render.openapi.yaml):

- **`GET .../review`** (`organization:read`): reúne lo que el revisor debe tener delante. URL firmadas de master, preview, póster y SRT, bloqueos, avisos, comprobaciones humanas pendientes, claims y fuentes citados en el guion, derechos del material, coste por proveedor y decisiones anteriores. También dice si ese render es la aprobación vigente.
- **`POST .../decision`** (`editorial:review`): aprueba o rechaza los bytes exactos. Recibe `decision`, `target_sha256` y `note`, obligatoria al rechazar. El cuerpo es estricto: `{"approved":true}` devuelve 400.

## Reglas de aprobación

La transacción bloquea proyecto y render, y relee:

- Licencias, material y voz vigentes.
- Claims del guion frente al dossier aprobado, y que el dossier no haya cambiado.
- QA del render.
- Que el render sea del material vigente, reconstruyendo el manifest y comparando su hash.
- Que no venga del doble de pruebas.

Cualquier fallo devuelve `BLOCKED_BY_POLICY`. Rechazar no pasa por estas comprobaciones, porque nunca debe quedar bloqueado.

La base lo impone aunque falle el código:

- Una FK liga cada aprobación de render a `(organization_id, render_id, artifact_sha256)`, así que no se puede aprobar otro hash.
- Un trigger impide poner un proyecto en `APPROVED` sin una aprobación de render.
- El rol de la aplicación solo tiene `SELECT` e `INSERT` sobre `approvals`.

Lo aprobado queda congelado. Guion, material, licencias y nuevos renders devuelven 409 con el proyecto en `APPROVED`. Hay una excepción: retirar un material usado anula la aprobación y devuelve el proyecto a `ASSETING`. Para cambiar otra cosa, un reviewer debe retirar antes la aprobación con `REJECTED`. Pedir de nuevo el mismo render lo devuelve a `VIDEO_REVIEW` y exige otra decisión humana.

## Lo que no está verificado

- `BLOCKED_EXTERNAL` **Meta (F06-05 y F06-08):** sin credenciales, Page de prueba ni App Review. No se sabe si un video de 2–4 min se acepta.
- **Revisor humano:** el flujo se prueba contra PostgreSQL con actores de prueba. Por HTTP solo se prueban errores y permisos, porque la cuenta local es editor. Nadie ha hecho aún el piloto de F06-12.
- **Vídeo real:** los renders de prueba usan material y voz sintéticos. El paquete de revisión se ha comprobado por sus datos, no con una persona decidiendo con él.
- Sin probar contra Neon: todo se probó en PostgreSQL 17 local.

## Diferencias con el plan y los requisitos

- **Sin interfaz (F06-01, F06-02 y F06-03):** la regla 2 de `AGENTS.md` prohíbe el dashboard antes de verificar Meta. Por eso no hay cola ni asignación de revisor; solo API. Que los cambios invaliden lo aprobado sí está probado por API.
- **Sin publicación (F06-06, F06-07 y F06-10):** la misma regla. No se creó ningún adaptador de publicación ni tabla nueva.
- **Ruta:** `POST .../renders/{id}/decision` en vez de `POST /api/renders/{id}/approve` de `docs/06`, igual que las demás decisiones del proyecto.
- **El hash aprobado es el de los bytes** (`artifact_sha256`), no el del manifest.
- **Los bytes no se releen al aprobar:** `docs/06` pide validar el checksum. Aquí se compara con el hash registrado y la FK lo impone. Leer cientos de MB dentro de la transacción choca con los límites de tiempo del pool. **Publicar tendrá que repetir todas las comprobaciones y rehashear los bytes**, porque una licencia también puede vencer después de aprobar.
- **Transición nueva:** `APPROVED --> ASSETING` para retirar una aprobación. El diagrama original no la contemplaba y ya está añadida.
- **Dos renders vigentes:** si difieren en el título, ambos son aprobables y el revisor elige. Rechazar cualquiera de ellos en `VIDEO_REVIEW` lleva a `ASSETING`, y pedirlo de nuevo vuelve a revisión.
- **Comprobaciones humanas:** se muestran, pero no se registran una a una. Aprobar equivale a haberlas hecho, y el revisor debe mirar el master, no solo la preview.
- **Notificaciones (F06-09):** `RENDER_APPROVED` y `RENDER_REJECTED` quedan en el outbox, pero nadie los entrega todavía.
- **Sin MFA para reviewer:** `docs/13` lo exige a owner y admin.
- **Un mismo owner** puede crear y aprobar, como en F02 a F04. Debe decidirlo el responsable editorial antes de producción.

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

Rollback: revertir la PR y ejecutar `db/rollback/011_render_approval.sql` en transacción, tras exportar las aprobaciones `RENDER`. Lo aprobado vuelve a `VIDEO_REVIEW` y `audit_events` conserva quién aprobó cada hash.

Coste: sin llamadas a proveedores ni servicios contratados. Evidencia en [evidence/](evidence/) y estado por ticket en [status.json](status.json).
