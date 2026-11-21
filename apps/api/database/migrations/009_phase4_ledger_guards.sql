-- Guards also protect direct SQL maintenance from adding cash after close.
CREATE FUNCTION require_open_cash_session() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_state text;
BEGIN
 SELECT status INTO current_state FROM cash_sessions WHERE restaurant_id=NEW.restaurant_id AND branch_id=NEW.branch_id AND id=NEW.cash_session_id FOR UPDATE;
 IF current_state IS DISTINCT FROM 'OPEN' THEN RAISE EXCEPTION 'Cash session is closed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cash_session_open BEFORE INSERT ON cash_movements FOR EACH ROW EXECUTE FUNCTION require_open_cash_session();
ALTER TABLE stock_movements ADD COLUMN waste_quantity bigint NOT NULL DEFAULT 0 CHECK(waste_quantity>=0);
CREATE TABLE prepared_waste_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid NOT NULL,branch_id uuid NOT NULL,reservation_id uuid NOT NULL,quantity bigint NOT NULL CHECK(quantity>0),operation_key text NOT NULL,reason text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(restaurant_id,branch_id,reservation_id) REFERENCES stock_reservations(restaurant_id,branch_id,id),UNIQUE(restaurant_id,branch_id,operation_key));
CREATE TRIGGER prepared_waste_immutable BEFORE UPDATE OR DELETE ON prepared_waste_records FOR EACH ROW EXECUTE FUNCTION deny_ledger_change();
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.restaurant_id IS NULL AND r.name IN('chef','waiter','rider','accountant') AND p.code='workspace:access' ON CONFLICT DO NOTHING;
