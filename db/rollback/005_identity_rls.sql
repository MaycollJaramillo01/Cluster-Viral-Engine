DROP POLICY membership_self ON memberships;
DROP POLICY identity_self ON app_users;
ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_users NO FORCE ROW LEVEL SECURITY;
DELETE FROM schema_migrations WHERE version='005_identity_rls';
-- Stop the foundation runtime before rollback: its safety checks require FORCE RLS.
