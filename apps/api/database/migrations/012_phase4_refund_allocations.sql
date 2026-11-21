ALTER TABLE order_items ADD CONSTRAINT order_line_identity UNIQUE(restaurant_id,order_id,id);
ALTER TABLE refund_requests ADD CONSTRAINT order_refund_identity UNIQUE(restaurant_id,order_id,id);
CREATE TABLE refund_line_allocations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid NOT NULL,branch_id uuid NOT NULL,order_id uuid NOT NULL,order_item_id uuid NOT NULL,refund_id uuid NOT NULL,quantity integer NOT NULL CHECK(quantity>0),amount bigint NOT NULL CHECK(amount>=0),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(restaurant_id,branch_id,order_id) REFERENCES orders(restaurant_id,branch_id,id),
 FOREIGN KEY(restaurant_id,order_id,order_item_id) REFERENCES order_items(restaurant_id,order_id,id),
 FOREIGN KEY(restaurant_id,order_id,refund_id) REFERENCES refund_requests(restaurant_id,order_id,id),UNIQUE(refund_id,order_item_id)
);
CREATE INDEX refund_line_claims ON refund_line_allocations(restaurant_id,order_item_id);
CREATE TRIGGER refund_allocations_immutable BEFORE UPDATE OR DELETE ON refund_line_allocations FOR EACH ROW EXECUTE FUNCTION deny_ledger_change();
