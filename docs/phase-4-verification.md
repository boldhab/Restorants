# Phase 4 implementation and verification

Phase 4 extends the existing TypeScript/npm/Express/pg/Next modular monolith. Existing order, quote, payment, refund, reservation, customer identity and outbox records remain authoritative. No parallel POS/QR sale system, live merchant transaction, infrastructure purchase or staging deployment was performed. The initial working tree contained four Phase 3 follow-up corrections; unrelated user work and `infrastructure/docker/init-test.sql` were preserved.

## Step status

| Step | Status | Concrete result |
| --- | --- | --- |
| 1. Rules/invariants | Implemented | `phase-4-rules.md` defined transaction, pricing, stock, cash, visit, access and cancellation rules before workflow implementation. |
| 2. Database | Implemented/applied | Additive migrations 007–013, tenant/branch composite keys, partial unique active-resource indexes, immutable ledgers, durable acceptance/request identities. Applied to dedicated test and verified localhost development databases. |
| 3. Staff | Implemented | Expiring/single-use email invitations, resend/revoke, verified matching identity, branch assignments, explicit permission matrix, revocation and final-owner/scope protection. |
| 4. Kitchen | Implemented | Published item station routing, distinct work units, fallback station, accepted/payment-policy eligibility, immutable preparation snapshots, readiness across all stations, versions, delay/correction, cancelled work, stable board ordering. |
| 5. Tables/visits | Implemented | Areas, seats, active/block/cleaning state, waiter assignment, walk-in/reservation seating, expected departures, peak cover checks, atomic movement/extension, payment/refund-gated closure and retained history. |
| 6. QR | Implemented | Real locally encoded QR references, hash rotation, separate visit activation, existing scoped guest identity plus HttpOnly capability, diner isolation, closure revocation, shared cart/quote/order paths. |
| 7. POS | Implemented | Published menu/category/search, variants/modifiers/quantities, guest or verified existing customer selection, counter/takeaway/dine-in, authoritative quotes/coupons, automatic policy-checked acceptance, original request recovery, receipts/browser print. |
| 8. Cash | Implemented | Registers, one open session/register, float, atomic original-order collections/approved refund disbursements, paid-in/out, expected/counted/variance, closure serialization, immutable closed figures and review. |
| 9. Delivery | Locally implemented; live provider blocked | Zones/described service areas/server fees, prepaid-only orders, assignment-scoped rider contact/access, controlled reassignment, milestones/failure, payment-gated completion and cancellation revocation. No COD/GPS; real prepaid checkout unavailable without a selected provider. |
| 10. Inventory | Implemented | Canonical-unit thousandths/conversions, locations, receipt/adjustment/waste ledger, locked balances/reservations, immutable recipe versions and per-order requirements, shortage-blocked acceptance, consume/release policy, zero-deduction prepared-waste annotation. |
| 11. Coupons | Implemented | Fixed/percentage/free-delivery rules, windows, spend/cap/item/category/mode restrictions, atomic total/personal capacity, pending release/accepted redemption and original line allocations. Personal coupons require the customer's own authenticated online/QR checkout. |
| 12. Customers/reviews | Implemented | Tenant/branch identity-based history/spend/consent, private notes, verified completed-order reviews, single-use guest invitation, one/order, response, abuse report, transparent reasoned moderation and public aggregates. |
| 13. Reports/exports | Implemented | Orders/collections/refunds/drawers/stock/customers/coupons/delivery, separate currencies/source definitions, formula-safe CSV, paginated text PDF, background generation, private bytes/expiry and fresh generation/download authorization. |
| 14. Screens/reconnection | Implemented | Workspace/operational routes, permission-filtered navigation, authoritative five-second polling, stale-response suppression, revoked-data clearing, conflict/validation feedback, optional sound and responsive controls. |
| 15. Tests/builds | Verification below | Real PostgreSQL transaction/concurrency tests, prior-phase regressions, production browser journeys and responsive screenshots. |
| 16. Documentation/staging | Local preparation complete; staging external | OpenAPI generation, rules/relationships/permission matrix/setup/demo/worker/incident procedures and guarded development seed. Existing staging files/credentials are absent; deployment workflow remains empty. |

## Important changes

- `packages/contracts/src/operations.ts`: shared operational inputs, role permissions, coupon/recipe/context schemas and disabled defaults.
- `apps/api/database/migrations/007_phase4_operations.sql`: operational domains and default-branch migration/onboarding.
- `008_phase4_branch_integrity.sql`: cross-branch order/reservation/item association constraints.
- `009_phase4_ledger_guards.sql`: direct-SQL closed-drawer guard, prepared-waste records/ledger metadata.
- `010_phase4_request_recovery.sql`: actor/tenant/branch/payload-scoped operational request results.
- `011_phase4_acceptance_effects.sql`: acceptance replay identity preserving original recipe/routing effects.
- `012_phase4_refund_allocations.sql`: immutable original-price item-refund allocations and quantity claims.
- `013_phase4_workspace_context.sql`: minimal restaurant-context read grants for operational workspace entry, without financial/customer/export access.
- `apps/api/src/modules/operations/`: repository SQL; access, staff, kitchen, inventory, table, pricing/context, cash/delivery, customer/review and export services; thin route registry with schemas/permissions/transactions/idempotency.
- Existing commerce services/routes/guest credentials/reservations/outbox worker and tenant middleware integrate these effects rather than creating duplicate systems. Published pickup ordering can explicitly leave a previous table cart context.
- `apps/web/src/features/operations/`: staff/admin console, kitchen cards, shared POS/QR terminal, visit entry, recipe editor and verified/public reviews.
- `/workspace/[restaurantId]/{staff,tables,delivery,inventory,coupons,customers,reviews}`, `/operations/[restaurantId]/{kitchen,pos,tables,deliveries,cash,...}`, `/table/[restaurantId]`, `/staff-invitation`.
- `apps/api/scripts/seed-phase4.ts`, `scripts/update-phase4-openapi.ts`, `docs/openapi.json`, `phase-4.md`, `phase-4-rules.md`, `phase-4-relationships.md`, README/staging instructions and tests.
- QR encoder dependency uses the documented browser `toDataURL` API from [node-qrcode's official repository](https://github.com/soldair/node-qrcode). No QR reference or activation value is sent to an external image service.

## Executed checks

- Baseline `npm run lint`: passed. Baseline `npm run test:api`: **62 tests, 8 suites, all passed** using approved local execution after the sandbox blocked tsx's IPC socket.
- Full integrated regression `npm run test:api`: **77 tests, 8 suites, all passed**, including fifteen new Phase 4 scenarios, before the final partial-item refund allocation addition. This covers Phase 1 authentication/tenancy, Phase 2 publication/availability and Phase 3 checkout/payment/refund/reservation/outbox/report regressions.
- Follow-up invitation/poll authorization checks passed **2 tests**, including the minimal restaurant-context read grant for operational staff; financial/customer/export restrictions remain enforced.
- Final focused PostgreSQL Phase 4 run: **16 tests passed, zero failures/skips**. It additionally covers personal coupon identity, cancelled delivery access, POS guest privacy, token-only cross-browser reviews, zero-balance settlement and exact concurrent partial-item refund allocation after coupon edits.
- `npm run build`: passed shared contracts, API/worker compilation and Next production build. Final API compilation and browser production artifact builds also passed, including the private review route and refund controls. Sandboxed Next initially could not run its TypeScript child process; approved local execution passed.
- `npm run lint` passed ESLint and shared/API/Next TypeScript after the integrated changes, including scripts, refund allocation and new routes.
- Migrations 007–013 applied successfully to `zayqora_test` and the verified `development` / `localhost` / `zayqora_dev` target. No volume resets or schema drops.
- Optional development seed executed successfully on a disposable browser fixture in `zayqora_test` with `NODE_ENV=development`; it created the demo table/register/stations/recipe/opening stock/DEMO10 and no accounts/fixed credentials/reviews. Existing development restaurants were not seeded/enabled.
- Final production browser run: `E2E_PRODUCTION=true npm run test:e2e` — **all 5 journeys passed**. The Phase 4 journey covered invitation/access, online multi-station preparation, walk-in/QR ordering, POS/coupon settlement, original-price partial refund and cash disbursement, visit closure, inventory cancellation, guest review, prepaid test delivery and staff revocation. Screenshots at 390/768/1440 pixels were inspected and overflow checks passed. Earlier runs caught exact-label ambiguity, kitchen sort instability and an unscoped test alert locator; these were corrected.
- `npm run docs:phase4` generated the operational API paths, schemas and permission/idempotency rules. Security-scheme references were checked and no unresolved references remained. `git diff --check` passed.
- Dependency audit reported three moderate advisories in the existing `node-pg-migrate`→glob/minimatch toolchain; the QR encoder was not the advisory source. No forced major migration-tool downgrade/update was applied. Migration filenames/glob inputs are repository-controlled; review the dependency chain before a hosted release.

## Critical-case mapping

| Requested case | Evidence |
| --- | --- |
| 1. Invitation expiry/reuse/wrong account | Real-DB invitation test rejects wrong verified email, expired/reused token; accepted role/branch persists. |
| 2. Privilege/cross-branch escalation | Management-scope/final-owner checks; foreign branch/tenant authorization rejects; composite association constraints. |
| 3. Revoked API/realtime | Repeated actual HTTP kitchen polling denies after membership/branch revocation and allows fresh authorized reconnect; browser clears cards after revocation. |
| 4–6. Duplicate kitchen/multi-station/cancellation | Same order acceptance replay creates no duplicate work; one completed station cannot advance readiness; cancellation retains CANCELLED work. Acceptance replay after recipe edits retains original stock requirements. |
| 7–8. Table races/reservation capacity | Competing opens yield one visit; movement leaves one occupancy; reservation allocation transfers once and aggregate commitment sweep includes visits. |
| 9–10. Old QR/cross-diner access | Printed reference alone fails activation, rotated reference fails, closed visit fails ordering, a separately activated diner in the same visit cannot read the first diner's order. |
| 11. Duplicate POS/settlement | Existing checkout operation identity yields one order; cash operation/payment uniqueness yields one collection. Actual browser POS uses the shared published pricing/acceptance/kitchen flow. |
| 12–13. Cash close race/immutability | Collection competes with close under database locks; expected balance equals committed ledger and variance reconciles; closed movements/figures reject mutation. |
| 14. Rider reassignment | Old rider action/list access disappears on reassignment; only ready prepaid handover; cancellation revokes active assignment. |
| 15–17. Stock replay/race/recipe edits | Two competing accepted orders cannot reserve the same last stock; consumption runs once; changed recipes do not reprice historical requirements; consumed cancellation does not restore. Prepared waste records once with zero extra deduction. |
| 18–19. Coupon races/expiry/refunds | Competing last-use quotes produce one committed order; expired rules reject; original discount/tax allocations survive edits; two concurrent unit claims refund 1267 and 1268 minor units (2535 total), preserving the original 25-unit service fee and rejecting a third claim. Personal identity/pending cancellation tested separately. |
| 20. Export privacy | Chef cannot generate/download; revoked requester fails worker authorization; expired private bytes are cleared; CSV formula text is escaped; PDF signature validated. |
| 21. Review ownership/uniqueness | Foreign account denied; completed owner accepted once; negative score remains in public aggregate; hiding without abuse policy reason rejects. |
| 22. Missed events/reconnection | Full-state polling with current authorization, versions and stale-response suppression; actual reconnect/revocation browser coverage. |
| 23. Existing checkout/reservations | Full regression suite and four prior production browser journeys pass. |

## Commands and manual demonstration

```sh
npm ci
npm run db:migrate
npm run dev
npm run worker
# Optional guarded local demo, existing eligible restaurant:
SEED_RESTAURANT_ID=... SEED_OWNER_ID=... npm run db:seed:phase4
# Checks:
npm run lint
npm run test:api
npm run test:e2e:production
npm run docs:phase4
npm run worker:once
```

No new required runtime secrets/environment variables. Existing database, cookies/session/origin, SMTP/media and worker-heartbeat settings remain. The optional seed uses two non-secret UUID variables above. No merchant credentials were invented or added.

Manual sequence: configure/enable operational features → invite/accept/assign a chef to two stations → online order acceptance and both station completions → open drawer/collect original order → seat walk-in or reservation → rotate/scan QR and activate the visit → add immutable table order → settle/complete/close/clean → POS coupon order/receipt → stock reserve/consume/cancel/waste → controlled prepaid rider journey → verified review/customer note → cash count/variance and private export → revoke staff and retry poll/download. Detailed procedures and accounting definitions are in `phase-4.md`.

## Staging, limitations and Phase 5

The worker one-shot check passed against the dedicated test database and refreshed its heartbeat.

No staging deployment: `apps/api/.env.staging`, `apps/web/.env.staging` and root `.env.staging` are absent, and `.github/workflows/deploy-staging.yml` is empty. No authorized target/credentials were found. Production SMTP/storage, HTTPS, alert routing, actual host restore/recovery and merchant sandbox verification remain external operational checks.

One default branch; no table merging/split bills/tender; no offline submissions/capture, native apps, continuous GPS, hardware printing/drawer control, supplier purchasing, advanced costing, campaigns, loyalty or recurring SaaS billing. Delivery zones are restaurant-described service areas, manually checked at dispatch; no geocoding/address verification is claimed. Real prepaid delivery remains blocked on provider selection/integration, and COD stays disabled. PDF is text-only ASCII (`?` for unsupported Unicode); CSV preserves Unicode. Exports cap at 50,000 rows, customer/public-review histories at the documented 100-row views. Stock-derived public availability is not automatically enabled; manual sold-out and acceptance shortage policies remain separate.

The local implementation is a base for Phase 5 engineering. Local passing tests do not certify a hosted pilot or production scalability. Complete staging/merchant/operations checks before inviting real users to features that depend on them.
