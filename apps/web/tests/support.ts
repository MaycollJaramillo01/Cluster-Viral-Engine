import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import type { Role, VerifiedIdentity } from '@cluster/contracts';
import { TenantDatabase } from '../src/server/database';
import { provisionRoles, seedDevelopmentIdentity } from '../src/server/development';
import { migrate } from '../src/server/migrations';

export const serverUrl = process.env.PHASE01_TEST_ADMIN_URL;

// Base y roles desechables con nombre único; solo se elimina lo que esta función creó.
export async function createTenantFixture() {
  const tag = `${process.pid}_${randomBytes(3).toString('hex')}`, name = `cve_test_${tag}`;
  const runtimeRole = `cve_runtime_${tag}`, authRole = `cve_auth_${tag}`;
  const server = new Pool({ connectionString: serverUrl, max: 1 });
  await server.query(`CREATE DATABASE "${name}"`);
  const url = new URL(serverUrl!); url.pathname = `/${name}`;
  const admin = new Pool({ connectionString: url.toString(), max: 4 });
  await migrate(admin, path.resolve('../../db/migrations'));
  const secret = randomBytes(24).toString('hex');
  await provisionRoles(admin, runtimeRole, authRole, secret, secret);
  const runtimeUrl = new URL(url); runtimeUrl.username = runtimeRole; runtimeUrl.password = secret;
  const runtime = new Pool({ connectionString: runtimeUrl.toString(), max: 12 });
  const orgA = randomUUID(), orgB = randomUUID(), password = randomBytes(18).toString('base64url');
  await admin.query(`INSERT INTO organizations(id,slug,name) VALUES($1,$2,'A'),($3,$4,'B')`, [orgA, `org-a-${tag.replace('_', '-')}`, orgB, `org-b-${tag.replace('_', '-')}`]);
  const member = async (organizationId: string, role: Role, label: string) => {
    const seeded = await seedDevelopmentIdentity(admin, { email: `${label}@example.test`, password, organizationId, role });
    const identity: VerifiedIdentity = { subject: seeded.subject, expiresAt: new Date(Date.now() + 600000), twoFactorEnabled: false };
    return { identity, actorId: seeded.actorId };
  };
  return {
    admin, runtime, db: new TenantDatabase(runtime), orgA, orgB, member,
    async close() {
      await runtime.end(); await admin.end();
      await server.query(`DROP DATABASE IF EXISTS "${name}"`);
      for (const role of [runtimeRole, authRole]) await server.query(`DROP ROLE IF EXISTS "${role}"`);
      await server.end();
    },
  };
}
