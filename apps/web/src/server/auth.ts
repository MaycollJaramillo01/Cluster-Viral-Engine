import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import { AppError, apiRateLimit, type VerifiedIdentity } from '@cluster/contracts';
import { parseConfig } from './config';
import { authOptions } from './auth-options';
import { createApplicationPool } from './pool';

export function createIdentityService(pool: Pool, config: ReturnType<typeof parseConfig>) {
  return betterAuth(authOptions(config, pool));
}
type Service = ReturnType<typeof createIdentityService>;
const state = globalThis as typeof globalThis & { cveAuth?: { pool: Pool; service: Service } };
export function getAuth(): Service {
  if (state.cveAuth) return state.cveAuth.service;
  const config = parseConfig(process.env);
  const pool = createApplicationPool(config.AUTH_DATABASE_URL);
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
// Cuenta antes de autorizar, así también pesan las peticiones a organizaciones ajenas. Las claves "api:" no las genera Better Auth,
// y en ellas "lastRequest" guarda el inicio de la ventana. Una sola sentencia: dos peticiones a la vez no leen el mismo contador.
// ponytail: solo por cuenta. Contar por organización exige hacerlo tras autorizar; añadirlo cuando una organización tenga varias cuentas activas.
export async function consumeApiQuota(pool: Pick<Pool, 'query'>, subject: string, now = Date.now()) {
  const result = await pool.query<{ count: number }>(`INSERT INTO auth_rate_limits AS r (id,key,count,"lastRequest") VALUES ($1,$1,1,$2)
    ON CONFLICT (key) DO UPDATE SET count=CASE WHEN r."lastRequest">$2::bigint-$3::bigint THEN r.count+1 ELSE 1 END,
      "lastRequest"=CASE WHEN r."lastRequest">$2::bigint-$3::bigint THEN r."lastRequest" ELSE $2::bigint END
    RETURNING count`, [`api:${subject}`, now, apiRateLimit.windowSeconds * 1000]);
  if (result.rows[0].count > apiRateLimit.max) throw new AppError('RATE_LIMITED', 429);
}
export async function requireIdentity(headers: Headers, auth?: Pick<Service, 'api'>): Promise<VerifiedIdentity> {
  if (!headers.get('cookie')) throw new AppError('UNAUTHENTICATED', 401);
  if (!auth) await assertIdentityRole();
  const session = await (auth ?? getAuth()).api.getSession({ headers });
  if (!session || !session.user.emailVerified || new Date(session.session.expiresAt).getTime() <= Date.now()) throw new AppError('UNAUTHENTICATED', 401);
  if (!auth) await consumeApiQuota(state.cveAuth!.pool, session.user.id);
  return { subject: session.user.id, expiresAt: new Date(session.session.expiresAt), twoFactorEnabled: session.user.twoFactorEnabled === true };
}
