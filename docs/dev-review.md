# Dev branch review and commit series

Reviewed on 2026-11-20. This series organizes the pending Phase 4, demo data and visual work into **50 non-empty topical commits** on `dev`, based on `6f9f00dd9877e51147d6964565f6e0cb800f0813`. The `master` branch is preserved; no commits are pushed by this task.

## Scope

The reviewed working tree contains 108 changed/new files, including this report and three new error-handler regression tests in one test file. It covers:

- Shared operational contracts, seven additive migrations, roles and default-branch access.
- Staff invitations, kitchen work, table/QR visits, POS order context, stock recipes/reservations, cash/delivery, coupons, line refunds, reviews and private exports.
- Existing commerce integration, operational HTTP routes, outbox worker and OpenAPI generation.
- Four development restaurant fixtures, consolidated setup, richer menus and optional illustrative photo ingestion.
- Ember tokens and shared styling, public homepage/About, storefront customization, common navigation and operational sidebars.
- API/browser tests and implementation/verification documentation.

The commit order introduces contracts and dependencies first, then persistence/services/routes, frontend components/screens, and verification evidence. Thin operational route wrappers are grouped together. No empty or duplicate commits are used to reach the requested count.

## Review corrections

1. **Misleading database failures:** the API previously described every PostgreSQL check-constraint failure as a currency change. It now preserves the specific currency explanation only for that case and returns a safe generic integrity-conflict message for other checks. Invalid database input returns a clear validation error without exposing raw SQL values. Three regression tests cover these responses.
2. **Compact operational navigation:** the newer sidebar implementation could overflow its narrow rail with the full wordmark. The rail now keeps the brand mark within its width; icon-only destinations have explicit accessible names, and collapse controls expose their expanded state and controlled navigation ID. Browser checks cover rail sizing, accessible destinations, mobile disclosure and Escape/focus return.
3. **Source hygiene:** reviewed frontend files were formatted and trailing whitespace removed. The previously reported seed-script `prefer-const` issue is already resolved in the working tree; full-repository lint passes.

## Validation

- `npm run lint`: passed, including workspace type checks.
- `npm run build:api`: passed.
- Production frontend build with `NEXT_DIST_DIR=.next-e2e-production`: passed.
- `npm run test:api`: **81 tests passed**, 8 suites, no failures/skips.
- `node --import tsx scripts/update-phase4-openapi.ts`: passed.
- `node scripts/check-ember-theme.mjs`: **19 contrast pairs passed**.
- `git diff --check`: passed before committing.
- `E2E_PRODUCTION=true THEME_ARTIFACT_DIR=artifacts/ember-theme/dev-review npm run test:e2e`: **all 6 browser journeys passed**.
- Final visual rerun: **passed** after waiting for settled sidebar geometry; 64 screen/viewport combinations at 390, 768, 1280 and 1440px, 2,987 rendered-text contrast samples, expanded mobile menus, a verified 68px compact rail and no page overflow.
- **87 screenshots** saved locally, including operational menu and collapsed-rail evidence.

The lockfile adds QR-code support and its transitive dependencies; existing package versions are unchanged. A targeted scan found no private-key, AWS access-key, GitHub-token or OpenAI-token patterns in pending source files. Environment files, build output and local verification screenshots remain ignored.

## Evidence and limits

Latest review screenshots and measurements are under `artifacts/ember-theme/dev-review/`; these remain local ignored artifacts. Earlier [Phase 4](phase-4-verification.md), [Ember](ember-theme-verification.md), [public site](public-site-refresh.md) and [navigation](navigation-refresh.md) reports retain the evidence from their original runs. The latest operational sidebar captures supersede the earlier section-strip layouts.

This review did not run the demo seed commands, download optional external photos, deploy infrastructure, push a remote branch or perform live merchant payments. Existing Phase 4 provider/staging limitations remain documented in the Phase 4 report. Browser checks use local Chromium and are not a real-device or assistive-technology certification.
