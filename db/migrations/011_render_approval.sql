-- F06: aprobar un render es aprobar sus bytes. La base rechaza un hash que no sea el del render y, mientras exista la aprobación, ese hash no cambia.
ALTER TABLE renders ADD CONSTRAINT renders_artifact_key UNIQUE (organization_id,id,artifact_sha256);
ALTER TABLE approvals
  ADD CONSTRAINT approvals_render_target_fk FOREIGN KEY (organization_id,render_id,target_sha256) REFERENCES renders(organization_id,id,artifact_sha256),
  ADD CONSTRAINT approvals_render_required CHECK ((approval_type='RENDER') = (render_id IS NOT NULL));

-- Un proyecto solo entra en APPROVED con una aprobación de render registrada en esa misma transacción: un UPDATE suelto no puede saltarse la revisión.
CREATE FUNCTION require_render_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approvals WHERE project_id=NEW.id AND approval_type='RENDER' AND decision='APPROVED' AND decided_at>=now())
  THEN RAISE EXCEPTION 'project approval requires a render approval' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_approved_update BEFORE UPDATE OF status ON projects FOR EACH ROW WHEN (NEW.status='APPROVED' AND OLD.status<>'APPROVED') EXECUTE FUNCTION require_render_approval();
CREATE TRIGGER project_approved_insert BEFORE INSERT ON projects FOR EACH ROW WHEN (NEW.status='APPROVED') EXECUTE FUNCTION require_render_approval();
