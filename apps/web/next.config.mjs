import { fileURLToPath } from 'node:url';
/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_PROXY_URL || 'http://127.0.0.1:4000';
if (!['http:', 'https:'].includes(new URL(apiUrl).protocol))
  throw new Error('API_PROXY_URL must use HTTP or HTTPS');
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  experimental: { cpus: 2 },
  reactStrictMode: true,
  transpilePackages: ['@zayqora/contracts'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
