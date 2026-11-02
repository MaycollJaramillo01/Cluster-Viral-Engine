-- Export script_versions first: dropping these columns removes the structured content.
DROP TRIGGER script_version_immutable ON script_versions;
DROP FUNCTION protect_script_version();
ALTER TABLE scenes DROP CONSTRAINT scenes_key_unique, DROP COLUMN scene_key, DROP COLUMN content_sha256;
DROP INDEX script_one_open_idx;
ALTER TABLE script_versions DROP CONSTRAINT script_versions_author_fk, DROP COLUMN content, DROP COLUMN dossier_sha256, DROP COLUMN status, DROP COLUMN origin;
ALTER TABLE scripts DROP CONSTRAINT scripts_one_per_project;
DELETE FROM schema_migrations WHERE version='008_scripts';
