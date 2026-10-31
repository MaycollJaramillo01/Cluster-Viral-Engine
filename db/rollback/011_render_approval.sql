-- Export RENDER approvals first: sin esta migración un render no se aprueba y lo aprobado vuelve a revisión. audit_events conserva quién aprobó cada hash.
DROP TRIGGER project_approved_insert ON projects;
DROP TRIGGER project_approved_update ON projects;
DROP FUNCTION require_render_approval();
UPDATE projects SET status='VIDEO_REVIEW',updated_at=now(),revision=revision+1 WHERE status='APPROVED';
DELETE FROM approvals WHERE approval_type='RENDER';
ALTER TABLE approvals DROP CONSTRAINT approvals_render_required, DROP CONSTRAINT approvals_render_target_fk;
ALTER TABLE renders DROP CONSTRAINT renders_artifact_key;
DELETE FROM schema_migrations WHERE version='011_render_approval';
