# Ember theme implementation and verification

The platform light theme now uses pure white page and card surfaces, charcoal text and restrained Ember accents. Existing restaurant storefront color choices remain independent. This change preserves the pre-existing Phase 4 working tree; no API source, migrations, shared contracts or dependency manifests were changed by the theme work (87 protected files compared with their task-start hashes).

## Design system and changed components

- `apps/web/src/styles/tokens.css`: centralized brand, surfaces, text, borders, status colors, customer palettes, focus, typography, radii and spacing. Dark Ember `#A84724` supplies accessible action text/backgrounds; `#C65D35` supplies decorative branding. Control borders use `#85817E` for contrast; decorative dividers retain `#E5E7EB`.
- `apps/web/tailwind.config.cjs`: existing Tailwind 3 configuration references the CSS tokens. No new UI dependency was introduced.
- `apps/web/src/app/globals.css`: shared buttons, fields, cards, dialogs, navigation, tables, status messages, responsive layout and reduced-motion/forced-color support. Legacy platform Forest/Ivory aliases were removed. No hardcoded hex colors remain outside the token file in frontend source.
- `features/workspace`, `features/auth`, `features/restaurants`: white authentication/onboarding/dashboard/settings surfaces, consistent navigation icons, current-page indicators and semantic success feedback.
- `features/website`: editor step completion indicators, accessible active steps, warning/success/error feedback and tokenized public storefront styles. Forest, Navy and Terracotta choices retain their own accents and editorial typography on white surfaces.
- `features/commerce`: primary/destructive action hierarchy and semantic feedback on customer checkout and staff/platform management screens.
- `features/operations` and the staff invitation page: shared action variants, distinct kitchen states, allergen warnings, table occupancy, low-stock indicators and POS selection/cart styling. Existing handlers, requests, payments and recovery workflows are retained.
- `scripts/check-ember-theme.mjs` and `tests/e2e/theme.spec.ts`: palette checks and a guarded test-database browser journey. Screenshot output is excluded from Git through `.gitignore`.

The audit found no supported dark operational mode or existing chart-rendering component. Chart palette tokens are available without adding synthetic charts. The public hero retains its existing image overlay, strengthened for readable white text over bright images.

## Verification

- `npm run lint`: passed (ESLint and shared/API/web type checks).
- Production frontend build with `NEXT_DIST_DIR=.next-e2e-production`: passed.
- `npm run test:api`: **78 tests passed**, zero failures.
- Existing production browser journeys: **5 passed**, covering registration/login/logout, password reset, restaurant setup/switching, editor save/preview/publishing, guest checkout/tracking, staff completion/refunds, reservations/customer history, staff access, kitchen, QR visits, POS/cash, inventory, coupons, reviews and delivery.
- `E2E_PRODUCTION=true npm run test:e2e -- tests/e2e/theme.spec.ts`: **passed** across 12 screens × 4 widths, with no horizontal page overflow, pure-white body surfaces and **2,083 rendered-text samples** passing contrast checks. It also verifies all three customer themes, populated POS selection/cart, password-field Tab focus/ring, native dish-dialog Escape/focus return and reduced-motion preference. Captures: **48 before + 48 after** PNGs. Detailed measurements: [measurements.json](../artifacts/ember-theme/after/measurements.json).
- `node scripts/check-ember-theme.mjs`: **19 contrast pairs passed**. Dark Ember/white: **5.847:1**; focus/white: **5.847:1**; control border/white: **3.861:1**. Results: [contrast.json](../artifacts/ember-theme/contrast.json).

Text checks use [WCAG text contrast thresholds](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) (4.5:1 normal, 3:1 large); controls use the [non-text contrast threshold](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) of 3:1. Decorative brand marks and disabled controls are excluded from rendered text checks. Image-overlay text is handled by the conservative hero scrim rather than inferred from a solid background sample.

The checks caught and resolved a white-on-white dashboard link and a transient low-contrast POS button enable animation. Button backgrounds now switch immediately while border transitions remain subtle. Representative desktop, tablet and mobile screenshots were visually inspected after the corrections.

## Screenshot evidence

The baseline was captured from the existing production build before rebuilding with the theme. Both sets cover login, onboarding, dashboard, editor, public menu, checkout, kitchen, POS, tables, inventory, reports and settings at **390, 768, 1280 and 1440px**, with 900px viewport height and full-page captures.

Each run creates an isolated fixture, so identifiers and timestamps differ. The final POS capture additionally waits for menu loading and adds a product to demonstrate selected-product and populated-cart styling; the original POS baseline shows its initial empty state.

| Screen | Before | After |
| --- | --- | --- |
| Login, desktop | [Before](../artifacts/ember-theme/before/login-1440.png) | [After](../artifacts/ember-theme/after/login-1440.png) |
| Dashboard, desktop | [Before](../artifacts/ember-theme/before/dashboard-1440.png) | [After](../artifacts/ember-theme/after/dashboard-1440.png) |
| Editor, tablet | [Before](../artifacts/ember-theme/before/editor-768.png) | [After](../artifacts/ember-theme/after/editor-768.png) |
| Checkout, mobile | [Before](../artifacts/ember-theme/before/checkout-390.png) | [After](../artifacts/ember-theme/after/checkout-390.png) |
| Kitchen, desktop | [Before](../artifacts/ember-theme/before/kitchen-1440.png) | [After](../artifacts/ember-theme/after/kitchen-1440.png) |
| POS, mobile | [Before](../artifacts/ember-theme/before/pos-390.png) | [After](../artifacts/ember-theme/after/pos-390.png) |

Screenshots are local artifacts, not committed binaries. Recreate the after set with `E2E_PRODUCTION=true npm run test:e2e -- tests/e2e/theme.spec.ts` after building the production browser artifact. Baseline mode requires the old production artifact; running it against the new build does not recreate a historical baseline.

## Verification limits

Automated contrast and keyboard checks are targeted evidence, not a formal WCAG certification. No screen-reader or real-device assistive-technology audit was performed. Production deployment and live payment-provider transactions were outside this visual task; existing payment/idempotency behavior was checked through local regression fixtures.
