-- Export assets, licenses and voice_generations first: dropping these columns removes rights and timing data. Conserva audit_events y provider_usage.
DROP TABLE project_music;
DROP TABLE scene_media;
DROP INDEX provider_usage_month_idx;
ALTER TABLE voice_generations DROP CONSTRAINT voice_author_fk, DROP COLUMN content_sha256, DROP COLUMN mime_type, DROP COLUMN duration_ms, DROP COLUMN alignment, DROP COLUMN timing_source, DROP COLUMN created_by;
ALTER TABLE asset_licenses DROP CONSTRAINT licenses_proof_present, DROP CONSTRAINT licenses_author_fk, DROP COLUMN author, DROP COLUMN allowed_use, DROP COLUMN created_by, DROP COLUMN created_at;
ALTER TABLE assets DROP CONSTRAINT assets_project_unique, DROP CONSTRAINT assets_content_unique, DROP CONSTRAINT assets_ai_labelled, DROP CONSTRAINT assets_author_fk, DROP CONSTRAINT assets_reviewer_fk,
  DROP COLUMN name, DROP COLUMN purpose, DROP COLUMN source_name, DROP COLUMN alt_text, DROP COLUMN width, DROP COLUMN height, DROP COLUMN duration_ms, DROP COLUMN ai_label, DROP COLUMN ai_prompt,
  DROP COLUMN reviewed_by, DROP COLUMN reviewed_at, DROP COLUMN review_note, DROP COLUMN created_by;
DELETE FROM schema_migrations WHERE version='009_media';
