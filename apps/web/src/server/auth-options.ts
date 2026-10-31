import type { BetterAuthOptions } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';
import type { Pool } from 'pg';
import type { RuntimeConfig } from './config';

export function authOptions(config: RuntimeConfig, database: Pool) {
  return {
    appName: 'Cluster Viral Engine',
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database,
    trustedOrigins: [new URL(config.BETTER_AUTH_URL).origin],
    emailAndPassword: { enabled: true, disableSignUp: true, requireEmailVerification: true, minPasswordLength: 12, maxPasswordLength: 128 },
    user: { modelName: 'auth_users', changeEmail: { enabled: false }, deleteUser: { enabled: false } },
    session: { modelName: 'auth_sessions', expiresIn: 60 * 60 * 8, updateAge: 60 * 15, freshAge: 60 * 10, cookieCache: { enabled: false } },
    account: { modelName: 'auth_accounts', accountLinking: { enabled: false } },
    verification: { modelName: 'auth_verifications' },
    plugins: [twoFactor({ issuer: 'Cluster Viral Engine', schema: { twoFactor: { modelName: 'auth_two_factors' } } })],
    rateLimit: { enabled: true, storage: 'database', modelName: 'auth_rate_limits', window: 60, max: 120,
      customRules: { '/sign-in/email': { window: 60, max: 10 }, '/two-factor/*': { window: 60, max: 10 } } },
    advanced: {
      cookiePrefix: 'cve',
      useSecureCookies: config.APP_ENV !== 'local',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      disableCSRFCheck: false, disableOriginCheck: false, trustedProxyHeaders: false,
      ipAddress: { ipAddressHeaders: ['x-cve-client-ip'] },
    },
    logger: { disabled: true }, // Framework exceptions can contain DB URLs. HTTP wrapper emits only safe codes.
    onAPIError: { throw: true }, // Propagate to requestHandler; Better Call's default fallback prints raw SQL errors.
  } satisfies BetterAuthOptions;
}
