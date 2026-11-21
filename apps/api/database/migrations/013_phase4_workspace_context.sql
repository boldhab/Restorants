-- Operational staff need the existing restaurant context read to enter their workspace after login.
-- This grants no menu/configuration mutation, customer, order-finance or export access.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.restaurant_id IS NULL AND r.name IN('chef','cashier','waiter','rider','accountant') AND p.code IN('workspace:access','restaurant:read')
ON CONFLICT DO NOTHING;
