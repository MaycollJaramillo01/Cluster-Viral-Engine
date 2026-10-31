import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { AppError, type VerifiedIdentity } from '@cluster/contracts';
import { parseConfig } from './config';
import { authOptions } from './auth-options';

export function createIdentityService(pool: Pool, config: ReturnType<typeof parseConfig>) {
  return betterAuth(authOptions(config, pool));
}
type Service = ReturnType<typeof createIdentityService>;
const state = globalThis as typeof globalThis & { cveAuth?: { pool: Pool; service: Service } };
export function getAuth(): Service {
  if (state.cveAuth) return state.cveAuth.service;
  const config = parseConfig(process.env);
  const pool = new Pool({ connectionString: config.AUTH_DATABASE_URL, max: 4, connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000, options: '-c statement_timeout=5000 -c lock_timeout=2000' });
  pool.on('error', () => { /* Fail requests through the redacted HTTP boundary. */ });
  const service = createIdentityService(pool, config);
  state.cveAuth = { pool, service };
  return service;
}
export async function assertIdentityRole() {
  getAuth();
  const result = await state.cveAuth!.pool.query(`SELECT rolsuper,rolbypassrls,
    pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='auth_users'::regclass),'MEMBER') AS owns
    FROM pg_roles WHERE rolname=current_user`);
  if (!result.rowCount || result.rows[0].rolsuper || result.rows[0].rolbypassrls || result.rows[0].owns) throw new AppError('SERVICE_UNAVAILABLE', 503);
}
export async function requireIdentity(headers: Headers, auth?: Pick<Service, 'api'>): Promise<VerifiedIdentity> {
  if (!headers.get('cookie')) throw new AppError('UNAUTHENTICATED', 401);
  if (!auth) await assertIdentityRole();
  const session = await (auth ?? getAuth()).api.getSession({ headers });
  if (!session || !session.user.emailVerified || new Date(session.session.expiresAt).getTime() <= Date.now()) throw new AppError('UNAUTHENTICATED', 401);
  return { subject: session.user.id, expiresAt: new Date(session.session.expiresAt), twoFactorEnabled: session.user.twoFactorEnabled === true };
}
