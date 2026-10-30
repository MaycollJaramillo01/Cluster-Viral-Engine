-- CLUSTER VIRAL ENGINE schema v0.1 — draft to execute on isolated Neon branch first.
-- Run with DATABASE_URL_UNPOOLED and psql -v ON_ERROR_STOP=1 -1.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  name text NOT NULL,
  monthly_budget_usd numeric(12,5) NOT NULL DEFAULT 100 CHECK (monthly_budget_usd>=0),
  hard_stop boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','editor','reviewer','analyst')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,user_id), UNIQUE(organization_id,id)
);
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'DISCOVERED' CHECK (status IN ('DISCOVERED','RESEARCHING','RESEARCH_REVIEW','SCRIPTING','SCRIPT_REVIEW','ASSETING','VOICING','RENDERING','VIDEO_REVIEW','APPROVED','PUBLISHING','PUBLISHED','REJECTED','FAILED')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id)
);
CREATE TABLE stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid,
  proposed_title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  hook text NOT NULL DEFAULT '',
  category text,
  scoring_version text NOT NULL DEFAULT 'v1',
  viral_score numeric(5,2) CHECK (viral_score BETWEEN 0 AND 100),
  score_factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  editorial_risk text NOT NULL DEFAULT 'UNKNOWN',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE editorial_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  story_id uuid,
  platform text NOT NULL CHECK(platform IN ('facebook','youtube','tiktok','instagram','web','manual')),
  url text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  metrics jsonb,
  permissions_note text NOT NULL DEFAULT 'MANUAL',
  UNIQUE(organization_id,id),
  FOREIGN KEY (organization_id,story_id) REFERENCES stories(organization_id,id)
);
CREATE TABLE sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL,
  url text NOT NULL,
  publisher text,
  author text,
  publication_date date,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  source_type text NOT NULL DEFAULT 'SECONDARY' CHECK (source_type IN ('PRIMARY','SECONDARY','OTHER')),
  evidence_excerpt text,
  source_sha256 text,
  UNIQUE(organization_id,id),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL,
  statement text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('CONFIRMED','DISPUTED','ALLEGATION','UNVERIFIED','OPINION','RECONSTRUCTION')),
  sensitivity text NOT NULL DEFAULT 'NORMAL' CHECK (sensitivity IN ('NORMAL','HIGH')),
  verified_by uuid REFERENCES app_users(id),
  verified_at timestamptz,
  UNIQUE(organization_id,id),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE claim_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  claim_id uuid NOT NULL,
  source_id uuid NOT NULL,
  relation text NOT NULL CHECK(relation IN ('SUPPORTS','CONTRADICTS','CONTEXT')),
  excerpt text,
  UNIQUE(organization_id,id), UNIQUE(organization_id,claim_id,source_id),
  FOREIGN KEY (organization_id,claim_id) REFERENCES claims(organization_id,id),
  FOREIGN KEY (organization_id,source_id) REFERENCES sources(organization_id,id)
);
CREATE TABLE scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL,
  locale text NOT NULL DEFAULT 'es-419',
  current_version integer NOT NULL DEFAULT 0,
  UNIQUE(organization_id,id),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE script_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  script_id uuid NOT NULL,
  version integer NOT NULL CHECK (version>0),
  title_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  hooks jsonb NOT NULL DEFAULT '[]'::jsonb,
  narration text NOT NULL,
  estimated_seconds numeric(10,2),
  source_claim_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  content_sha256 char(64) NOT NULL,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id), UNIQUE(organization_id,script_id,version),
  FOREIGN KEY (organization_id,script_id) REFERENCES scripts(organization_id,id)
);
CREATE TABLE scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  script_version_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal>=0),
  narration_text text NOT NULL,
  duration_ms integer CHECK(duration_ms>0),
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  UNIQUE(organization_id,id), UNIQUE(organization_id,script_version_id,ordinal),
  FOREIGN KEY (organization_id,script_version_id) REFERENCES script_versions(organization_id,id)
);
CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('IMAGE','VIDEO','AUDIO','DOCUMENT','MAP','OTHER')),
  object_key text NOT NULL,
  original_source_url text,
  content_sha256 char(64) NOT NULL,
  size_bytes bigint NOT NULL CHECK(size_bytes>=0),
  mime_type text NOT NULL,
  approval_status text NOT NULL DEFAULT 'PENDING' CHECK(approval_status IN ('PENDING','APPROVED','REJECTED')),
  is_ai_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id), UNIQUE(organization_id,object_key),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE asset_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  asset_id uuid NOT NULL,
  license_name text NOT NULL,
  license_url text,
  attribution_required boolean NOT NULL DEFAULT false,
  attribution_text text,
  commercial_use_allowed boolean NOT NULL DEFAULT false,
  proof_object_key text,
  expires_at timestamptz,
  reviewed_by uuid REFERENCES app_users(id),
  reviewed_at timestamptz,
  UNIQUE(organization_id,id),
  FOREIGN KEY (organization_id,asset_id) REFERENCES assets(organization_id,id)
);
CREATE TABLE voice_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL,
  provider text NOT NULL,
  voice_id text NOT NULL,
  model_id text NOT NULL,
  text_sha256 char(64) NOT NULL,
  settings_sha256 char(64) NOT NULL,
  object_key text NOT NULL,
  chars_billed bigint NOT NULL DEFAULT 0,
  cost_usd numeric(12,5) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id), UNIQUE(organization_id,provider,voice_id,model_id,text_sha256,settings_sha256),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL,
  script_version_id uuid,
  manifest_sha256 char(64) NOT NULL,
  artifact_sha256 char(64),
  output_object_key text,
  duration_ms integer,
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(organization_id,id), UNIQUE(organization_id,project_id,manifest_sha256),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
  FOREIGN KEY (organization_id,script_version_id) REFERENCES script_versions(organization_id,id)
);
CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL,
  render_id uuid,
  target_sha256 char(64) NOT NULL,
  approval_type text NOT NULL CHECK(approval_type IN ('RESEARCH','SCRIPT','RENDER','SOCIAL_COPY')),
  decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),
  decided_by uuid NOT NULL REFERENCES app_users(id),
  note text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
  FOREIGN KEY (organization_id,render_id) REFERENCES renders(organization_id,id)
);
CREATE TABLE social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  platform text NOT NULL CHECK(platform='facebook'),
  page_id text NOT NULL,
  page_name text,
  token_ciphertext bytea,
  token_nonce bytea,
  token_key_version integer,
  scopes text[],
  token_expires_at timestamptz,
  connection_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK(connection_status IN ('UNVERIFIED','ACTIVE','REVOKED','ERROR')),
  UNIQUE(organization_id,id), UNIQUE(organization_id,platform,page_id)
);
CREATE TABLE publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL,
  render_id uuid NOT NULL,
  social_account_id uuid NOT NULL,
  publishing_kind text NOT NULL CHECK(publishing_kind IN ('PAGE_VIDEO','REEL','OTHER_OFFICIAL')),
  social_copy text NOT NULL,
  status text NOT NULL DEFAULT 'PREPARING' CHECK(status IN ('PREPARING','PUBLISHING','PUBLISHED','FAILED','NEEDS_RECONCILIATION','CANCELLED')),
  scheduled_at timestamptz,
  remote_media_id text,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE(organization_id,id), UNIQUE(organization_id,render_id,social_account_id,publishing_kind),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
  FOREIGN KEY (organization_id,render_id) REFERENCES renders(organization_id,id),
  FOREIGN KEY (organization_id,social_account_id) REFERENCES social_accounts(organization_id,id)
);
CREATE TABLE metrics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  publication_id uuid NOT NULL,
  metric_key text NOT NULL,
  metric_value numeric,
  availability text NOT NULL DEFAULT 'AVAILABLE' CHECK(availability IN ('AVAILABLE','NOT_AUTHORIZED','NOT_SUPPORTED','MISSING')),
  source_metric_name text,
  graph_api_version text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id), UNIQUE(organization_id,publication_id,metric_key,captured_at),
  FOREIGN KEY (organization_id,publication_id) REFERENCES publications(organization_id,id)
);
CREATE TABLE provider_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid,
  job_id uuid,
  provider text NOT NULL,
  operation text NOT NULL,
  input_units numeric(20,4) NOT NULL DEFAULT 0,
  output_units numeric(20,4) NOT NULL DEFAULT 0,
  unit_name text,
  estimated_cost_usd numeric(12,5) NOT NULL DEFAULT 0,
  actual_cost_usd numeric(12,5),
  provider_request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid,
  job_type text NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','RETRY_WAIT','SUCCEEDED','DEAD','CANCELLED')),
  attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 20),
  locked_by text,
  lease_expires_at timestamptz,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id), UNIQUE(organization_id,job_type,idempotency_key),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  event_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE(organization_id,id)
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_user_id uuid REFERENCES app_users(id),
  actor_service text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_hash text,
  after_hash text,
  request_id text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id)
);

CREATE INDEX jobs_ready_idx ON jobs (status,scheduled_at) WHERE status IN ('QUEUED','RETRY_WAIT');
CREATE INDEX jobs_lease_idx ON jobs (lease_expires_at) WHERE status='RUNNING';
CREATE INDEX projects_org_status_idx ON projects (organization_id,status,updated_at DESC);
CREATE INDEX story_org_score_idx ON stories (organization_id,viral_score DESC);
CREATE INDEX claims_project_idx ON claims (organization_id,project_id,classification);
CREATE INDEX assets_project_idx ON assets (organization_id,project_id,kind);
CREATE INDEX metrics_pub_idx ON metrics_snapshots (organization_id,publication_id,captured_at DESC);
CREATE INDEX usage_month_idx ON provider_usage (organization_id,created_at);
CREATE INDEX outbox_pending_idx ON outbox_events (created_at) WHERE delivered_at IS NULL;
INSERT INTO schema_migrations(version) VALUES ('001_init') ON CONFLICT DO NOTHING;
