import type { MetadataRoute } from 'next';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const response = await fetch(
    `${process.env.API_PROXY_URL || 'http://127.0.0.1:4000'}/api/v1/public/website-index`,
    { cache: 'no-store' }
  );
  if (!response.ok) throw new Error('Sitemap unavailable');
  const pages: { slug: string; pages: string[] }[] = await response.json();
  return pages.flatMap((r) =>
    r.pages.map((page) => ({
      url: `${process.env.PUBLIC_ORIGIN || 'http://localhost:3000'}/r/${r.slug}${page ? `/${page}` : ''}`,
    }))
  );
}
