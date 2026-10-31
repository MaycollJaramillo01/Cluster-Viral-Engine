-- Export dossiers and research_plans first. No cascade; approvals and audit history stay.
DROP TABLE dossier_revisions;
DROP FUNCTION protect_dossier_revision();
DROP TABLE research_plans;
ALTER TABLE claims DROP CONSTRAINT claims_author_fk, DROP CONSTRAINT claims_verifier_fk,
  DROP COLUMN subject, DROP COLUMN event_date, DROP COLUMN legal_status, DROP COLUMN risk_categories, DROP COLUMN origin, DROP COLUMN created_by;
ALTER TABLE sources DROP CONSTRAINT sources_excerpt_length, DROP CONSTRAINT sources_url_unique, DROP CONSTRAINT sources_author_fk,
  DROP COLUMN title, DROP COLUMN license_note, DROP COLUMN independence_key, DROP COLUMN created_by;
ALTER TABLE editorial_references DROP CONSTRAINT references_url_unique, DROP CONSTRAINT references_author_fk,
  DROP COLUMN access_mode, DROP COLUMN source_version, DROP COLUMN analysis, DROP COLUMN created_by;
DROP INDEX story_org_status_idx;
ALTER TABLE stories DROP CONSTRAINT stories_category_check, DROP CONSTRAINT stories_risk_check, DROP CONSTRAINT stories_proposal_unique, DROP CONSTRAINT stories_author_fk,
  DROP COLUMN status, DROP COLUMN interest_reason, DROP COLUMN source_availability, DROP COLUMN visual_potential, DROP COLUMN risk_notes,
  DROP COLUMN origin, DROP COLUMN proposal_key, DROP COLUMN created_by;
DELETE FROM schema_migrations WHERE version='007_research';
