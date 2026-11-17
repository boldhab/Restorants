# Phase 2 implementation and verification

Implementation is in the existing TypeScript/npm/Express/Next.js/PostgreSQL architecture. Phase 1 authentication and tenant security remain in use. The initial Git tree was clean.

| Step | Implementation status |
| --- | --- |
| 1. Model and rules | Migration 003: relational tenant identity, media, publication, availability and price-history records; validated JSON aggregates for structured menu configurations, schedules and theme. Integer currency amounts and versioned saves. |
| 2. Settings/onboarding | Resumable eight-step editor on the existing restaurant, profile, currency/timezone, service modes, weekly/overnight hours and date exceptions. Readiness derives from saved data. |
| 3. Media | Tenant-private validated/re-encoded uploads, progress/retry feedback, attachment checks, protected deletion; local and S3-compatible adapters. Live S3 provider verification is pending. |
| 4. Categories | Create/edit, image, persisted order, keyboard reordering, archive confirmation and restore. |
| 5. Items/configurations | Active/draft/archive states, images, integer prices, preparation time, restaurant-supplied diet/allergen labels, variants, ordered groups/options, selection limits and price history. |
| 6. Availability | Default-branch manual sold out, enable/disable, service modes and timezone schedules; independent of immutable published content. |
| 7. Website editor | One controlled template, three palettes, two typography choices, ordered/visible sections, story/gallery/contact, social image and policy text. |
| 8. Preview/publishing | Verified authorized private saved preview; viewport controls; readiness; version protection; atomic immutable revisions; retries; audit; status/history; unpublish. |
| 9. Public website | Home/menu/about/gallery/contact, optional-page 404s, search/categories, dish dialog, variant/modifier menu pricing and publication-version validation. |
| 10. Quality/SEO/caching | Responsive template and forms, focus styles/native modal behavior/reduced motion, public metadata/JSON-LD/sitemap/robots; dynamic uncached responses and 15-second open-page refresh. |
| 11. API | Atomic draft and focused settings/category/item/theme/availability/media/publication/public APIs with schemas and OpenAPI documentation. |
| 12. Verification/release | See actual execution results below. Staging template updated; deployment is blocked by absent target/environment credentials. |

Important implementation files:

- `packages/contracts/src/phase2.ts`: schemas, readiness, local-time schedules, money and selection validation.
- `apps/api/database/migrations/003_phase2_publication.sql`: database upgrade and immutable-revision/currency protections.
- `apps/api/src/modules/publishing/`: small HTTP handlers, service orchestration, repository SQL, image processing and storage adapters.
- `apps/web/src/features/website/website-editor.tsx`: resumable owner workflow.
- `apps/web/src/features/website/restaurant-site.tsx`: shared preview/public renderer and configurator.
- `apps/web/src/app/r/[slug]/[[...page]]/page.tsx` and `apps/web/src/proxy.ts`: dynamic public pages, SEO and publication access checks before streaming response headers.
- `apps/api/tests/{unit,integration}/phase2.test.ts`, `tests/e2e/phase2.spec.ts`: feature/regression coverage.
- `docs/openapi.json`, `docs/phase-2.md`, environment examples, staging Compose and media cleanup/development-fixture scripts.

## Commands and results

- `npm run lint`: passed ESLint, contracts/API TypeScript and Next route type generation/frontend TypeScript.
- `NODE_ENV=test DATABASE_URL=postgres://…/zayqora_test node --import tsx apps/api/scripts/migrate.ts`: migration 003 applied successfully to the dedicated test database. A second migration run reported “No migrations to run”; the migration is safely tracked. Migration 003 was subsequently applied successfully to the verified localhost `zayqora_dev` database as well. Existing development records were preserved; no production database was accessed.
- `NODE_ENV=test node --import tsx --test --test-concurrency=1 apps/api/tests/unit/*.test.ts apps/api/tests/integration/*.test.ts apps/api/tests/security/*.test.ts`: **46 tests passed**, 8 suites, no skips/failures.
- `npm run build`: passed contracts, API and Next production compilation/type checks/static generation using the explicitly configured webpack builder.
- `npm run test:e2e`: **3 browser journeys passed**, including mobile 390px, tablet 768px and desktop 1440px image rendering/overflow checks and the entire publish/edit/republish/sold-out/unpublish lifecycle. Screenshots were inspected; an inherited footer layout was corrected.

The initial `tsx` CLI unit invocation was blocked by sandbox IPC permissions; the Node `--import tsx` loader ran the actual tests successfully. The initial Turbopack build could not bind an internal process socket in this execution environment. The repository now explicitly builds with supported Next.js webpack, also used by its browser-test server.

API tests verify overnight boundaries/exceptions, exact variant/modifier amounts, invalid selections, image content and oversize rejection, cross-tenant attachments/reads/deletion, private preview access and CSRF, unknown/unpublished sites, immutable draft/public separation, concurrent/repeated publishing, stale versions, price history, currency protection, sold out, suspension and unpublishing. Browser tests cover real account verification/login and owner menu creation, image upload, saved setup reload, preview, publish, visitor navigation/configuration, draft price isolation, republish, sold out and unpublish. Fixtures and synthetic image swatches are explicitly test/development data.

## Setup and manual demonstration

See `phase-2.md` for setup and the full owner/visitor demonstration. Core commands:

```bash
npm ci
npm run setup:dev
# Start local PostgreSQL using the existing Compose file if needed.
npm run db:migrate
npm run db:seed            # optional development accounts
npm run db:seed:phase2     # optional separate restaurant demo drafts; never auto-publishes
npm run dev
```

New API variables: `MEDIA_STORAGE`, `MEDIA_LOCAL_ROOT`, `MEDIA_S3_ENDPOINT`, `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION`, `MEDIA_S3_ACCESS_KEY`, `MEDIA_S3_SECRET_KEY`. New web variable: `PUBLIC_ORIGIN`. No secret values are documented. Root `media:cleanup` is a dry run, with explicit `-- --apply` for abandoned local objects older than seven days.

## Staging and remaining limits

No deployment was performed. `apps/api/.env.staging` is absent and deployment workflows are empty; an authorized staging host, HTTPS origin, database, SMTP and deployment credentials remain external dependencies. The staging template includes a persistent private media volume and `PUBLIC_ORIGIN`. Live S3 interoperability, Docker deployment and SMTP delivery were not tested in this task.

This implementation uses one default branch and one template. Structured schedules/configurations are validated aggregates, not separately editable relational resources. Historical revisions/assets are retained indefinitely; remote orphan inventory cleanup and temporary S3 session credentials are not implemented. No shared cache is used. Open pages refresh public state within 15 seconds; already-delivered bytes cannot be revoked. Local `/tmp` storage is ephemeral and requires a persistent production volume or private S3 provider.

Phase 3 can build on publication IDs, exact configuration pricing, tenant sessions and operating schedules. It still needs a separate design/implementation for durable carts/orders, taxes/fees, transactional checkout, payments and reservations; none are presented as functional here.

After final profile column-limit validation, the focused Phase 2 unit and PostgreSQL lifecycle tests were rerun successfully (4 tests).
