// Trusted local/test provisioning only. Never imported by routes or client components.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import type { Pool } from 'pg';
import type { Role } from '@cluster/contracts';

function identifier(name: string) {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(name)) throw new Error('INVALID_DATABASE_ROLE_NAME');
  return `"${name}"`;
}
export async function provisionRoles(admin: Pool, runtimeRole: string, authRole: string, runtimePassword: string, authPassword: string) {
  for (const [name, password] of [[runtimeRole, runtimePassword], [authRole, authPassword]]) {
    identifier(name);
    if ((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name])).rowCount) throw new Error('ROLE_ALREADY_EXISTS');
    const ddl = await admin.query("SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',$1::text,$2::text) AS sql", [name, password]);
    await admin.query(ddl.rows[0].sql);
  }
  await applyGrants(admin, runtimeRole, authRole);
}
// db/runtime-grants.sql es la única lista de permisos; GRANT es idempotente y se reaplica tras migrar en local.
export async function applyGrants(admin: Pool, runtimeRole: string, authRole: string) {
  const sql = await readFile(path.resolve(process.cwd(), '../../db/runtime-grants.sql'), 'utf8');
  await admin.query(sql.replaceAll(':"runtime_role"', identifier(runtimeRole)).replaceAll(':"auth_role"', identifier(authRole)));
}
export async function seedDevelopmentIdentity(admin: Pool, data: { email: string; password: string; organizationId: string; role: Role; actorId?: string }) {
  const subject = randomUUID(), actorId = data.actorId ?? randomUUID(), now = new Date();
  const hash = await hashPassword(data.password);
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    // emailVerified is true only for a synthetic fixture; no email delivery is claimed.
    await client.query(`INSERT INTO auth_users(id,name,email,"emailVerified","createdAt","updatedAt","twoFactorEnabled") VALUES($1,'Cuenta de prueba local',$2,true,$3,$3,false)`, [subject, data.email, now]);
    await client.query(`INSERT INTO auth_accounts(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,'credential',$2,$3,$4,$4)`, [randomUUID(), subject, hash, now]);
    await client.query('INSERT INTO app_users(id,auth_subject,email) VALUES($1,$2,$3)', [actorId, subject, data.email]);
    await client.query('INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,$3)', [data.organizationId, actorId, data.role]);
    await client.query(`INSERT INTO audit_events(organization_id,actor_service,action,entity_type,entity_id,reason)
      VALUES($1,'local-bootstrap','LOCAL_IDENTITY_PROVISIONED','app_user',$2,'Synthetic local/test account, not external email verification')`, [data.organizationId, actorId]);
    await client.query('COMMIT');
    return { subject, actorId };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
