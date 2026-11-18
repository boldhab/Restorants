ALTER TABLE in_app_notifications ADD CONSTRAINT notification_tenant_session FOREIGN KEY(restaurant_id,session_id) REFERENCES commerce_sessions(restaurant_id,id);
CREATE FUNCTION immutable_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.currency<>OLD.currency OR NEW.total<>OLD.total OR NEW.contact IS DISTINCT FROM OLD.contact OR NEW.restaurant_id<>OLD.restaurant_id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.session_id<>OLD.session_id THEN RAISE EXCEPTION 'Order financial snapshots and ownership are immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER protect_order_snapshot BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION immutable_order_snapshot();
CREATE INDEX payments_collected_date ON payment_transactions(restaurant_id,created_at);
CREATE INDEX refunds_confirmed_date ON refund_requests(restaurant_id,confirmed_at) WHERE status='CONFIRMED';
CREATE INDEX customer_reservations ON reservations(user_id,start_at);
