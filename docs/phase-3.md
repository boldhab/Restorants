# Phase 3 local MVP

Phase 3 adds pickup commerce and reservations to the existing published-site system. It uses the existing npm/TypeScript/Express/Next.js/PostgreSQL stack. The transaction policies are specified in [phase-3-rules.md](phase-3-rules.md). Ordering and reservations are disabled until BOTH an owner configures them and a platform administrator grants the appropriate plan entitlement. There are no delivery, scheduled-order, dine-in ordering, card-entry, subscription-charging or promo-code interfaces.

## Setup and demonstration

```bash
npm ci
npm run setup:dev
# Start PostgreSQL with infrastructure/docker/compose.dev.yml if needed.
npm run db:migrate
npm run db:seed          # optional, development accounts only
npm run db:seed:phase2   # optional, two clearly marked demonstration menus
npm run dev
# Separate terminal; durable notifications, expirations and payment reconciliation:
npm run worker
```

Use Node 24 and a separate database ending in `_test` for tests. Migrations 004–006 are additive and must run before upgraded API/web processes. Existing Phase 1/2 records are preserved. Development accounts and their explicitly marked development-only password remain documented in README. Never seed production.

1. Sign in as an owner, select an existing restaurant, and open **Menu & website**. Complete/publish its menu with the **takeaway** service mode enabled. At least one active configured item and a visible category are required. Set actual operating hours; immediate pickup is rejected while closed or too close to closing.
2. Open **Orders, reservations & reports → Settings**. Load saved settings. Enable pickup and pay-at-pickup, configure integer-minor-unit minimum/service charge, tax basis points and lead time. Enable reservations and configure cover capacity, duration, buffer, lead, slot interval, advance window, maximum party, hold expiry and blackout periods. Save the versioned settings.
3. Separately sign in as the seeded platform administrator and use **Platform controls** (`/platform`). Enter a mandatory reason and assign the **Controlled pilot** plan. Ordinary owners cannot grant their own entitlements. Basic plan, inactive subscription, suspension and expired trials block new restricted business even through direct APIs.
4. Logged out in a separate browser, browse `/r/{slug}/menu`, open a dish, choose its variant/modifiers, and **Add to pickup cart**. Open the cart, reload it, change quantity/configuration, then calculate a server quote. Supply minimum contact details and confirm **Place pickup order**. The only production-supported method is pay-at-pickup.
5. Refresh the confirmation/tracking URL. Its ID is not a credential: the signed browser session or owning account is required. Staff see new orders by five-second polling. A customer cancellation request after acceptance must be explicitly approved or declined with a reason before preparation. Open an order, enter an action reason, accept, prepare, mark ready, explicitly record collection, then complete. Completion cannot substitute for payment collection. Customer tracking refetches every five seconds.
6. Create a partial refund with a reason. Pickup refunds remain pending until authorized staff explicitly record that funds were returned. Customer tracking shows fulfillment, payment and refund states independently. An online/test refund is reconciled under its original refund identity.
7. From the restaurant website choose **Reserve a visit**. Search a local calendar date and party size, choose an explicit offset-labelled slot, provide contact details and request it. Pending requests temporarily hold covers. Staff confirm/decline in the reservation list. Customers may cancel or select an available new time and reschedule pending/confirmed future requests. Rescheduling reserves/releases capacity atomically.
8. For account history, register/verify/sign in before a new checkout. `/customer/history` shows only that account's records across restaurants. Guest records are never claimed by matching email. Customer settings store tenant-scoped profile, addresses, transactional email preferences and separate marketing consent. Marketing automation is not implemented.
9. Reports separate operational orders/completion from payment/refund cash flow and group currencies. Notification jobs show retry counts/errors and allow explicit failed-job retry. In-app updates are available in restaurant customer history even if transactional email is disabled.
10. To test restrictions, downgrade to Basic or suspend with a reason. New ordering/reservations stop, public websites disappear on suspension, and existing transactions remain available at their operations URLs to authorized active members. Existing paid orders and confirmed bookings are not silently cancelled.

## Persistence and security

`004_phase3_transactions.sql` adds tenant customer profiles/addresses, signed guest-session associations, carts and cart-line JSON, versioned quotes, orders/item snapshots/history, payment attempts/transactions, refund requests, provider-event identifiers, durable operation idempotency, reservations/allocations/history, outbox/delivery/in-app records and plans/subscriptions. Existing tenant keys and composite foreign keys are reused. `005_phase3_integrity.sql` protects order financial snapshots/ownership from updates and adds tenant-scoped notification/session constraints and reporting indexes. `006_refund_recovery.sql` adds refund claims, recovery errors/counters and durable test-provider refund identities. No financial history is deleted when profile, address or menu data changes.

Quote and order snapshots include the purchased published revision, item/variant/modifier names and amounts, quantities, line totals, currency, tax/charge breakdown, pickup address/phone/name, contact details, fulfillment and lead time. Restaurant draft changes never relabel a historical order. Public commerce labels use published content rather than draft profile names. Existing order resolution remains possible after unpublishing; reservation confirmation rechecks its actual held interval without applying a new-request lead-time requirement.

A cart belongs to one restaurant/default branch. Guest credentials are random 256-bit values stored only in signed HttpOnly SameSite=Lax cookies; the database stores their hashes. Cookie names are per restaurant and cookie paths are scoped to its commerce API. Cart/order/reservation UUIDs are never authorization credentials. Credentials expire after 30 days and can be revoked by expiring the server session. They never appear in URLs, localStorage, logs or notification links. Customer pages use no-referrer/noindex; no third-party tracking resources are embedded.

`GET /commerce/{restaurantId}/session` initializes/restores the browser credential and returns an HMAC CSRF value. Every commerce mutation needs `X-Guest-CSRF`. If an account cookie is present, existing `X-CSRF-Token` protection also applies. Existing Origin/CORS/Fetch Metadata checks remain authoritative. Authenticated customer records require their owning user; a signed guest cookie does not expose a previous signed-in user's orders after logout. Login preserves and revalidates a browser guest cart instead of merging prices or attaching historical orders. Otherwise a valid account cart can be restored. Abandoned carts expire after seven days. Invalid stored lines remain visible with explanations instead of silently disappearing.

Customer history endpoints return the latest 100 scoped records; staff orders are paginated, reference/date/status/payment-filtered, and pickup-only. Staff reservations use a paginated list with 50 records. Platform listing uses 50-record pages; delivery jobs show the latest 100. This MVP does not include bulk customer-history export or a graphical table floor plan. Operational actions use explicit order, cancellation, payment, reservation and reporting permissions; manager/owner and front-of-house staff defaults are migrated and mirrored in development seeds. Staff cannot refund, record collections or cancel orders unless granted the corresponding permission. Platform access uses the existing separate administrator assignment, never a restaurant role.

All API/private responses are no-store. Customer and staff pages poll at five seconds and refetch after errors/reloads. Public websites retain Phase 2's uncached publication-aware access gate. Suspension and unpublication block new business regardless of client state. Scoped transaction-resolution middleware explicitly allows active authorized memberships to resolve existing records while the tenant is suspended/archived; it does not grant access to new ordering or public draft content.

## Pricing, quotes and retry recovery

All authoritative values are integer ISO currency minor units. Variants replace the base price; each modifier may be selected once and adds its amount. Line amount is unit amount × bounded quantity (1–20); carts are limited to 50 lines. Tax is exclusive, rounded half-up on the subtotal using BigInt basis-point arithmetic. Service charge is a fixed minor-unit amount; delivery fee is zero. Grand totals must remain safe integers. Reports retain PostgreSQL exact aggregates and use BigInt for cross-aggregate subtraction and rounded AOV. No binary-fraction arithmetic calculates authoritative charges.

Quotes expire after five minutes and bind cart version, publication revision, business-settings version and customer/guest scope. Order submission repeats availability, local opening/closure/lead, minimum, configuration and amount validation while holding the same tenant lock used by menu/publishing/settings writes. A changed/expired quote returns 409 `QUOTE_CHANGED` with `details.quote`; the UI displays the replacement and requires another explicit confirmation. Unavailable items are rejected with actionable messages.

Checkout idempotency is operation + restaurant + verified user or guest session + key, with a canonical request fingerprint. An advisory lock serializes simultaneous uses. Identical retries return the original durable result even after suspension; changed payloads conflict. The order, item snapshots, initial state/history, outbox and retry result commit together; one cart can create only one order. The checkout screen retains an uncertain operation in sessionStorage (contact payload and idempotency key, never a tracking credential), and can recover it after timeout/reload by submitting the original operation. It never silently substitutes a new charge identity.

## Payment classification and recovery

**Real online payment: unconfigured and blocked. Pay-at-pickup: implemented. Automated payment integration: test simulation only.** No provider or merchant approval was supplied, so no external provider API was invented and no real charge/refund was initiated. No raw card/CVV fields exist. SaaS plan assignment has no connection to customer payments and never initiates recurring billing.

`PaymentAdapter` defines stable initialization, status retrieval and refund operations. `testAdapter` refuses to construct outside `NODE_ENV=test`; its payment/refund ledgers are persisted for deterministic restart, timeout and idempotency tests. The signed test callback route is registered only in test mode, before JSON parsing, and is absent in development/production. Its raw bytes and timestamp are HMAC verified; merchant/reference/amount/currency are checked, event IDs are durably deduplicated, and settled payments never regress on stale pending/failed events. Browser redirects cannot record payment success. No production online payment UI is offered.

A durable attempt/reference is created with a test-online order before provider work. Workers claim work briefly, call the adapter outside database transactions, and reconcile the same reference after unknown outcomes; initialization only reuses that existing identity. A timeout after provider acceptance is recorded UNKNOWN and visible to staff. Missing callbacks are recovered through status retrieval. Unaccepted orders expire after 30 minutes. A late success records PAID truth, prevents expired/cancelled fulfillment and reserves a refund. Prepaid acceptance/preparation requires settled payment; pickup follows its explicit collection policy.

Refunds serialize on the order and reserve against collected amount minus all pending/confirmed refunds. Unknown provider outcomes remain PENDING with a recovery error, counted against refundable balance. A short reconciliation claim prevents concurrent worker work; retry always uses the same refund ID. Confirmation/failure creates an outbox event. Pickup refunds require explicit audited manual confirmation. Financial actions and fulfillment transitions remain independent.

A real provider implementation must supply hosted/tokenized checkout, provider-specific signature/timestamp/account validation, stable idempotency semantics, documented reconciliation/refund behavior and provider sandbox evidence before enabling online payment. The adapter contract/test callbacks are not a live or sandbox-verified merchant integration.

## Reservations and concurrency

The default branch's covers are the capacity resource. Each allocation spans duration plus buffer. Search is advisory; submission/rescheduling/confirmation recheck under a tenant row lock. A sweep of interval start/end points counts peak covers, including overlaps with different start times; equal endpoints do not overlap. Expired pending records are excluded in capacity queries even if maintenance is delayed. Cancellation/decline/completion/no-show release allocations. A confirmed reservation is not expired merely because its former pending hold deadline passed.

UTC instants are stored; customer search uses restaurant-local calendar dates and explicit offset-labelled UTC slots. Nonexistent local times produce no slot; repeated DST instants remain distinguishable. Search steps on a 15-minute UTC grid and validates local slot alignment, including half/quarter-hour timezone offsets. New requests apply configured lead/advance/party limits, opening hours and blackouts. The advance bound is an absolute configured number of 24-hour days. Confirmation uses the held interval and current capacity/blackout/opening rules rather than a fresh new-request lead time. Historical published hours remain available for controlled confirmation after unpublishing.

## Worker, notifications and monitoring

```bash
npm run worker                # long-running five-second loop
npm run worker:once           # one complete maintenance/reconciliation/delivery cycle
npm run payments:reconcile    # one reconciliation pass; says unconfigured outside tests
```

The compiled staging command is `node apps/api/dist/scripts/worker.js`. PostgreSQL outbox rows are leased with SKIP LOCKED and fenced by a random lease token. Each job renews its lease before delivery. Failed jobs use bounded exponential backoff, capped at one hour, and stop after eight automatic attempts. Explicit retry retains attempt history. Delivery attempts and stable event dedup keys are durable. In-app inserts use an event primary key and do not repeat effects. SMTP timeouts are bounded. Transactional email preference is independent of marketing consent; this phase sends no marketing.

An email may duplicate if SMTP accepted it before a worker died and the acknowledgement never committed. Exactly-once email delivery is not claimed. Notification failure never rolls back an order/reservation. A failed provider refund is caught independently so it cannot block unrelated outbox deliveries. Customer records, not email, remain the source of truth.

Successful worker cycles write `WORKER_HEARTBEAT_FILE` (default `/tmp/zayqora-worker-heartbeat`). Staging Compose runs a separate worker and checks heartbeat freshness (60 seconds), alongside API readiness. The platform-only `/api/v1/platform/operations/health` reports pending/unknown payment count, outbox backlog, failures, oldest backlog age and delayed expirations. Tenant owners can inspect/retry their failed delivery jobs. Monitoring deployment is not claimed: operators must connect these health/queue measures to their existing alerting service.

Suggested pilot alerts: API readiness failure, any repeated checkout 5xx/409 anomaly by request ID, UNKNOWN/pending provider attempts older than the acceptance window, pending refund recovery errors, oldest outbox over five minutes, failed deliveries > 0, worker heartbeat > 60 seconds, expired-pending cleanup backlog and elevated reservation conflict/error rates. Investigate before retrying unknown payment/refund outcomes; never assign a new provider identity to “fix” a timeout. Protect logs/PII and do not log cookies, guest credentials, webhook secrets or raw payment bodies. In-process rate limits remain 300 requests per 15 minutes per IP; use controlled replica/ingress limits for pilot scale.

## Reports

Orders by status use order creation date. Completed counts, gross completed totals, top dishes and AOV use completion date. AOV is gross completed order totals divided by completed order count, rounded half-up to an integer minor unit. Collected payments use payment transaction date; confirmed refunds use refund confirmation date; net collected subtracts these independent aggregates. This is cash/operational reporting, not profit or a tax filing statement. Reservations use start date. Local date boundaries are converted by PostgreSQL AT TIME ZONE, including DST days; reports never sum currencies together or join item rows into collection aggregates. Filters cover at most one year per request.

## Recovery and staging

After transaction tests have populated representative records, run `npm run recovery:verify`. The helper accepts only a localhost dedicated `_test` source, dumps with PostgreSQL tools, creates a fresh generated recovery database, restores it, compares order financial snapshots, payment/refund records, reservation intervals and related counts, writes `docs/phase-3-recovery-result.json`, then removes the temporary database/dump. This verifies local PostgreSQL recovery, not hosted PITR, SMTP delivery or object-storage restoration. Do not run it concurrently with suites that reset/mutate the same test database.

The staging template includes API, persistent private media volume, worker healthcheck and web origin configuration. No staging host/environment credentials are present and no deployment is claimed. Before a controlled pilot, configure actual HTTPS origins, PostgreSQL/TLS/backups, durable verified media storage, SMTP delivery, health/alert collection and a restore drill on the intended infrastructure. Online payment additionally requires provider choice, credentials, merchant approval and sandbox verification. Do not seed production, expose test mode, purchase infrastructure, or initiate real charges/refunds as a deployment shortcut.

## API documentation

`docs/openapi.json` includes guest/account auth, CSRF, idempotency headers, schema constraints, pagination/filtering, state conflicts, pricing snapshots, reservations, reports, plans, monitoring and the explicitly test-only callback. Rebuild contracts then run `node scripts/update-phase3-openapi.mjs` to regenerate Phase 3 additions. The Phase 2 generator preserves existing Phase 3 entries; run both generators when shared documentation changes.
