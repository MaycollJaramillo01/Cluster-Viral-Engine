-- Apply after 001/002 to an isolated branch, psql -v ON_ERROR_STOP=1 -1.
CREATE TABLE phase00_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES app_users(id),
  ticket text NOT NULL CHECK (ticket ~ '^F00-(0[1-9]|1[0-2])$'),
  operation text NOT NULL CHECK (operation IN ('RENDER','TTS','META_DRY_RUN','EVIDENCE')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','BLOCKED_EXTERNAL')),
  output_sha256 text CHECK (output_sha256 ~ '^[0-9a-f]{64}$'),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,project_id,operation,idempotency_key),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
  FOREIGN KEY (organization_id,actor_id) REFERENCES memberships(organization_id,user_id),
  CHECK ((status='RUNNING' AND result IS NULL AND output_sha256 IS NULL AND finished_at IS NULL)
    OR (status<>'RUNNING' AND result IS NOT NULL AND output_sha256 IS NOT NULL AND finished_at IS NOT NULL))
);
ALTER TABLE phase00_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase00_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY phase00_tenant ON phase00_runs FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);

CREATE FUNCTION protect_phase00_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'phase00 runs are append-only'; END IF;
  IF OLD.status <> 'RUNNING' OR NEW.status='RUNNING'
     OR (NEW.id,NEW.organization_id,NEW.project_id,NEW.actor_id,NEW.ticket,NEW.operation,NEW.idempotency_key,NEW.input_sha256,NEW.created_at)
       IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.project_id,OLD.actor_id,OLD.ticket,OLD.operation,OLD.idempotency_key,OLD.input_sha256,OLD.created_at)
  THEN RAISE EXCEPTION 'immutable phase00 run'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER phase00_immutable BEFORE UPDATE OR DELETE ON phase00_runs
  FOR EACH ROW EXECUTE FUNCTION protect_phase00_run();

CREATE FUNCTION protect_audit_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit events are append-only'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION protect_audit_events();
INSERT INTO schema_migrations(version) VALUES ('003_phase00');
