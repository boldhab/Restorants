import type { MetadataRoute } from 'next';
export const dynamic = 'force-dynamic';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/r/',
      disallow: ['/workspace/', '/onboarding', '/api/', '/restaurants', '/login', '/register'],
    },
    sitemap: `${process.env.PUBLIC_ORIGIN || 'http://localhost:3000'}/sitemap.xml`,
  };
}
