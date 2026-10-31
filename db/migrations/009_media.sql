-- F04: biblioteca privada, licencias, narración por escena y presupuesto. El contenido de un asset no cambia; solo su revisión.
ALTER TABLE assets
  ADD COLUMN name text NOT NULL,
  ADD COLUMN purpose text NOT NULL CHECK (purpose IN ('VISUAL','MUSIC','SFX','PROOF')),
  ADD COLUMN source_name text NOT NULL,
  ADD COLUMN alt_text text,
  ADD COLUMN width integer CHECK (width>0),
  ADD COLUMN height integer CHECK (height>0),
  ADD COLUMN duration_ms integer CHECK (duration_ms>0),
  ADD COLUMN ai_label text,
  ADD COLUMN ai_prompt text,
  ADD COLUMN reviewed_by uuid,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN review_note text,
  ADD COLUMN created_by uuid NOT NULL,
  ADD CONSTRAINT assets_project_unique UNIQUE (organization_id,project_id,id),
  ADD CONSTRAINT assets_content_unique UNIQUE (organization_id,project_id,content_sha256),
  ADD CONSTRAINT assets_ai_labelled CHECK (NOT is_ai_generated OR (ai_label IS NOT NULL AND ai_prompt IS NOT NULL)),
  ADD CONSTRAINT assets_author_fk FOREIGN KEY (organization_id,created_by) REFERENCES memberships(organization_id,user_id),
  ADD CONSTRAINT assets_reviewer_fk FOREIGN KEY (organization_id,reviewed_by) REFERENCES memberships(organization_id,user_id);

ALTER TABLE asset_licenses
  ADD COLUMN author text NOT NULL,
  ADD COLUMN allowed_use text NOT NULL,
  ADD COLUMN created_by uuid NOT NULL,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT licenses_proof_present CHECK (license_url IS NOT NULL OR proof_object_key IS NOT NULL),
  ADD CONSTRAINT licenses_author_fk FOREIGN KEY (organization_id,created_by) REFERENCES memberships(organization_id,user_id);

ALTER TABLE voice_generations
  ADD COLUMN content_sha256 char(64) NOT NULL,
  ADD COLUMN mime_type text NOT NULL,
  ADD COLUMN duration_ms integer NOT NULL CHECK (duration_ms>0),
  ADD COLUMN alignment jsonb NOT NULL,
  ADD COLUMN timing_source text NOT NULL CHECK (timing_source IN ('PROVIDER','SYNTHETIC')),
  ADD COLUMN created_by uuid NOT NULL,
  ADD CONSTRAINT voice_author_fk FOREIGN KEY (organization_id,created_by) REFERENCES memberships(organization_id,user_id);

-- La clave de escena sobrevive entre versiones del guion; text_sha256 detecta una voz obsoleta sin volver a llamar al proveedor.
CREATE TABLE scene_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL,
  scene_key text NOT NULL,
  visual_asset_id uuid,
  voice_generation_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,project_id,scene_key),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
  FOREIGN KEY (organization_id,project_id,visual_asset_id) REFERENCES assets(organization_id,project_id,id),
  FOREIGN KEY (organization_id,voice_generation_id) REFERENCES voice_generations(organization_id,id)
);
CREATE TABLE project_music (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  PRIMARY KEY (organization_id,project_id),
  FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
  FOREIGN KEY (organization_id,project_id,asset_id) REFERENCES assets(organization_id,project_id,id)
);
CREATE INDEX provider_usage_month_idx ON provider_usage (organization_id,created_at);

ALTER TABLE scene_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE scene_media FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_scene_media ON scene_media FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
ALTER TABLE project_music ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_music FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_project_music ON project_music FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid);
