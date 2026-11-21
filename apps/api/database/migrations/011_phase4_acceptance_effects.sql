-- Acceptance is a single durable operation even if recipe/routing configuration later changes.
CREATE TABLE operational_order_effects(restaurant_id uuid NOT NULL,branch_id uuid NOT NULL,order_id uuid NOT NULL,effect text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(order_id,effect),FOREIGN KEY(restaurant_id,branch_id,order_id) REFERENCES orders(restaurant_id,branch_id,id));
