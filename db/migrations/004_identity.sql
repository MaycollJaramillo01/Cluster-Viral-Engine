-- Generated from Better Auth 1.7.14 configuration; reviewed and versioned.
create table "auth_users" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null, "twoFactorEnabled" boolean);

create table "auth_sessions" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "auth_users" ("id") on delete cascade);

create table "auth_accounts" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "auth_users" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table "auth_verifications" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "auth_two_factors" ("id" text not null primary key, "secret" text not null, "backupCodes" text not null, "userId" text not null references "auth_users" ("id") on delete cascade, "verified" boolean, "failedVerificationCount" integer, "lockedUntil" timestamptz);

create table "auth_rate_limits" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);

create index "auth_sessions_userId_idx" on "auth_sessions" ("userId");

create index "auth_accounts_userId_idx" on "auth_accounts" ("userId");

create index "auth_verifications_identifier_idx" on "auth_verifications" ("identifier");

create index "auth_two_factors_secret_idx" on "auth_two_factors" ("secret");

create index "auth_two_factors_userId_idx" on "auth_two_factors" ("userId");

-- Separate identity ledger. No passwords, tokens, secrets, user agent or IP copied here.
CREATE TABLE auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  action text NOT NULL CHECK(action IN ('SESSION_CREATED','SESSION_REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION capture_auth_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO auth_events(user_id,action) VALUES(NEW."userId",'SESSION_CREATED');
    RETURN NEW;
  END IF;
  INSERT INTO auth_events(user_id,action) VALUES(OLD."userId",'SESSION_REVOKED');
  RETURN OLD;
END $$;
CREATE TRIGGER auth_session_audit AFTER INSERT OR DELETE ON auth_sessions
  FOR EACH ROW EXECUTE FUNCTION capture_auth_session();
CREATE TRIGGER auth_events_append_only BEFORE UPDATE OR DELETE ON auth_events
  FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
REVOKE ALL ON auth_users,auth_sessions,auth_accounts,auth_verifications,auth_two_factors,auth_rate_limits,auth_events FROM PUBLIC;
INSERT INTO schema_migrations(version) VALUES('004_identity');
