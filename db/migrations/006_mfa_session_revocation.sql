-- Enrolling/disabling MFA invalidates every pre-change session, including other browsers.
-- Better Auth creates the challenged/re-authenticated replacement after updating the user.
CREATE FUNCTION revoke_sessions_on_mfa_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM auth_sessions WHERE "userId"=NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER auth_mfa_revoke_sessions AFTER UPDATE OF "twoFactorEnabled" ON auth_users
  FOR EACH ROW WHEN (OLD."twoFactorEnabled" IS DISTINCT FROM NEW."twoFactorEnabled")
  EXECUTE FUNCTION revoke_sessions_on_mfa_change();
INSERT INTO schema_migrations(version) VALUES('006_mfa_session_revocation');
