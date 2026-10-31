import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { migrate } from './migrations';
import { provisionRoles, seedDevelopmentIdentity } from './development';
import { parseConfig } from './config';

async function main() {
  const root = path.resolve(process.cwd(), '../..'), envFile = path.join(root, 'apps/web/.env.local');
  try {
    const content = await readFile(envFile, 'utf8');
    const values = Object.fromEntries(content.split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => { const pos = line.indexOf('='); return [line.slice(0,pos), line.slice(pos+1)]; }));
    const config = parseConfig(values);
    if (config.APP_ENV !== 'local') throw new Error('REFUSE_NON_LOCAL_CONFIGURATION');
    console.log(JSON.stringify({ status: 'LOCAL_CONFIGURATION_EXISTS', credentials_file: path.join(root, '.local/dev-access.txt') }));
    return;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const serverUrl = process.env.LOCAL_POSTGRES_ADMIN_URL ?? 'postgresql://postgres@127.0.0.1:55432/postgres';
  const parsed = new URL(serverUrl);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw new Error('LOCAL_POSTGRES_ONLY');
  const server = new Pool({ connectionString: serverUrl, max: 1 });
  const database = 'cve_development';
  try {
    if ((await server.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount) throw new Error('LOCAL_DATABASE_ALREADY_EXISTS_WITHOUT_CONFIGURATION');
    await server.query(`CREATE DATABASE "${database}"`);
  } finally { await server.end(); }
  parsed.pathname = `/${database}`;
  const migrationUrl = parsed.toString(), admin = new Pool({ connectionString: migrationUrl, max: 1 });
  const runtimePassword = randomBytes(32).toString('hex'), authPassword = randomBytes(32).toString('hex');
  const secret = randomBytes(48).toString('hex'), password = randomBytes(18).toString('base64url');
  const suffix = randomBytes(4).toString('hex'), runtimeRole = `cve_local_runtime_${suffix}`, authRole = `cve_local_auth_${suffix}`;
  const organizationId = randomUUID(), email = 'editor@cluster.local.test';
  try {
    const migrations = await migrate(admin, path.join(root, 'db/migrations'));
    await provisionRoles(admin, runtimeRole, authRole, runtimePassword, authPassword);
    await admin.query("INSERT INTO organizations(id,slug,name) VALUES($1,'cluster-local','Cluster Media · Local')", [organizationId]);
    await seedDevelopmentIdentity(admin, { email, password, organizationId, role: 'editor' });
    const runtimeUrl = new URL(migrationUrl); runtimeUrl.username = runtimeRole; runtimeUrl.password = runtimePassword;
    const authUrl = new URL(migrationUrl); authUrl.username = authRole; authUrl.password = authPassword;
    const base = 'http://127.0.0.1:3000';
    await mkdir(path.join(root, '.local'), { recursive: true });
    await writeFile(envFile, `APP_ENV=local\nDATABASE_URL=${runtimeUrl}\nAUTH_DATABASE_URL=${authUrl}\nDATABASE_URL_UNPOOLED=${migrationUrl}\nBETTER_AUTH_URL=${base}\nBETTER_AUTH_SECRET=${secret}\n`, { mode: 0o600, flag: 'wx' });
    const credentials = path.join(root, '.local/dev-access.txt');
    await writeFile(credentials, `Acceso de prueba local, no válido en producción\nURL: ${base}/login\nCorreo: ${email}\nContraseña: ${password}\nOrganización: ${organizationId}\nRol: editor\n`, { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ status: 'LOCAL_POSTGRES_READY', organization_id: organizationId, credentials_file: credentials, migrations, neon_verified: false }));
  } finally { await admin.end(); }
}
main().catch(() => { console.error('LOCAL_BOOTSTRAP_FAILED: verify local PostgreSQL, isolated database and configuration; no credentials logged'); process.exitCode = 1; });
