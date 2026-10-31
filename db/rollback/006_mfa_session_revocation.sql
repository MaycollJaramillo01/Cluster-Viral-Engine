-- Stop privileged access first; this removes cross-browser invalidation on MFA changes.
DROP TRIGGER auth_mfa_revoke_sessions ON auth_users;
DROP FUNCTION revoke_sessions_on_mfa_change();
DELETE FROM schema_migrations WHERE version='006_mfa_session_revocation';
