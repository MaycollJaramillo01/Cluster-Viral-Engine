-- F02: radar editorial, investigación y dossier versionado. Tenant scope por RLS y FK compuestas.
ALTER TABLE stories
  ADD COLUMN status text NOT NULL DEFAULT 'CANDIDATE' CHECK (status IN ('CANDIDATE','SELECTED','REJECTED','ARCHIVED')),
  ADD COLUMN interest_reason text NOT NULL DEFAULT '',
  ADD COLUMN source_availability text NOT NULL DEFAULT '',
  ADD COLUMN visual_potential text NOT NULL DEFAULT '',
  ADD COLUMN risk_notes text NOT NULL DEFAULT '',
  ADD COLUMN origin text NOT NULL DEFAULT 'MANUAL' CHECK (origin IN ('MANUAL','MODEL','MOCK')),
  ADD COLUMN proposal_key text,
  ADD COLUMN created_by uuid,
  ADD CONSTRAINT stories_category_check CHECK (category IS NULL OR category IN
    ('CRIME_HISTORY','ORGANIZED_CRIME','UNSOLVED','MYSTERY','HISTORY','CONTROVERSIAL_FIGURES','MONEY_POWER','SOCIAL')),
  ADD CONSTRAINT stories_risk_check CHECK (editorial_risk IN ('UNKNOWN','LOW','MEDIUM','HIGH')),
  ADD CONSTRAINT stories_proposal_unique UNIQUE (organization_id,proposal_key),
  ADD CONSTRAINT stories_author_fk FOREIGN KEY (organization_id,created_by) REFERENCES memberships(organization_id,user_id);
CREATE INDEX story_org_status_idx ON stories (organization_id,status,viral_score DESC);

ALTER TABLE editorial_references
  ADD COLUMN access_mode text NOT NULL DEFAULT 'MANUAL' CHECK (access_mode IN ('MANUAL','AUTHORIZED_API')),
  ADD COLUMN source_version text NOT NULL DEFAULT 'manual-v1',
  ADD COLUMN analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN created_by uuid,
  ADD CONSTRAINT references_url_unique UNIQUE (organization_id,url),
  ADD CONSTRAINT references_author_fk FOREIGN KEY (organization_id,created_by) REFERENCES memberships(organization_id,user_id);

-- ponytail: el dominio aproxima independencia; subdominios o grupos de medios comunes pasan como independientes.
-- Los claims HIGH siempre requieren verificación humana, que cubre ese techo.
ALTER TABLE sources
  ADD COLUMN title text NOT NULL DEFAULT '',
  ADD COLUMN license_note text NOT NULL DEFAULT '',
  ADD COLUMN independence_key text GENERATED ALWAYS AS (lower(substring(url from '^https?://(?:www\.)?([^/:?#]+)'))) STORED,
  ADD COLUMN created_by uuid,
  ADD CONSTRAINT sources_excerpt_length CHECK (evidence_excerpt IS NULL OR length(evidence_excerpt) <= 600),
  ADD CONSTRAINT sources_url_unique UNIQUE (organization_id,project_id,url),
  ADD CONSTRAINT sources_author_fk FOREIGN KEY (organization_id,created_by) REFERENCES memberships(organization_id,user_id);

ALTER TABLE claims
  ADD COLUMN subject text NOT NULL DEFAULT '',
  ADD COLUMN event_date date,
  ADD COLUMN legal_status text NOT NULL DEFAULT 'NONE' CHECK (legal_status IN ('NONE','INVESTIGATED','ACCUSED','CONVICTED','ACQUITTED','OPEN_PROCEEDING')),
  ADD COLUMN risk_categories text[] NOT NULL DEFAULT ARRAY[]::text[]
    CHECK (risk_categories <@ ARRAY['CRIME','VICTIM','MINOR','UNSTABLE_SOURCE','RECONSTRUCTION','LIVING_PERSON']::text[]),
  ADD COLUMN origin text NOT NULL DEFAULT 'HUMAN' CHECK (origin IN ('HUMAN','MODEL','MOCK')),
  ADD COLUMN created_by uuid,
  ADD CONSTRAINT claims_author_fk FOREIGN KEY (organization_id,created_by) REFERENCES memberships(organization_id,user_id),
  ADD CONSTRAINT claims_verifier_fk FOREIGN KEY (organization_id,verified_by) REFERENCES memberships(organization_id,user_id);

CREATE TABLE research_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision>0),
  plan jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id), UNIQUE (organization_id,project_id,revision),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
  FOREIGN KEY (organization_id,created_by) REFERENCES memberships(organization_id,user_id)
);
CREATE TABLE dossier_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision>0),
  content jsonb NOT NULL,
  content_sha256 char(64) NOT NULL,
  status text NOT NULL DEFAULT 'REVIEW' CHECK (status IN ('REVIEW','APPROVED','REJECTED','SUPERSEDED')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id), UNIQUE (organization_id,project_id,revision),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
  FOREIGN KEY (organization_id,created_by) REFERENCES memberships(organization_id,user_id)
);
CREATE UNIQUE INDEX dossier_one_open_idx ON dossier_revisions (organization_id,project_id) WHERE status IN ('REVIEW','APPROVED');
CREATE FUNCTION protect_dossier_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.organization_id,NEW.project_id,NEW.revision,NEW.content,NEW.content_sha256,NEW.created_by,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.project_id,OLD.revision,OLD.content,OLD.content_sha256,OLD.created_by,OLD.created_at)
    OR NOT ((OLD.status='REVIEW' AND NEW.status IN ('APPROVED','REJECTED','SUPERSEDED')) OR (OLD.status='APPROVED' AND NEW.status='SUPERSEDED'))
  THEN RAISE EXCEPTION 'dossier revisions are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dossier_immutable BEFORE UPDATE ON dossier_revisions FOR EACH ROW EXECUTE FUNCTION protect_dossier_revision();

ALTER TABLE research_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_research_plans ON research_plans FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
ALTER TABLE dossier_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossier_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_dossier_revisions ON dossier_revisions FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
