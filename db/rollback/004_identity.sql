-- Export identity/session data, stop runtime, and roll back 005 first. No CASCADE.
DROP TABLE auth_rate_limits;
DROP TABLE auth_two_factors;
DROP TABLE auth_accounts;
DROP TABLE auth_verifications;
DROP TABLE auth_sessions;
DROP FUNCTION capture_auth_session();
DROP TABLE auth_users;
-- Keep auth_events and its append-only trigger as evidence. No user FK prevents retention loss.
DELETE FROM schema_migrations WHERE version='004_identity';
-- Reapplying 004 after this rollback requires restoring the exported branch/snapshot,
-- since retained auth_events deliberately blocks a blind CREATE TABLE re-run.
