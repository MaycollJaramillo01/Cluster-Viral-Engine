import type { NextConfig } from 'next';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
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
    ] }];
  },
};
export default config;
