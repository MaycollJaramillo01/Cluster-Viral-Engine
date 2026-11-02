-- F03: guiones versionados y escenas. Cada edición crea una versión inmutable; solo cambia su estado.
ALTER TABLE scripts ADD CONSTRAINT scripts_one_per_project UNIQUE (organization_id,project_id);
ALTER TABLE script_versions
  ADD COLUMN content jsonb NOT NULL,
  ADD COLUMN dossier_sha256 char(64) NOT NULL,
  ADD COLUMN status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEW','APPROVED','REJECTED','SUPERSEDED')),
  ADD COLUMN origin text NOT NULL DEFAULT 'HUMAN' CHECK (origin IN ('HUMAN','MODEL','MOCK')),
  ADD CONSTRAINT script_versions_author_fk FOREIGN KEY (organization_id,created_by) REFERENCES memberships(organization_id,user_id);
CREATE UNIQUE INDEX script_one_open_idx ON script_versions (organization_id,script_id) WHERE status IN ('DRAFT','REVIEW','APPROVED');
ALTER TABLE scenes
  ADD COLUMN scene_key text NOT NULL,
  ADD COLUMN content_sha256 char(64) NOT NULL,
  ADD CONSTRAINT scenes_key_unique UNIQUE (organization_id,script_version_id,scene_key);

CREATE FUNCTION protect_script_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.organization_id,NEW.script_id,NEW.version,NEW.content,NEW.content_sha256,NEW.dossier_sha256,NEW.origin,NEW.created_by,NEW.created_at,NEW.narration,NEW.title_options,NEW.hooks,NEW.estimated_seconds,NEW.source_claim_ids)
    IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.script_id,OLD.version,OLD.content,OLD.content_sha256,OLD.dossier_sha256,OLD.origin,OLD.created_by,OLD.created_at,OLD.narration,OLD.title_options,OLD.hooks,OLD.estimated_seconds,OLD.source_claim_ids)
    OR NOT ((OLD.status='DRAFT' AND NEW.status IN ('REVIEW','SUPERSEDED'))
      OR (OLD.status='REVIEW' AND NEW.status IN ('APPROVED','REJECTED','SUPERSEDED'))
      OR (OLD.status='APPROVED' AND NEW.status='SUPERSEDED'))
  THEN RAISE EXCEPTION 'script versions are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER script_version_immutable BEFORE UPDATE ON script_versions FOR EACH ROW EXECUTE FUNCTION protect_script_version();
