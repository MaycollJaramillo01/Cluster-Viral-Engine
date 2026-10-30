-- Export phase00_runs + audit evidence first. No cascade; does not delete audit history.
DROP TRIGGER audit_append_only ON audit_events;
DROP FUNCTION protect_audit_events();
DROP TABLE phase00_runs;
DROP FUNCTION protect_phase00_run();
DELETE FROM schema_migrations WHERE version='003_phase00';
