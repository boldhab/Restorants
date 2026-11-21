# Public homepage and About refresh

Implemented locally in the existing Next application. No deployment, dependency, backend, authentication or contract changes were made.

## Pages and components

- `/`: photograph-led hero, preserved registration/sign-in destinations, workspace overview, story introduction and full footer.
- `/about`: dedicated ZAYQORA About page with purpose, product context and approach. No invented testimonials, statistics or company history.
- `apps/web/src/features/marketing/site-shell.tsx`: shared accessible header, footer and registration invitation.
- `apps/web/src/features/website/restaurant-site.tsx`: uploaded-cover-first restaurant hero with local fallback; responsive menu with expanded state and Escape/focus return; improved footer; editorial restaurant About layout using saved story and photos. Existing section visibility and publication rules are preserved, including hiding story links when no story is published.
- `apps/web/src/app/globals.css`: responsive styles using the existing Ember tokens. Restaurant theme colors remain independent.
- `apps/web/public/images/restaurant-atmosphere.webp`: optimized local atmospheric image, 1536 × 1024, approximately 189 KiB. Used for the platform pages and as a fallback for missing or failed restaurant cover images. Uploaded covers and gallery images retain priority. Fallback photography is decorative/illustrative rather than presented as an actual customer venue.
- `tests/e2e/theme.spec.ts`: expanded visual/behavior checks for platform homepage/About, restaurant homepage/About, mobile navigation, failed-cover recovery and existing screens. Set `THEME_ARTIFACT_DIR` to keep these captures separate from the previous theme evidence.

## Image provenance

Created with the built-in imagegen tool using the [imagegen skill](/home/hab/.codex/skills/.system/imagegen/SKILL.md); converted to WebP for local delivery. Local website implementation followed the [Sites skill](/home/hab/.codex/plugins/cache/openai-curated-remote/sites/1.1.7/skills/sites/SKILL.md).

Final generation prompt:

> Use case: photorealistic-natural. Create a premium restaurant website hero photograph, wide landscape 1536x1024. An inviting contemporary neighborhood restaurant at golden hour, rich walnut dining tables, subtle terracotta upholstery, elegantly set tables with white ceramic plates and linen, leafy accents, amber pendant lights and large windows. Architectural editorial photography, authentic natural materials, atmospheric but refined. Composition: open darker uncluttered left half for website headline overlay, dining tables and beautiful window light toward right. No people, no text, no logos, no watermark. Image will also crop as an About page image. This is an illustrative generic restaurant atmosphere, not a specific real venue.

## Browser evidence

- Production Next build: passed, including the new static `/about` route.
- Frontend ESLint (`npx eslint apps/web/src tests/e2e/theme.spec.ts`): passed. Workspace type checks: passed.
- Full production browser suite: **6 journeys passed** (authentication, publishing, ordering/refunds and daily operations included). After final footer and early-image-failure corrections, the expanded visual journey was rerun and **passed**.
- Final visual checks: **64 screen/viewport combinations**, **2,945 rendered-text contrast samples**, no page overflow, correctly stacked marketing footer, mobile menu Escape/focus return, three repeated failed-cover loads recovering to the local image, and existing storefront theme isolation. **65 screenshots**, including fallback evidence.
- The initial run reported a `prefer-const` error in the separate `seed-rich-menus.ts` script. That declaration is now corrected; full-repository lint passes in the [dev review](dev-review.md). No real-device or screen-reader audit was performed.

Final visual command: `E2E_PRODUCTION=true THEME_ARTIFACT_DIR=artifacts/ember-theme/public-refresh npm run test:e2e -- tests/e2e/theme.spec.ts`.

Captures are saved under `artifacts/ember-theme/public-refresh/` and excluded from Git. The image scrim preserves text contrast; visible text outside photographic backgrounds is checked against computed backgrounds. This is targeted verification, not a complete assistive-technology audit.

| Page | Desktop | Mobile |
| --- | --- | --- |
| ZAYQORA homepage | [1440px](../artifacts/ember-theme/public-refresh/platform-home-1440.png) | [390px](../artifacts/ember-theme/public-refresh/platform-home-390.png) |
| ZAYQORA About | [1440px](../artifacts/ember-theme/public-refresh/platform-about-1440.png) | [390px](../artifacts/ember-theme/public-refresh/platform-about-390.png) |
| Restaurant homepage | [1440px](../artifacts/ember-theme/public-refresh/home-1440.png) | [390px](../artifacts/ember-theme/public-refresh/home-390.png) |
| Restaurant story | [1440px](../artifacts/ember-theme/public-refresh/about-1440.png) | [390px](../artifacts/ember-theme/public-refresh/about-390.png) |

Responsive captures also cover 768px and 1280px. The restaurant fixture uploads the illustrative image and supplies an explicitly illustrative saved story; actual customer content is not changed.
