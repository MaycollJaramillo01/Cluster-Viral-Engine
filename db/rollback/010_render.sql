-- Export renders first: dropping these columns removes manifests, QA and output keys. Conserva audit_events, outbox_events y provider_usage.
-- Los jobs de render se van con sus renders: su clave de idempotencia impediría pedir de nuevo el mismo manifest.
DROP FUNCTION claim_render_job(text,integer);
DROP INDEX jobs_render_dispatch_idx;
DROP INDEX renders_project_idx;
DELETE FROM renders;
DELETE FROM jobs WHERE job_type='RENDER';
DROP POLICY jobs_render_dispatch ON jobs;
ALTER TABLE renders DROP CONSTRAINT renders_success_complete, DROP CONSTRAINT renders_requester_fk, DROP CONSTRAINT renders_job_fk,
  DROP COLUMN manifest, DROP COLUMN job_id, DROP COLUMN requested_by, DROP COLUMN provider, DROP COLUMN preview_object_key, DROP COLUMN poster_object_key, DROP COLUMN captions_object_key,
  DROP COLUMN qa, DROP COLUMN metrics, DROP COLUMN error_code, DROP COLUMN cancel_requested_at;
DELETE FROM schema_migrations WHERE version='010_render';
