# Operational persistence

```mermaid
erDiagram
 restaurants ||--o{ branches : contains
 restaurant_memberships ||--o{ branch_access : scoped
 branches ||--o{ branch_access : authorizes
 branches ||--o{ staff_invitations : invites
 orders ||--|| kitchen_tickets : prepares
 kitchen_tickets ||--o{ kitchen_work : requires
 kitchen_stations ||--o{ kitchen_work : routes
 order_items ||--o{ kitchen_work : snapshots
 dining_areas ||--o{ dining_tables : contains
 dining_tables ||--o{ service_sessions : visits
 reservations o|--o| service_sessions : seats
 service_sessions ||--o{ session_orders : groups
 orders ||--o| session_orders : belongs
 commerce_sessions ||--o{ table_guest_access : activates
 service_sessions ||--o{ table_guest_access : permits
 cash_registers ||--o{ cash_sessions : opens
 cash_sessions ||--o{ cash_movements : reconciles
 orders o|--o{ cash_movements : collects
 refund_requests o|--o| cash_movements : disburses
 orders ||--o| delivery_assignments : dispatches
 ingredients ||--o{ stock_movements : ledger
 stock_locations ||--o{ stock_balances : projects
 recipe_versions ||--o{ recipe_components : requires
 orders ||--o{ stock_reservations : snapshots
 stock_reservations ||--o{ prepared_waste_records : annotates
 coupons ||--o{ coupon_uses : reserves
 orders ||--o| coupon_uses : discounts
 orders ||--o{ refund_line_allocations : allocates
 refund_requests ||--o{ refund_line_allocations : funds
 orders ||--o| verified_reviews : verifies
 verified_reviews ||--o{ review_reports : reports
 users ||--o{ customer_notes : private
 users ||--o{ export_jobs : requests
 users ||--o{ operational_requests : recovers
```

Every operational resource carries `restaurant_id` and `branch_id`. Composite foreign keys prevent cross-tenant/branch associations, including order and seated-reservation links. One OPEN visit/table and drawer/register are enforced by partial unique indexes. Unique order/ticket, line/station, order/coupon, order/review, component/reservation and operation-key identities prevent replayed effects. Immutable ledgers reject SQL updates/deletes; closed drawer figures reject mutation. Operational history includes kitchen, visit, cash, staff, review, coupon, stock and export changes; existing order/payment/outbox history stays authoritative for the original transactions. No operational table duplicates sale totals into a second order system.
