# Phase 3 implementation and pilot assessment

Phase 3 is implemented in the existing repository and architecture. The initial Git tree was clean. Phase 1/2 foundations were inspected and their baseline lint/types and 46 API/unit/security tests passed before implementation. No real charges, refunds, infrastructure purchases or staging deployment were performed.

| Step | Status and evidence |
| --- | --- |
| 1. Transaction rules | Defined guest identity, pickup-only fulfillment, immediate hours/lead/minimum, integer tax/charge rules, payment/refund/fulfillment separation, cancellation and reservation defaults in `phase-3-rules.md`. |
| 2. Database | Migrations 004–006 add tenant-scoped customer/cart/quote/order/payment/refund/reservation/outbox/plan records, composite ownership keys, immutable order snapshots and recoverable refund identities. Applied to test and verified localhost development databases. |
| 3. Carts | Signed HttpOnly tenant credentials plus guest CSRF, account-scoped carts, add/change quantity/configuration/remove/clear, reload restoration, expiry, invalid-line explanations and server revalidation. |
| 4. Pricing/quotes | Published configuration pricing, BigInt tax rounding, explicit fees/minimums, local open/lead checks, five-minute versioned quotes and explicit reconfirmation after changes. Pickup details are snapshotted. |
| 5. Orders | Transactional immutable snapshots/history/outbox and durable operation-key fingerprints, advisory-lock retry serialization, one order per cart and uncertain-response recovery. |
| 6. Payments | Pay-at-pickup collection/refund recording works. Adapter contract plus durable **test-only simulation** verifies signed/deduplicated callbacks, timeouts, reconciliation and refund recovery. Real online provider selection/approval/sandbox verification is **blocked externally**. |
| 7. Restaurant management | Scoped paginated/filterable order list/details, explicit versioned lifecycle, cancellation review, payment-gated completion, collection/refund permissions, estimates, history and five-second polling. |
| 8. Customer journeys | Cart/checkout, guest tracking, account history, cancellation, refund state and recovery of uncertain submissions. Credentials never appear in URLs; no email-only claiming. |
| 9. Reservations | Advisory local-date slot search, explicit UTC/offset labels, overlapping cover allocations, bounded pending holds, locked submission/confirmation/rescheduling, state/history, customer management and owner list. |
| 10. Notifications | Transactional outbox, SKIP LOCKED leases/fencing, bounded retry, attempt records, failed-job visibility/retry, restart recovery and deduplicated in-app effects. SMTP exactly-once delivery is not claimed. |
| 11. Reports/settings | Creation/completion/collection/refund/start-date definitions, local date boundaries, independent currency aggregates, unpaid/cancelled/partial-refund fixtures, own profile/addresses/preferences and separate consent. |
| 12. Platform | Separate platform administrator authorization, tenant listing/details, audited reasoned status/plan changes, basic/pilot entitlements, manual/trial/inactive status and protected historical resolution during suspension. |
| 13. API/operations docs | OpenAPI schemas/auth/CSRF/idempotency/filter/conflict/retry documentation; operational rules, state machines, worker/reconciliation/monitoring and guest identity documentation. |
| 14. Verification/pilot | Executed checks below. Local database recovery passed. Staging, intended-host recovery/media restoration, actual SMTP/storage delivery and live monitoring remain external pilot dependencies. |

## Important files

- `packages/contracts/src/commerce.ts`: business schemas, quantity/configuration inputs, state models and exact monetary rounding.
- `apps/api/database/migrations/004_phase3_transactions.sql`, `005_phase3_integrity.sql`, `006_refund_recovery.sql`: persistence, immutable financial snapshots, ownership constraints and refund recovery.
- `apps/api/src/modules/commerce/`: small HTTP routes; guest session/CSRF; repository SQL; cart/quote/order, payment, reservation and management services; outbox worker.
- `apps/api/scripts/worker.ts`, `reconcile-payments.ts`; `scripts/verify-recovery.ts`: operational entry points and guarded recovery verification.
- `apps/web/src/features/commerce/`, `/shop/[restaurantId]/[[...page]]`, `/customer/history`, `/workspace/[restaurantId]/operations`, `/platform`: customer/staff/admin journeys.
- Existing session, tenant, email timeout, menu renderer, workspace navigation and permission seeds were extended rather than replaced.
- `scripts/update-phase3-openapi.mjs`, `docs/openapi.json`, `docs/phase-3.md`, `docs/phase-3-rules.md`, `docs/phase-3-recovery-result.json`, staging Compose and CI document the actual implementation.

## Executed verification

- Baseline: lint/TypeScript and 46 Phase 1/2 API/unit/security tests passed.
- Full Phase 1–3 regression command: `npm run test:api` — **62 tests passed**, no skips/failures, including the accepted-order cancellation review addition.
- Final focused PostgreSQL command: `NODE_ENV=test node --import tsx --test --test-concurrency=1 apps/api/tests/integration/phase3.test.ts` — **14 tests passed**, including cancellation review, publication privacy, refund recovery, reservation confirmation after unpublishing and local reporting boundaries.
- Final blackout validation compares absolute instants across UTC offsets; the focused commerce unit test passed with valid and reversed cross-offset intervals. ESLint excludes the generated production-browser artifact, matching the existing Next build exclusions.
- `npm run lint` passed ESLint, shared/API TypeScript, Next route generation and frontend TypeScript after these changes.
- `npm run build` passed shared contracts, API/worker compilation and Next production compilation/types/static generation. The final browser-specific production build uses `API_PROXY_URL=http://127.0.0.1:4100 PUBLIC_ORIGIN=http://localhost:3100 NEXT_DIST_DIR=.next-e2e-production npm run build:web`.
- The focused Phase 3 browser journey passed twice in development mode, including guest/account checkout, staff completion/refund, reservations, account isolation and platform restriction.
- A combined development-server browser run hit timeouts in two older journeys while the host showed CPU/I/O pressure; no database lock backlog was observed. A dedicated production-server rerun avoids development compilation and uses bounded longer harness timeouts. The final `npm run test:e2e:production` run passed **all 4 browser journeys** after production-aware visible-control selectors and unique tenant scoping were corrected. It includes a deliberately lost checkout response, protection against overwriting its original payload and recovery of exactly one order. Mobile/tablet/desktop screenshots for checkout, tracking, operations and reservations were inspected; overflow assertions passed.
- Test migrations 004–006 applied successfully; development migrations applied only after checking the target was `development`, `localhost`, `/zayqora_dev`.
- Compiled API startup smoke: readiness passed on temporary local port 4300, the test webhook returned 404 outside test mode and simulated adapter construction was blocked. The smoke process shut down afterward.
- `NODE_ENV=test DATABASE_URL=…/zayqora_test npm run worker:once` passed; seven outbox deliveries/in-app rows were present in the checked recovery fixture and the heartbeat file existed.
- `NODE_ENV=development DATABASE_URL=…/zayqora_test npm run payments:reconcile` returned `{ processed: 0, online: 'unconfigured' }`, confirming no online-provider work outside the test implementation.
- `npm run recovery:verify` restored a PostgreSQL custom dump into a separate generated local recovery database. Exact order snapshots/status/amounts, payment/refund records, reservation intervals/party/state and related counts matched. The temporary database/dump were removed. See `phase-3-recovery-result.json` for actual counts (including an order, payment, confirmed refund, reservation, publications and seven notification deliveries).
- OpenAPI security references and `git diff --check` were validated.

The execution environment restricts sockets/process creation; database, server, browser and Next production checks used approved local execution where needed. No production database was used for destructive tests or recovery.

## Critical-case coverage

| Requested case | Automated evidence |
| --- | --- |
| 1. Manipulated client prices | Strict cart payload rejects price fields; quote asserts exact 2602 subtotal, 215 tax and 2842 total. |
| 2. Foreign restaurant item | Tenant A cart rejects tenant B's published item. |
| 3. Availability changes before checkout | Sold-out before submission rejects the order without partial records. |
| 4. Menu price change before submission | Publishing a new variant price returns `QUOTE_CHANGED` and a new quote requiring confirmation. Draft names remain private. |
| 5–6. Concurrent idempotency / changed fingerprint | Simultaneous same-key requests create one order; mismatched payload conflicts; original result survives retries. |
| 7. Provider accepts then times out | Durable test ledger contains one identity; attempt records UNKNOWN and reconciles by that identity. |
| 8–10. Duplicate/stale/wrong-context callbacks | Raw signed callback rejects bad signature; duplicate events create one transaction; pending does not regress settled payment; merchant/reference/amount/currency mismatches reject. |
| 11. Success after cancellation/expiry | Payment truth remains PAID, fulfillment remains inactive and refund work is created. Missing callbacks recover through provider retrieval. |
| 12. Concurrent over-refund | Locked refund reservations permit one competing amount and reject over-allocation; unknown outcomes remain reserved. |
| 13–15. Staff/customer/tenant isolation | Unauthorized staff cancel/refund/collection/review are forbidden; account B/guest cannot read account A's order; foreign-tenant details return no order. |
| 16–18. Reservation concurrency/overlap/expiry/reschedule | Concurrent requests cannot exceed covers; different start-time overlaps are checked; expired holds stop counting, cannot confirm, and rescheduling is atomic. Existing held intervals can be confirmed without a new-request lead-time failure. |
| 19. Worker retry/restart | Expired leases are reclaimed, in-app effects deduplicate, delivery attempts persist, eight failures become visible FAILED and explicit retry preserves history. Rolled-back events are absent. |
| 20. Reporting partial refunds/unpaid orders | Completed collections/refunds/net/top dishes reconcile; extra unpaid/cancelled orders do not inflate cash; New York midnight boundaries filter UTC records correctly. |
| 21. Suspension during pending payment | New business is blocked while signed callbacks/reconciliation and authorized resolution continue. |

## Commands, variables and demonstration

Use the setup/demo in `phase-3.md`. Core commands:

```bash
npm ci
npm run setup:dev
npm run db:migrate
npm run dev
# Another terminal:
npm run worker
# Operational one-shot commands:
npm run worker:once
npm run payments:reconcile
# Dedicated test data required; do not run during reset/mutation suites:
npm run recovery:verify
# Production browser verification:
npm run test:e2e:production
```

The new runtime environment variable is `WORKER_HEARTBEAT_FILE` (a local file path, no secret). `E2E_PRODUCTION=true` selects the dedicated production browser artifact; the helper script sets the existing API proxy/public origin/dist-directory variables for test servers. Existing database, secure-cookie, origin, SMTP and media variables remain required for real deployment. There are no new merchant secret values because no real provider is selected. `NODE_ENV=test` is required for simulation and must never be used to represent a production payment integration.

Manual demonstration: publish a takeaway menu → owner enables saved operational settings → platform admin assigns pilot plan with reason → guest customizes/reloads cart → server quote → pay-at-pickup order → staff accept/prepare/ready/collect/complete → customer tracks/refund status → request/confirm/reschedule/cancel a reservation → authenticated order appears only in its account history → inspect reports/jobs → downgrade/suspend to verify new-business restrictions and retained historical resolution.

## Pilot readiness and limits

Payment classification: **test simulation only for automated online flows; real pay-at-pickup business workflow implemented; no real provider sandbox/live verification**. Browser payment redirects and test callbacks are not merchant approval. A pay-at-pickup-only pilot does not need online checkout, but online payment must stay disabled until the chosen provider is integrated and sandbox verified.

No staging deployment: the designated environment file is absent and the deployment workflow is empty. Actual HTTPS hosting/credentials, production SMTP, durable verified media storage, alert routing and intended-infrastructure PostgreSQL/media restore exercises remain external dependencies. The local recovery test does not certify hosted PITR or object-storage recovery.

MVP limits: pickup only, one default branch, manually managed plans, no recurring SaaS billing, no delivery/table assignment, latest-100 customer history, simple paginated reservation list, no account claiming of old guest orders, process-local rate limits, and at-least-once email delivery. Customer transactional preferences and marketing consent are separate; marketing is not sent. Historical financial data and publication assets are retained rather than deleted. No real charge/refund or unsupported payment/delivery/reservation capability is silently enabled.

Local verification and pilot deployment approval are separate. Complete the external operational checks above before inviting real customers to a hosted pilot.
