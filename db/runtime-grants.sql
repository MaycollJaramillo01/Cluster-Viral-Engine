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
GRANT SELECT,INSERT,UPDATE,DELETE ON auth_users,auth_sessions,auth_accounts,auth_verifications,auth_two_factors,auth_rate_limits TO :"auth_role";
GRANT INSERT ON auth_events TO :"auth_role";
