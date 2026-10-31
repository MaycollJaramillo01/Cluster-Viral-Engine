-- psql -v runtime_role=cve_runtime -v auth_role=cve_auth -f db/runtime-grants.sql
-- Provision the two LOGIN roles separately; neither may own tables or inherit a migration role.
GRANT USAGE ON SCHEMA public TO :"runtime_role", :"auth_role";
GRANT SELECT ON app_users,memberships,organizations,projects,phase00_runs TO :"runtime_role";
GRANT INSERT,UPDATE ON phase00_runs TO :"runtime_role";
GRANT INSERT ON audit_events,outbox_events TO :"runtime_role";
-- F02. Sin UPDATE/DELETE en planes, fuentes, evidencia ni aprobaciones: son historia.
GRANT INSERT,UPDATE ON projects TO :"runtime_role";
GRANT SELECT,INSERT,UPDATE ON stories,editorial_references,claims,dossier_revisions,jobs TO :"runtime_role";
GRANT SELECT,INSERT ON sources,claim_evidence,research_plans,approvals TO :"runtime_role";
-- F03. Las escenas de una versión no cambian; el trigger limita script_versions a su estado.
GRANT SELECT,INSERT,UPDATE ON scripts,script_versions TO :"runtime_role";
GRANT SELECT,INSERT ON scenes TO :"runtime_role";
-- F04. Bytes, hash, licencias y coste estimado no se editan: solo se revisa y se liquida el uso.
GRANT SELECT,INSERT ON assets,asset_licenses,voice_generations,provider_usage TO :"runtime_role";
GRANT UPDATE (approval_status,reviewed_by,reviewed_at,review_note) ON assets TO :"runtime_role";
GRANT UPDATE (reviewed_by,reviewed_at) ON asset_licenses TO :"runtime_role";
GRANT UPDATE (actual_cost_usd,output_units,provider_request_id) ON provider_usage TO :"runtime_role";
GRANT SELECT,INSERT,UPDATE ON scene_media TO :"runtime_role";
GRANT SELECT,INSERT,UPDATE,DELETE ON project_music TO :"runtime_role";
GRANT SELECT,INSERT,UPDATE,DELETE ON auth_users,auth_sessions,auth_accounts,auth_verifications,auth_two_factors,auth_rate_limits TO :"auth_role";
GRANT INSERT ON auth_events TO :"auth_role";
