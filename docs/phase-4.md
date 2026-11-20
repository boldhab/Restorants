# Daily restaurant operations

Phase 4 extends the existing modular monolith. Read `phase-4-rules.md` for business policy and `phase-4-verification.md` for executed evidence and external dependencies. No new merchant, GPS, hardware, recurring billing or offline integration is implied.

## Setup and migration

```sh
npm ci
npm run db:migrate
npm run dev
# Separate terminal, same database/environment:
npm run worker
```

Migrations 007–013 are additive. Existing memberships receive default-branch access. A default-branch onboarding trigger grants new memberships the same single branch. Other branches cannot be used through operational APIs. Existing orders/publications/history remain unchanged; operational flags default false, historical orders receive no retroactive tickets, recipes or cash movements. Historical pay-at-pickup collections remain outside drawer balances. New drawer collections are required when cash mode is enabled. Active plans with the existing ordering entitlement authorize operational setup; every feature must also be explicitly enabled in operational settings. Basic/inactive plans cannot start new operational business.

Open `/operations/RESTAURANT_ID/settings` as an authorized owner. Configure stations and routes; create an area/table, register and stock location first. Then enable the corresponding features. Configure ingredients/receipts and recipes before tracking items. Missing recipes for tracked items block acceptance with a shortage/configuration error. Kitchen configuration is optional; unrouted lines use the fallback station when kitchen mode is enabled.

Optional **development-only** seed, for an existing published restaurant already assigned an active pilot plan:

```sh
SEED_RESTAURANT_ID=RESTAURANT_UUID SEED_OWNER_ID=OWNER_UUID npm run db:seed:phase4
```

This adds named demo stations, table, register, recipe, opening stock and a seven-day coupon. It creates no account, fixed password, customer review or live payment. It refuses a duplicate demo opening count. Do not run it against production. Feature setup can instead be completed through the UI/API.

No new required runtime environment variables. Existing database, session/cookie/origin, SMTP, media and `WORKER_HEARTBEAT_FILE` variables still apply. `SEED_RESTAURANT_ID` and `SEED_OWNER_ID` are non-secret identifiers only used by the optional seed. Tests retain the guarded `_test` database requirement; browser tests use the existing API proxy/public-origin production artifact configuration.

## Permissions and branch boundaries

Every `/api/v1/ops/:restaurantId` request loads active membership, explicit branch access and current permissions under the restaurant transaction lock. `branchId` is optional and defaults to the sole enabled default branch; foreign/non-default branches are rejected. Every operational table stores tenant and branch, and composite foreign keys protect associations. Existing Phase 3 staff APIs also require an active default-branch assignment. Removing a restaurant membership leaves global identity and other restaurant memberships intact.

| Role | Operational grants |
| --- | --- |
| Owner | All operational permissions, plus existing ownership permissions. May assign ownership only while explicitly authorized. |
| Manager | Operational management, financial workflows and exports; cannot grant ownership or another management role. |
| Cashier | POS, cash sessions/open/close, collection and order reading. No refund disbursement without `refunds.request`. |
| Chef | Assigned-station kitchen reading/updating. No customer list, financial exports or collections. |
| Waiter | Table visits and POS/order reading. No drawer collection or financial exports. |
| Rider | Active assigned deliveries only, necessary name/phone/address/instructions. No customer list or general order access. |
| Accountant | Reports/exports, including customer export. No kitchen/POS/cash mutation. |

Operational roles also receive the existing workspace/restaurant-context read grants needed after login; these do not grant diner records, collections or exports.

Permissions use existing colon codes for existing Phase 3 routes and explicit dot codes for new operational actions (shared `operationalRolePermissions`). Owner names never bypass backend permission checks. Role assignments cannot exceed the actor's actual permission set. Management roles require an owner grant; the final active owner cannot be removed or demoted. Invitations require a verified matching account and a still-authorized inviter, expire in 48 hours, and are single use. Resend revokes the previous token. Invitation URLs use fragments, are removed from browser history after load and are sent through the durable outbox; email delivery failure remains visible/retryable through existing notification monitoring.

Operational interfaces use five-second full-state polling instead of permanent sockets. Every poll reauthorizes; a denial clears protected cards. Reconnection/online events fetch authoritative state. No cached subscription grant survives revocation. Version checks reject stale kitchen/delivery/table actions. Optional sound requires explicit user selection.

## Kitchen and inventory

Accepted eligible orders create tickets/work in the same database transaction as the order state/outbox history. Replay is safe through unique order/ticket and line/station identities. Multiple stations repeat preparation instructions/quantity only; sales remain the original order lines. Routing, variant/modifier notes and item allergens are snapshotted. The kitchen never receives contact, staff notes or financial records.

The board prioritizes waiting/preparing work, excludes completed customer orders, retains recent cancelled work for awareness and pages at 300 work units. Active work is never hidden by an age cutoff; use station filters and page controls for a large queue. One station finishing cannot mark the customer order ready. All required work must finish. Reopening requires `kitchen.correct` and a reason; the order reverts to preparation with an audit. Cancelling after preparation retains cancelled work/history and pending refund resolution. Cancellation releases reserved ingredients but never restores consumed ingredients.

Units are integer thousandths of g/ml/each. kg→g and l→ml are exact integer conversions; incompatible dimensions reject. Receipts, adjustments and raw waste write immutable movements and update locked balance projections. Available quantity excludes reservations. Recipe versions include base or variant override plus selected modifier additions. Acceptance snapshots component/version/quantity; recipe edits affect future acceptance only. Preparation consumes once, with stable movement identities. Marking a tracked item without a recipe is supported explicitly and visible in inventory setup. No automatic stock-derived public sold-out flag is claimed; manual availability stays authoritative and shortage checks occur at acceptance.

`POST /ops/:id/inventory/prepared-waste` records a positive thousandths quantity against a CONSUMED stock-reservation ID, requires reason/key, caps cumulative waste at actual consumed quantity and adds a zero-deduction `PREPARED_WASTE` ledger annotation with `waste_quantity`. It does not deduct already-used ingredients twice. Ledger entries cannot be updated/deleted. Correct raw stock through compensating adjustments, never historical edits.

## Tables, QR and POS

Occupancy is derived from open service sessions. Each table has capacity, active/block/cleaning state, area and optional waiter. Opening takes an expected departure (within twelve hours), checks seats and peak overlapping branch covers, and prevents competing visits. Seating a confirmed reservation atomically removes its aggregate allocation and replaces it with the visit. Existing reservation records are preserved. Capacity remains aggregate covers, not an exact future table guarantee. Overdue visits conservatively continue to commit covers; staff must close/extend them. Movement claims the destination and releases the old table atomically, marking the old table for cleaning.

A settled visit can close only when orders are terminal, non-cancelled orders are paid and pending refunds are resolved. Closure retains orders/history, finishes the seated reservation and marks the table for cleaning. Staff explicitly mark it clean/available. No merged tables or split bills.

Rotating a printed table reference returns an actual locally encoded QR image/link. The reference alone reveals no diner's records. Staff give a separate random activation code when opening the visit. Joining initializes an existing commerce identity and issues a signed HttpOnly, tenant-path-scoped table capability. Only that identity's orders are visible; closure blocks new ordering even if cookies remain. A rotated printed reference no longer joins; past reference strings are stored only as hashes. Capability values never go into query strings or analytics. QR UI and visit instructions use no-referrer/noindex.

POS (`/operations/:id/pos`) uses published menu, modifiers, quantities, server quotes, immutable orders and original idempotency keys. Counter/takeaway map to pickup; dine-in requires an active visit. Guests use entered contact information without claiming a customer account. Guest POS records are accessible through staff-authorized operational endpoints, not the staff browser’s public guest credential; revocation also blocks replay of the original POS submission. Staff may select a verified existing branch customer; account association is checked server-side. POS submission accepts the order transactionally under the existing pay-at-pickup policy; shortage rolls the entire submission back. Additional visit requests create new immutable orders. Cash settlement links payments to those original orders, never creates sales copies. One settlement per order; no split tender, offline submission/capture or hardware integration. Browser receipt printing is a print-dialog feature only.

All mutations under `/ops/:restaurantId` require `Idempotency-Key`, scoped to tenant/branch/actor with a payload/action fingerprint. Authorization is rechecked before replay; ambiguous form submissions keep their original payload/key in session storage and recover it instead of inventing another operation. POS retains its original quote/contact/key separately. Acknowledged validation errors permit correction. Do not clear browser session storage during an unresolved submission; verify server history first.

## Cash and delivery

Open one drawer per register with a currency-specific float. Cash SALE and approved REFUND disbursement update payment/refund records and cash ledger atomically. IN/OUT need reasons and positive minor-unit amounts. Closing locks the drawer/restaurant, includes every prior committed movement and snapshots expected/counted/variance. The database rejects new movements after close. Closed figures and movements are immutable; review metadata can be appended. Corrections require a later drawer's compensating audited entry, preserving the original closure. Requested refunds do not reduce cash until actually disbursed. Online collections never enter the drawer. Fully discounted zero balances settle with a zero payment record and no fabricated cash movement. Close all open drawers before disabling cash tracking. After suspension, existing open drawers/work may be resolved; opening a new drawer requires the tenant to be restored to an eligible plan/status.

Delivery zones are explicitly described service areas with fixed server fees. Customer addresses must be within the selected restaurant-managed zone; no automated geocoding or address validation is claimed. Dispatch should verify that the entered address matches the described zone before acceptance. Orders must be prepaid; pay-at-pickup/cash-on-delivery is rejected. ASSIGNED→ACCEPTED→PICKED_UP→EN_ROUTE→DELIVERED, with FAILED and a reason available from active stages. Handover requires READY+PAID. Reassignment before handover replaces the rider immediately; failed assignments can be reassigned. Final assignments are removed from rider access. Customer tracking gets only customer-safe delivery state. Delivery completion invokes the existing payment-gated order completion; no milestone fabricates a payment.

**External limitation:** no real payment provider was selected/configured in Phase 3, so public delivery checkout cannot complete a real prepaid order. Automated delivery verification uses controlled test-only payment records; live delivery ordering stays unavailable until an actual provider is integrated and sandbox verified. No continuous GPS, rider cash custody or COD.

## Coupons, customers and reviews

Coupons support fixed/percentage/free-delivery, times, minimum, cap, item/category eligibility, service modes and total/verified-customer limits. One coupon/no stacking. Percentage values use basis points. The eligible pre-discount subtotal determines the minimum; integer discount allocations apply before tax, excluding fixed service charges. Capacity reserves at checkout, confirms on acceptance and releases pending cancellation/expiry. Confirmed redemptions remain used after cancellation/refund. Snapshot allocations never reprice after edits. Partial item refunds calculate the original discounted line total plus its allocated original tax, with exact deterministic per-unit rounding and locked cumulative quantity limits. Fixed service/delivery charges are excluded from item refunds; use the existing explicit amount adjustment or full cancellation policy for those. Immutable refund-line allocations link to the existing refund requests and actual cash/provider disbursement workflow. Amount adjustments remain bounded by the original collected total. Anonymous identity never satisfies a strict per-customer restriction. Per-customer coupons require the customer’s own authenticated online/QR checkout; a staff POS account or account selection cannot stand in for customer authentication.

Customer list/detail uses authenticated global IDs within tenant/branch order/reservation relationships. Contacts are never merged by editable email/phone. Spending shows completed sales, collections and confirmed refunds independently by currency. Consent and notification preferences remain separate. Restricted notes require `customers.notes`, stay out of public/kitchen/rider responses and are never marketing inputs. Marketing sending is outside scope.

Completed authenticated owners or holders of a single-use emailed invitation may review an order once. Emailed invitations open `/review/:restaurantId/:orderId` without loading order/contact data, so a guest can review from a different browser without receiving an order-history credential. No sample reviews are seeded. The public count/mean uses all PUBLISHED reviews, including negative ratings; the latest 100 are listed. Reporting abuse does not automatically hide reviews. Hiding requires spam/abuse/privacy policy category and explanation; state/response changes are audited. Comments and responses render as text through React. Visibility correction is explicit and reasoned.

## Reports, exports and recovery

Order sales, actual collections, confirmed refunds, cash drawers, inventory, customers, coupon usage and delivery exports are generated in the worker. Files are stored privately in `export_jobs.bytes` with metadata and 24-hour expiry; no public storage URL. Generation and download recheck active membership, branch, exports.generate and customers.export where relevant. Revocation blocks an old link. The worker clears expired bytes, uses SKIP LOCKED and transaction/savepoint recovery, and exposes failed state/errors. A crash before commit leaves the job pending. Fix the cause and create a new job after an explicit failure; no infinite silent retries.

CSV text prefixes spreadsheet-formula-like values before quoting. PDF is a local, paginated, text-only report; non-ASCII characters render as `?`, so CSV is the lossless Unicode option. Exports are bounded at 50,000 rows; narrow the date range above that bound. Metadata includes restaurant, branch, dates, timezone, currency treatment, generation timestamp and definitions. Distinct source queries prevent sales multiplication by kitchen/payment/inventory joins. Sales use completed order totals by order-creation date; actual collection/refund dates govern cash-flow reports. Drawer opening float is not revenue. Ingredient consumption and raw/prepared waste remain distinct.

Incidents: inspect notification failures, failed export jobs, oldest WAITING kitchen work, FAILED deliveries, overdue visits, low stock and drawer variance. Reconcile financial records with source payments/refunds before any compensating entry. Never delete tickets/ledger entries to hide a mismatch. Use the existing worker heartbeat and intended-host backup/restore procedures; a local PostgreSQL recovery exercise from Phase 3 is not hosted operational certification. Test notifications can be replayed through existing retry controls; kitchen/stock effects are transactional/idempotent and do not depend on email delivery.

## Manual demonstration

1. Publish menu with pickup/dine-in modes; platform administrator grants existing pilot entitlement. Configure operational resources and enable features.
2. Invite a verified chef, accept the email link, assign two stations to both the member and a menu item.
3. Place an online order, accept it; inspect the two preparation work cards. Finish one station, then the other; only the second makes the order ready.
4. Open a cash session and collect the original order; complete it. Inspect stock consumption and payment versus fulfillment status.
5. Seat a walk-in (or confirmed reservation), print/rotate the QR, join using the visit activation code, place another order and settle its original balance. Close the visit, mark the table clean, and verify old diner ordering fails.
6. Place a POS order with DEMO10 or configured coupon; inspect the original discount snapshot, receipt and stock reservations. Reconcile an uncertain submission with its original key.
7. Dispatch a controlled prepaid test delivery to a rider; accept/pick up/en-route/deliver. Reassign before handover to verify old-rider access disappears.
8. Inspect customers/consent, add a restricted note, invite a verified review and respond; confirm negative reviews remain counted.
9. Close/count cash, inspect variance, generate CSV/PDF, run worker and download. Revoke the staff membership and verify subsequent polls/downloads fail.

See `docs/openapi.json`, generated through `npm run docs:phase4`, for endpoint schemas, required permissions and idempotency headers.
