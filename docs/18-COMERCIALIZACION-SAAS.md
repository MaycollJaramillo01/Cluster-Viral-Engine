# 18 · Escalado SaaS después de MVP

**No implementar facturación ahora**; sí diseñar `organizations`, `memberships`, roles y cuotas por tenant.

Fase SaaS: onboarding self-service, Stripe/alternativa compatible por jurisdicción, planes y límites, cuotas por jobs/token/min render/GB, usage metering, webhooks de facturación, trial, tenant-specific branding, custom voices/licencias, SSO, audit export, integración multi-Page y multi-canal cuando APIs autorizadas.

## Decisiones de arquitectura futura

A) Shared Neon + RLS para decenas de organizaciones pequeñas; test pentest y métricas por org. B) Database/project per tenant para clientes exigentes, mayor aislamiento/costo y necesidad de provisioning. C) Workers autoscaling con QoS por tenant; una org no debe agotar cola global. D) Billing ledger doble entrada para no perder costes; ingreso reconocido separado de estimaciones. E) Data residency y derechos para contenido de clientes.

## Gates de comercialización

[ ] 90 días de operación sin publicaciones no autorizadas, [ ] eficacia e idempotencia probadas, [ ] contrato y licencias voz/media/Remotion si aplica, [ ] soporte y SLA definidos, [ ] políticas privacidad/retención/DSAR, [ ] métricas de margen por tenant, [ ] pentest y backup restore multi-tenant.
