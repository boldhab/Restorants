# Navigation consistency refresh

Updated the existing application locally, preserving routes, permission filtering, sign-out handlers, restaurant switching and the editor's unsaved-change confirmation.

## Implementation

- `apps/web/src/features/navigation/navigation-bar.tsx`: shared white header with consistent branding, contextual labels, action spacing, active links and a mobile disclosure menu. The menu has a unique controlled ID, expanded state and Escape/focus return; it closes when the route changes. Ordinary links remain ordinary navigation, without a modal focus trap.
- Public marketing pages, restaurant selection, customer checkout and commerce/operational headers use the shared component.
- The root layout supplies the same header to authentication, onboarding, account history, platform controls, staff invitations, table entry and review routes, which previously lacked a full navigation bar. Existing restaurant storefronts retain their own brand palette and use matching control sizing and compact mobile navigation.
- Workspace sidebar navigation has matching icon spacing, semantic current-page indication, a visible restaurant switcher and a collapsible mobile menu. The current restaurant remains visible while the menu is closed.
- Kitchen, POS and other operational sections use a horizontally scrollable navigation strip on smaller screens and wrap cleanly on wide screens. The active section is centered when its container is resized, without scrolling the page. Permission-filtered items and their destinations are unchanged.
- The editor header uses the same spacing, typography and return-link treatment; its existing leave-with-unsaved-changes confirmation is retained.
- Styles live in `apps/web/src/app/globals.css` and reference the existing Ember semantic tokens. No new UI library, API change or dependency was added.

## Evidence

- Production frontend build: passed. Frontend ESLint and workspace type checks: passed. `git diff --check`: passed.
- All six browser journeys passed across the main regression run and the targeted mobile-logout rerun. The onboarding journey now opens the mobile workspace menu before signing out, matching the new disclosure layout.
- The final visual journey passed after the desktop navigation adjustment: **64 screen/viewport combinations**, **2,902 rendered-text contrast samples**, no horizontal page overflow, plus expanded-menu contrast, Escape/focus return and restaurant theme isolation checks.
- **77 screenshots** saved, including open mobile navigation. Viewport widths: **390, 768, 1280 and 1440px**. Representative mobile and desktop captures were visually reviewed.
- Final command: `E2E_PRODUCTION=true THEME_ARTIFACT_DIR=artifacts/ember-theme/navigation-refresh npm run test:e2e -- tests/e2e/theme.spec.ts`.

Navigation captures are kept separately in `artifacts/ember-theme/navigation-refresh/`, including opened mobile menus. The prior public refresh captures remain available for comparison.

| Page | Desktop | Open mobile navigation |
| --- | --- | --- |
| Homepage | [1440px](../artifacts/ember-theme/navigation-refresh/platform-home-1440.png) | [390px](../artifacts/ember-theme/navigation-refresh/navigation-platform-home-390.png) |
| Authentication | [1440px](../artifacts/ember-theme/navigation-refresh/login-1440.png) | [390px](../artifacts/ember-theme/navigation-refresh/navigation-login-390.png) |
| Workspace | [1440px](../artifacts/ember-theme/navigation-refresh/dashboard-1440.png) | [390px](../artifacts/ember-theme/navigation-refresh/navigation-dashboard-390.png) |
| Customer checkout | [1440px](../artifacts/ember-theme/navigation-refresh/checkout-1440.png) | [390px](../artifacts/ember-theme/navigation-refresh/navigation-checkout-390.png) |
| Kitchen | [1440px](../artifacts/ember-theme/navigation-refresh/kitchen-1440.png) | [390px](../artifacts/ember-theme/navigation-refresh/navigation-kitchen-390.png) |

The browser test extends `tests/e2e/theme.spec.ts` to check expanded-menu contrast, opening, Escape/focus return and workspace disclosure behavior alongside the existing four-width screen captures. Screenshots are local ignored artifacts. Checks are targeted Chromium evidence, not a formal WCAG or real-device certification.
