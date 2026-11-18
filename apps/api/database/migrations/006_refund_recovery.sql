ALTER TABLE refund_requests ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE refund_requests ADD COLUMN last_error text;
ALTER TABLE refund_requests ADD COLUMN reconcile_after timestamptz NOT NULL DEFAULT now();
CREATE INDEX refund_reconciliation_due ON refund_requests(reconcile_after) WHERE status='PENDING';
CREATE TABLE test_provider_refunds(id uuid PRIMARY KEY,reference text NOT NULL,merchant text NOT NULL,amount bigint NOT NULL CHECK(amount>0),status text NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN('PENDING','CONFIRMED','FAILED')));
