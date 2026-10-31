import type { NextConfig } from 'next';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const dev = process.env.NODE_ENV === 'development';
// ponytail: 'unsafe-inline' porque Next añade scripts de arranque en línea. Pasar a nonce con proxy.ts cuando las páginas muestren contenido de terceros, y añadir el host de Blob a media-src con el player.
const contentSecurityPolicy = ["default-src 'self'", `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", `connect-src 'self'${dev ? ' ws:' : ''}`, "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
const config: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
  transpilePackages: ['@cluster/contracts'],
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: contentSecurityPolicy },
    ] }];
  },
};
export default config;
