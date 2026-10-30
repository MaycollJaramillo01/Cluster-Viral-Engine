# 13 · Seguridad, compliance y threat model

## Amenazas críticas

- **Autorización multi-tenant:** falta de `WHERE organization_id`, IDs adivinables, service key en frontend, rol DB con bypass RLS.
- **Tokens Meta/ElevenLabs/OpenAI:** exposición por logs, errores, preview/PR, frontend bundling, endpoint SSRF.
- **Prompt injection:** contenido de noticias intenta alterar instrucciones, obtener secretos o falsificar citas.
- **SSRF/uploads:** worker descarga URLs arbitrarias hacia metadata endpoints o redes privadas; zip bombs y videos maliciosos.
- **Supply chain:** FFmpeg/plugins y Github Actions vulnerables; validar imágenes container y fijar versiones/digests.
- **Webhooks:** firmas falsas/replays que modifican estados, bucle de eventos.

## Controles

1. Cookies HttpOnly Secure, OIDC/SSO apropiado y MFA para owner/admin; CSRF y controles anti-enumeración.
2. Roles en backend; scope `organization_id` derivado del principal. Pruebas que verifican no filtración entre tenants por API, DB, búsqueda y media URLs.
3. Envelope encryption AES-256-GCM para tokens persistentes; clave en secrets/KMS separado de Neon. Rotación documentada y auditoría.
4. CORS explícito, rate limits por org; campos JSON con tamaño máximo; Zod y escapes para HTML/SQL; consultas parametrizadas.
5. Worker sandbox: rootless, sin privilegios, filesystem efímero, CPU/RAM/timeout, egress allowlist, lectura solo storage permitido, FFmpeg subprocess sin shell.
6. Hash y validación de video/image MIME vs contenido, antivirus/sandbox cuando corresponda; firmar descargas y nunca aceptar URL arbitraria de una IA.
7. Meta webhook: `HMAC-SHA256` y comparación temporal segura sobre raw body; idempotency event ID y anti replay.
8. Datos de historia crítica con fuente: aprobaciones de roles humanos, versiones inmutables, protección contra cambios posteriores.
9. Retención: por defecto borrado de intermedios a 30 días (política configurable), protección legal de evidencia/publicaciones, GDPR/privacidad si se comercializa.
10. Dependency review/SBOM, secret scanning, DAST de endpoints y test OWASP Top 10 2025.

## Contenido/documental

No afirmar culpabilidad sin sentencia; tomar especial cuidado con personas vivas, menores, fotografías de víctimas, derechos de autor, marca de reproducciones generativas y políticas Meta sobre contenido no original y monetización. El proyecto debe incluir revisión legal en materiales sensibles. Ningún prompt ni proveedor sustituye verificación humana.
