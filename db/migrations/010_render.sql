-- F05: render asíncrono. El manifest no cambia: otro material es otro render. Solo el worker liquida el resultado.
ALTER TABLE renders
  ADD COLUMN manifest jsonb NOT NULL,
  ADD COLUMN job_id uuid NOT NULL,
  ADD COLUMN requested_by uuid NOT NULL,
  ADD COLUMN provider text,
  ADD COLUMN preview_object_key text,
  ADD COLUMN poster_object_key text,
  ADD COLUMN captions_object_key text,
  ADD COLUMN qa jsonb,
  ADD COLUMN metrics jsonb,
  ADD COLUMN error_code text,
  ADD COLUMN cancel_requested_at timestamptz,
  ADD CONSTRAINT renders_job_fk FOREIGN KEY (organization_id,job_id) REFERENCES jobs(organization_id,id),
  ADD CONSTRAINT renders_requester_fk FOREIGN KEY (organization_id,requested_by) REFERENCES memberships(organization_id,user_id),
  ADD CONSTRAINT renders_success_complete CHECK (status<>'SUCCEEDED' OR (artifact_sha256 IS NOT NULL AND output_object_key IS NOT NULL AND preview_object_key IS NOT NULL AND poster_object_key IS NOT NULL AND captions_object_key IS NOT NULL AND qa IS NOT NULL));
CREATE INDEX renders_project_idx ON renders (organization_id,project_id,created_at DESC);
CREATE INDEX jobs_render_dispatch_idx ON jobs (scheduled_at,created_at) WHERE job_type='RENDER' AND status IN ('QUEUED','RETRY_WAIT','RUNNING');

-- Único cruce entre organizaciones: el worker no conoce el tenant hasta reclamar. Devuelve solo identificadores; lo demás lo lee con la organización fijada y RLS.
-- La política permite al dueño de la función ver la cola aunque no tenga BYPASSRLS; el rol de runtime sigue limitado a su organización.
CREATE POLICY jobs_render_dispatch ON jobs FOR ALL TO CURRENT_USER USING (job_type='RENDER') WITH CHECK (job_type='RENDER');
CREATE FUNCTION claim_render_job(worker text, lease_seconds integer)
RETURNS TABLE(job_id uuid, organization_id uuid, project_id uuid, render_id uuid, attempt integer, max_attempts integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE jobs j SET status='RUNNING',attempt=j.attempt+1,locked_by=worker,lease_expires_at=now()+make_interval(secs => lease_seconds),updated_at=now()
  FROM (SELECT id FROM jobs WHERE job_type='RENDER' AND ((status IN ('QUEUED','RETRY_WAIT') AND scheduled_at<=now()) OR (status='RUNNING' AND lease_expires_at<now()))
    ORDER BY scheduled_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1) next
  WHERE j.id=next.id
  RETURNING j.id,j.organization_id,j.project_id,(j.payload->>'render_id')::uuid,j.attempt,j.max_attempts
$$;
REVOKE ALL ON FUNCTION claim_render_job(text,integer) FROM PUBLIC;
