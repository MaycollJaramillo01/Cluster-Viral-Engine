import { z } from 'zod';
import { AppError } from '@cluster/contracts';

const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
const postgres = z.string().min(1).refine(value => {
  try { return ['postgres:', 'postgresql:'].includes(new URL(value).protocol); } catch { return false; }
});
const schema = z.object({
  APP_ENV: z.enum(['local', 'development', 'preview', 'production']),
  DATABASE_URL: postgres,
  AUTH_DATABASE_URL: postgres,
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
});
export type RuntimeConfig = z.infer<typeof schema>;

export function parseConfig(env: Record<string, string | undefined>): RuntimeConfig {
  // Vercel supplies the stable branch alias server-side. Never derive auth origin
  // from request headers or use the production URL for an isolated Preview.
  const branchHost = env.VERCEL_BRANCH_URL;
  const previewOrigin = env.APP_ENV === 'preview' && env.VERCEL === '1' && env.VERCEL_ENV === 'preview'
    && branchHost && /^[a-z0-9-]+\.vercel\.app$/.test(branchHost) ? `https://${branchHost}` : undefined;
  const parsed = schema.safeParse({ ...env, BETTER_AUTH_URL: env.BETTER_AUTH_URL ?? previewOrigin });
  if (!parsed.success) throw new AppError('BLOCKED_EXTERNAL', 503);
  const config = parsed.data;
  const base = new URL(config.BETTER_AUTH_URL);
  if (base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new AppError('INVALID_INPUT', 503);
  const app = new URL(config.DATABASE_URL), auth = new URL(config.AUTH_DATABASE_URL);
  if (!app.username || !auth.username || decodeURIComponent(app.username) === decodeURIComponent(auth.username)) throw new AppError('INVALID_INPUT', 503);
  if (app.hostname !== auth.hostname || decodeURIComponent(app.pathname) !== decodeURIComponent(auth.pathname) || (app.port || '5432') !== (auth.port || '5432')) throw new AppError('INVALID_INPUT', 503);
  if (config.APP_ENV === 'local') {
    if (!loopback.has(base.hostname) || !loopback.has(app.hostname) || !loopback.has(auth.hostname)) throw new AppError('INVALID_INPUT', 503);
  } else {
    if (base.protocol !== 'https:' || loopback.has(base.hostname)) throw new AppError('INVALID_INPUT', 503);
    for (const url of [app, auth]) {
      if (!url.hostname.endsWith('.neon.tech') || url.searchParams.get('sslmode') !== 'verify-full') throw new AppError('INVALID_INPUT', 503);
    }
    if (!app.hostname.includes('-pooler.')) throw new AppError('INVALID_INPUT', 503);
  }
  return config;
}

export function validateMigrationUrl(raw: string, environment: string): string {
  const checked = postgres.safeParse(raw);
  if (!checked.success) throw new AppError('INVALID_INPUT', 503);
  const url = new URL(raw);
  if (url.hostname.includes('-pooler.')) throw new AppError('INVALID_INPUT', 503);
  if (environment === 'local') {
    if (!loopback.has(url.hostname)) throw new AppError('INVALID_INPUT', 503);
  } else if (!url.hostname.endsWith('.neon.tech') || url.searchParams.get('sslmode') !== 'verify-full') throw new AppError('INVALID_INPUT', 503);
  return raw;
}

// Compare metadata only. Never return credentials in readiness / reports.
export function environmentIsolation(urls: Record<string, string>): boolean {
  const keys = Object.values(urls).map(value => { const u = new URL(value); return `${u.hostname.toLowerCase().replace('-pooler.', '.')}:${u.port || '5432'}/${decodeURIComponent(u.pathname)}`; });
  return keys.length >= 2 && new Set(keys).size === keys.length;
}
