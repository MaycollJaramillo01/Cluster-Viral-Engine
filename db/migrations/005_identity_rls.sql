ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_self ON app_users FOR SELECT
  USING (auth_subject = NULLIF(current_setting('app.auth_subject',true),''));

-- Bootstrap only the authenticated actor's memberships before choosing an organization.
-- The application sets app.actor_id from identity_self, never from a request header/body.
CREATE POLICY membership_self ON memberships FOR SELECT
  USING (user_id = NULLIF(current_setting('app.actor_id',true),'')::uuid);
INSERT INTO schema_migrations(version) VALUES('005_identity_rls');
