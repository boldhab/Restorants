import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { RestaurantSite, type SiteData } from '../../../../features/website/restaurant-site';
export const dynamic = 'force-dynamic';
type Params = { slug: string; page?: string[] };
async function site(slug: string): Promise<SiteData> {
  const r = await fetch(
    `${process.env.API_PROXY_URL || 'http://127.0.0.1:4000'}/api/v1/public/restaurants/${encodeURIComponent(slug)}`,
    { cache: 'no-store' }
  );
  if (r.status === 404) notFound();
  if (!r.ok) throw new Error('Restaurant website temporarily unavailable');
  return r.json();
}
function pageName(params: Params, data: SiteData) {
  const page = params.page?.[0] || 'home';
  if (
    (params.page?.length || 0) > 1 ||
    !['home', 'menu', 'about', 'gallery', 'contact'].includes(page)
  )
    notFound();
  if (
    ['about', 'gallery', 'contact'].includes(page) &&
    (!data.draft.theme.sections.some((s) => s.name === page && s.visible) ||
      (page === 'about' && !data.draft.theme.story) ||
      (page === 'gallery' && !data.draft.theme.gallery.length))
  )
    notFound();
  return page;
}
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params,
    d = await site(p.slug),
    page = pageName(p, d);
  const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:3000';
  const url = `${origin}/r/${p.slug}${page === 'home' ? '' : `/${page}`}`;
  const title = `${page === 'home' ? d.draft.theme.title : page.charAt(0).toUpperCase() + page.slice(1)} · ${d.draft.settings.name}`;
  const image = d.draft.theme.socialImage || d.draft.settings.cover;
  return {
    title,
    description: d.draft.theme.description || d.draft.settings.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      url,
      images: image ? [`${origin}/api/v1/public/restaurants/${p.slug}/media/${image}`] : [],
    },
  };
}
export default async function Page({ params }: { params: Promise<Params> }) {
  const p = await params,
    d = await site(p.slug),
    page = pageName(p, d);
  const json = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: d.draft.settings.name,
    description: d.draft.settings.description,
    telephone: d.draft.settings.phone,
    address: d.draft.settings.address,
    servesCuisine: d.draft.settings.category,
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, '\\u003c') }}
      />
      <RestaurantSite data={d} slug={p.slug} page={page} />
    </>
  );
}
