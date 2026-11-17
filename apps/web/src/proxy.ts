import { NextResponse, type NextRequest } from 'next/server';
import type { Draft } from '@zayqora/contracts';
// Resolve publication access before the root loading boundary can stream a 200.
// The renderer independently fetches uncached publication data as well.
export async function proxy(request: NextRequest) {
  const [, , slug, page, ...rest] = request.nextUrl.pathname.split('/');
  function unavailable(status: number) {
    return new NextResponse(
      status === 404
        ? 'This restaurant website is unavailable.'
        : 'Restaurant website temporarily unavailable.',
      {
        status,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      }
    );
  }
  if (
    !slug ||
    rest.some(Boolean) ||
    (page && !['menu', 'about', 'gallery', 'contact'].includes(page))
  )
    return unavailable(404);
  try {
    const response = await fetch(
      `${process.env.API_PROXY_URL || 'http://127.0.0.1:4000'}/api/v1/public/restaurants/${encodeURIComponent(decodeURIComponent(slug))}`,
      { cache: 'no-store', signal: AbortSignal.timeout(10000) }
    );
    if (response.status === 404) return unavailable(404);
    if (!response.ok) return unavailable(503);
    const { draft }: { draft: Draft } = await response.json();
    if (
      page &&
      ['about', 'gallery', 'contact'].includes(page) &&
      (!draft.theme.sections.some((s) => s.name === page && s.visible) ||
        (page === 'about' && !draft.theme.story) ||
        (page === 'gallery' && !draft.theme.gallery.length))
    )
      return unavailable(404);
    const next = NextResponse.next();
    next.headers.set('Cache-Control', 'no-store');
    return next;
  } catch {
    return unavailable(503);
  }
}
export const config = { matcher: '/r/:path*' };
