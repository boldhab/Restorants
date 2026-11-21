import type { PoolClient } from 'pg';
import { pool } from '../../database/pool.js';
export type DB = Pick<PoolClient, 'query'>;
export const queries = {
  contextSave: 'UPDATE carts SET operational_context=$2,version=version+1 WHERE id=$1 RETURNING *',
  reopenOrder:
    "UPDATE orders SET status='PREPARING',version=version+1 WHERE restaurant_id=$1 AND id=$2",
  roster: `SELECT m.id membership_id,u.id,u.full_name name FROM restaurant_memberships m JOIN branch_access ba ON ba.membership_id=m.id JOIN users u ON u.id=m.user_id WHERE m.restaurant_id=$1 AND ba.branch_id=$2 AND m.status='active' ORDER BY u.full_name`,
  orderOptions:
    'SELECT id,reference name FROM orders WHERE restaurant_id=$1 AND branch_id=$2 ORDER BY created_at DESC LIMIT 100',
  reservationOptions:
    "SELECT id,reference name FROM reservations WHERE restaurant_id=$1 AND branch_id=$2 AND status='CONFIRMED' ORDER BY start_at LIMIT 100",
  requestGet:
    'SELECT * FROM operational_requests WHERE restaurant_id=$1 AND branch_id=$2 AND user_id=$3 AND operation_key=$4',
  requestSave:
    'INSERT INTO operational_requests(restaurant_id,branch_id,user_id,operation_key,fingerprint,result) VALUES($1,$2,$3,$4,$5,$6)',
  access: `SELECT m.id, array_agg(DISTINCT p.code) FILTER(WHERE p.code IS NOT NULL) permissions,array_agg(DISTINCT r.name) roles FROM restaurant_memberships m JOIN branch_access a ON a.membership_id=m.id AND a.restaurant_id=m.restaurant_id JOIN branches b ON b.id=a.branch_id AND b.restaurant_id=a.restaurant_id LEFT JOIN membership_roles mr ON mr.membership_id=m.id LEFT JOIN roles r ON r.id=mr.role_id LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id WHERE m.restaurant_id=$1 AND a.branch_id=$2 AND m.user_id=$3 AND m.status='active' AND b.status='active' GROUP BY m.id`,
  defaultBranch: 'SELECT id FROM branches WHERE restaurant_id=$1 AND is_default',
  settings: 'INSERT INTO operational_settings(restaurant_id) VALUES($1) ON CONFLICT DO NOTHING',
  settingsGet: 'SELECT * FROM operational_settings WHERE restaurant_id=$1',
  settingsSave:
    'UPDATE operational_settings SET content=$2,version=version+1 WHERE restaurant_id=$1 RETURNING *',
  audit:
    'INSERT INTO operational_history(restaurant_id,branch_id,entity,entity_id,action,actor_id,reason,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
  lock: 'SELECT id FROM restaurants WHERE id=$1 FOR UPDATE',
  invite:
    "INSERT INTO staff_invitations(restaurant_id,branch_id,email,role,token_hash,expires_at,invited_by) VALUES($1,$2,$3,$4,$5,now()+interval '48 hours',$6) RETURNING id,email,role,expires_at",
  inviteFind: 'SELECT * FROM staff_invitations WHERE token_hash=$1',
  inviteGet: 'SELECT * FROM staff_invitations WHERE token_hash=$1 FOR UPDATE',
  inviteConsume: 'UPDATE staff_invitations SET consumed_at=now() WHERE id=$1',
  inviteRevoke:
    'UPDATE staff_invitations SET revoked_at=now() WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 AND consumed_at IS NULL RETURNING *',
  membership:
    "INSERT INTO restaurant_memberships(restaurant_id,user_id,status) VALUES($1,$2,'active') ON CONFLICT(restaurant_id,user_id) DO UPDATE SET status='active',updated_at=now() RETURNING *",
  grantBranch:
    'INSERT INTO branch_access(restaurant_id,branch_id,membership_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
  grantRole:
    'INSERT INTO membership_roles(membership_id,role_id) SELECT $1,id FROM roles WHERE restaurant_id IS NULL AND name=$2 ON CONFLICT DO NOTHING',
  deleteRoles: 'DELETE FROM membership_roles WHERE membership_id=$1',
  rolePermissions:
    'SELECT p.code FROM roles r JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE r.restaurant_id IS NULL AND r.name=$1',
  owners:
    "SELECT count(DISTINCT m.id) n FROM restaurant_memberships m JOIN membership_roles mr ON mr.membership_id=m.id JOIN roles r ON r.id=mr.role_id WHERE m.restaurant_id=$1 AND m.status='active' AND r.name='owner'",
  memberGet:
    'SELECT m.*,array_agg(r.name) roles FROM restaurant_memberships m LEFT JOIN membership_roles mr ON mr.membership_id=m.id LEFT JOIN roles r ON r.id=mr.role_id WHERE m.restaurant_id=$1 AND m.id=$2 GROUP BY m.id',
  memberStatus:
    'UPDATE restaurant_memberships SET status=$3,updated_at=now() WHERE restaurant_id=$1 AND id=$2',
  staff: `SELECT m.id,m.status,u.email,u.full_name,array_agg(DISTINCT r.name) roles,array_agg(DISTINCT a.branch_id) branches FROM restaurant_memberships m JOIN users u ON u.id=m.user_id LEFT JOIN membership_roles mr ON mr.membership_id=m.id LEFT JOIN roles r ON r.id=mr.role_id LEFT JOIN branch_access a ON a.membership_id=m.id WHERE m.restaurant_id=$1 GROUP BY m.id,u.id ORDER BY u.full_name`,
  invites:
    'SELECT id,email,role,expires_at,consumed_at,revoked_at FROM staff_invitations WHERE restaurant_id=$1 AND branch_id=$2 ORDER BY created_at DESC LIMIT 100',
  memberUser:
    "SELECT m.id FROM restaurant_memberships m JOIN branch_access a ON a.membership_id=m.id WHERE m.restaurant_id=$1 AND a.branch_id=$2 AND m.user_id=$3 AND m.status='active'",
  fallback:
    "INSERT INTO kitchen_stations(restaurant_id,branch_id,name,fallback) VALUES($1,$2,'Unrouted',true) ON CONFLICT(restaurant_id,branch_id) WHERE fallback DO UPDATE SET active=true RETURNING *",
  station:
    'INSERT INTO kitchen_stations(restaurant_id,branch_id,name) VALUES($1,$2,$3) RETURNING *',
  stations: 'SELECT * FROM kitchen_stations WHERE restaurant_id=$1 AND branch_id=$2 ORDER BY name',
  route:
    'INSERT INTO station_routes(restaurant_id,branch_id,item_id,station_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *',
  routeClear: 'DELETE FROM station_routes WHERE restaurant_id=$1 AND branch_id=$2 AND item_id=$3',
  routes:
    'SELECT r.*,s.name FROM station_routes r JOIN kitchen_stations s ON s.id=r.station_id WHERE r.restaurant_id=$1 AND r.branch_id=$2 AND r.item_id=$3 AND s.active',
  stationGrant:
    'INSERT INTO station_access(restaurant_id,branch_id,membership_id,station_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
  stationAllowed:
    'SELECT 1 FROM station_access WHERE restaurant_id=$1 AND branch_id=$2 AND membership_id=$3 AND station_id=$4',
  acceptanceEffect:
    "INSERT INTO operational_order_effects(restaurant_id,branch_id,order_id,effect) VALUES($1,$2,$3,'ACCEPTED') ON CONFLICT DO NOTHING RETURNING order_id",
  ticket:
    'INSERT INTO kitchen_tickets(restaurant_id,branch_id,order_id) VALUES($1,$2,$3) ON CONFLICT(order_id) DO NOTHING RETURNING *',
  ticketGet: 'SELECT * FROM kitchen_tickets WHERE restaurant_id=$1 AND order_id=$2',
  work: 'INSERT INTO kitchen_work(restaurant_id,branch_id,ticket_id,order_item_id,station_id,snapshot) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
  board: `SELECT w.*,t.order_id,o.reference,o.snapshot->>'fulfillment' fulfillment,o.snapshot->>'preparationNotes' preparation_notes,o.snapshot->>'allergyNotes' allergy_notes,ss.table_id,dt.name table_name,s.name station FROM kitchen_work w JOIN kitchen_tickets t ON t.id=w.ticket_id JOIN orders o ON o.id=t.order_id JOIN kitchen_stations s ON s.id=w.station_id LEFT JOIN session_orders so ON so.order_id=o.id LEFT JOIN service_sessions ss ON ss.id=so.service_session_id LEFT JOIN dining_tables dt ON dt.id=ss.table_id WHERE w.restaurant_id=$1 AND w.branch_id=$2 AND ($3::uuid IS NULL OR w.station_id=$3) AND ($4::boolean OR EXISTS(SELECT 1 FROM station_access a WHERE a.membership_id=$5 AND a.station_id=w.station_id)) AND o.status<>'COMPLETED' AND (w.state<>'CANCELLED' OR w.created_at>now()-interval '2 hours') ORDER BY CASE w.state WHEN 'WAITING' THEN 0 WHEN 'PREPARING' THEN 1 WHEN 'READY' THEN 2 ELSE 3 END,w.created_at,w.id LIMIT 301 OFFSET $6`,
  workGet:
    'SELECT w.*,t.order_id FROM kitchen_work w JOIN kitchen_tickets t ON t.id=w.ticket_id WHERE w.restaurant_id=$1 AND w.branch_id=$2 AND w.id=$3 FOR UPDATE OF w',
  workUpdate:
    'UPDATE kitchen_work SET state=$4,version=version+1,delay_reason=$5 WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 RETURNING *',
  ticketState:
    'UPDATE kitchen_tickets SET state=$3,version=version+1 WHERE restaurant_id=$1 AND id=$2',
  unfinished:
    "SELECT 1 FROM kitchen_work WHERE ticket_id=$1 AND state NOT IN('READY','CANCELLED') LIMIT 1",
  cancelWork:
    "UPDATE kitchen_work SET state='CANCELLED',version=version+1,delay_reason=$3 WHERE restaurant_id=$1 AND ticket_id=$2",
  items: 'SELECT * FROM order_items WHERE restaurant_id=$1 AND order_id=$2 ORDER BY id',
  order: 'SELECT * FROM orders WHERE restaurant_id=$1 AND id=$2 FOR UPDATE',
  area: 'INSERT INTO dining_areas(restaurant_id,branch_id,name) VALUES($1,$2,$3) RETURNING *',
  areas: 'SELECT * FROM dining_areas WHERE restaurant_id=$1 AND branch_id=$2',
  table:
    'INSERT INTO dining_tables(restaurant_id,branch_id,area_id,name,seats) VALUES($1,$2,$3,$4,$5) RETURNING *',
  tables: `SELECT t.id,t.area_id,t.name,t.seats,t.active,t.blocked_reason,t.cleaning,t.qr_generation,s.id session_id,s.party,s.expected_end,s.version,s.waiter_id FROM dining_tables t LEFT JOIN service_sessions s ON s.table_id=t.id AND s.status='OPEN' WHERE t.restaurant_id=$1 AND t.branch_id=$2 ORDER BY t.name`,
  tableGet:
    'SELECT * FROM dining_tables WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',
  tableState:
    'UPDATE dining_tables SET active=$4,blocked_reason=$5,cleaning=$6 WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 RETURNING id,name,active,blocked_reason,cleaning',
  qrRotate:
    'UPDATE dining_tables SET qr_hash=$4,qr_generation=qr_generation+1 WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3',
  qrResolve:
    'SELECT id,restaurant_id,branch_id,name,active,blocked_reason,cleaning,qr_generation FROM dining_tables WHERE qr_hash=$1',
  visit:
    'INSERT INTO service_sessions(restaurant_id,branch_id,table_id,party,waiter_id,reservation_id,expected_end,activation_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
  visitGet:
    'SELECT * FROM service_sessions WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',
  visitTable:
    "SELECT * FROM service_sessions WHERE restaurant_id=$1 AND branch_id=$2 AND table_id=$3 AND status='OPEN' FOR UPDATE",
  visitMove:
    'UPDATE service_sessions SET table_id=$4,expected_end=$5,version=version+1 WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3',
  visitClose:
    "UPDATE service_sessions SET status='CLOSED',closed_at=now(),version=version+1 WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3",
  cleaning: 'UPDATE dining_tables SET cleaning=true WHERE id=$1',
  walkins:
    "SELECT created_at start_at,CASE WHEN expected_end<=now() THEN now()+interval '12 hours' ELSE expected_end END end_at,party covers FROM service_sessions WHERE restaurant_id=$1 AND branch_id=$2 AND status='OPEN'",
  commitments: `SELECT a.start_at,a.end_at,a.covers FROM reservation_allocations a JOIN reservations r ON r.id=a.reservation_id WHERE a.restaurant_id=$1 AND r.branch_id=$2 AND r.status IN('PENDING','CONFIRMED','SEATED') AND (r.status<>'PENDING' OR r.hold_expires_at>now()) AND ($3::uuid IS NULL OR r.id<>$3) UNION ALL SELECT created_at,CASE WHEN expected_end<=now() THEN now()+interval '12 hours' ELSE expected_end END,party FROM service_sessions WHERE restaurant_id=$1 AND branch_id=$2 AND status='OPEN' AND ($4::uuid IS NULL OR id<>$4)`,
  reservation:
    'SELECT * FROM reservations WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',
  seatReservation: "UPDATE reservations SET status='SEATED',version=version+1 WHERE id=$1",
  reservationRelease:
    'DELETE FROM reservation_allocations WHERE restaurant_id=$1 AND reservation_id=$2',
  completeReservation:
    "UPDATE reservations SET status='COMPLETED',version=version+1 WHERE id=$1 AND status='SEATED'",
  guestGrant:
    'INSERT INTO table_guest_access(restaurant_id,branch_id,service_session_id,commerce_session_id,token_hash) VALUES($1,$2,$3,$4,$5)',
  guestAccess:
    "SELECT g.* FROM table_guest_access g JOIN service_sessions s ON s.id=g.service_session_id WHERE g.restaurant_id=$1 AND g.commerce_session_id=$2 AND g.token_hash=$3 AND s.status='OPEN'",
  sessionOrder:
    'INSERT INTO session_orders(restaurant_id,branch_id,service_session_id,order_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
  visitOrders:
    'SELECT o.* FROM orders o JOIN session_orders s ON s.order_id=o.id WHERE s.restaurant_id=$1 AND s.branch_id=$2 AND s.service_session_id=$3 ORDER BY o.created_at',
  register: 'INSERT INTO cash_registers(restaurant_id,branch_id,name) VALUES($1,$2,$3) RETURNING *',
  registers: 'SELECT * FROM cash_registers WHERE restaurant_id=$1 AND branch_id=$2',
  cashOpen:
    'INSERT INTO cash_sessions(restaurant_id,branch_id,register_id,opened_by,opening,currency) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
  cash: 'SELECT * FROM cash_sessions WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',
  cashList:
    "SELECT s.* FROM cash_sessions s WHERE restaurant_id=$1 AND branch_id=$2 ORDER BY CASE WHEN status='OPEN' THEN 0 ELSE 1 END,created_at DESC LIMIT 100",
  cashMovement:
    'INSERT INTO cash_movements(restaurant_id,branch_id,cash_session_id,kind,amount,order_id,refund_id,operation_key,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
  cashPrevious:
    'SELECT * FROM cash_movements WHERE restaurant_id=$1 AND branch_id=$2 AND operation_key=$3',
  cashTotal:
    "SELECT COALESCE(sum(CASE WHEN kind IN('SALE','IN') THEN amount ELSE -amount END),0) n FROM cash_movements WHERE restaurant_id=$1 AND branch_id=$2 AND cash_session_id=$3",
  cashMovements:
    'SELECT * FROM cash_movements WHERE restaurant_id=$1 AND branch_id=$2 AND cash_session_id=$3 ORDER BY created_at',
  cashClose:
    "UPDATE cash_sessions SET status='CLOSED',counted=$4,expected=$5,variance=$4::bigint-$5::bigint,closed_at=now(),closed_by=$6 WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 RETURNING *",
  cashReview:
    "UPDATE cash_sessions SET reviewed_at=now(),reviewed_by=$4 WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 AND status='CLOSED' RETURNING *",
  paid: 'INSERT INTO payment_transactions(restaurant_id,order_id,provider_reference,amount,currency) VALUES($1,$2,$3,$4,$5)',
  paidOrder:
    "UPDATE orders SET payment_status='PAID',version=version+1 WHERE restaurant_id=$1 AND id=$2",
  refundedQuantity:
    "SELECT COALESCE(sum(a.quantity),0) n FROM refund_line_allocations a JOIN refund_requests r ON r.id=a.refund_id WHERE a.restaurant_id=$1 AND a.order_item_id=$2 AND r.status<>'FAILED'",
  refundLine:
    'INSERT INTO refund_line_allocations(restaurant_id,branch_id,order_id,order_item_id,refund_id,quantity,amount) VALUES($1,$2,$3,$4,$5,$6,$7)',
  refundItems:
    "SELECT i.id,i.order_id,o.reference||' · '||(i.snapshot->>'name')||' ('||(i.snapshot->>'quantity')||' ordered)' name FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.restaurant_id=$1 AND o.branch_id=$2 AND o.payment_status='PAID' ORDER BY o.created_at DESC,i.id LIMIT 500",
  pendingCashRefunds:
    "SELECT r.id,o.reference||' · '||r.amount||' minor units' name FROM refund_requests r JOIN orders o ON o.id=r.order_id WHERE r.restaurant_id=$1 AND o.branch_id=$2 AND r.status='PENDING' AND EXISTS(SELECT 1 FROM cash_movements m WHERE m.order_id=o.id AND m.kind='SALE') ORDER BY r.created_at LIMIT 100",
  refund: 'SELECT * FROM refund_requests WHERE restaurant_id=$1 AND id=$2 FOR UPDATE',
  refundConfirm: "UPDATE refund_requests SET status='CONFIRMED',confirmed_at=now() WHERE id=$1",
  pendingRefund:
    "SELECT 1 FROM refund_requests WHERE restaurant_id=$1 AND order_id=$2 AND status='PENDING'",
  cashOrder: 'SELECT 1 FROM cash_movements WHERE restaurant_id=$1 AND order_id=$2',
  zone: 'INSERT INTO delivery_zones(restaurant_id,branch_id,name,description,fee,active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
  zones: 'SELECT * FROM delivery_zones WHERE restaurant_id=$1 AND branch_id=$2 ORDER BY name',
  zoneGet:
    'SELECT * FROM delivery_zones WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 AND active',
  deliveryByOrder:
    'SELECT * FROM delivery_assignments WHERE restaurant_id=$1 AND order_id=$2 FOR UPDATE',
  assignment:
    "INSERT INTO delivery_assignments(restaurant_id,branch_id,order_id,rider_id) VALUES($1,$2,$3,$4) ON CONFLICT(order_id) DO UPDATE SET rider_id=$4,state='ASSIGNED',version=delivery_assignments.version+1 RETURNING *",
  deliveryGet:
    'SELECT d.*,o.status order_status,o.payment_status,o.snapshot,o.contact FROM delivery_assignments d JOIN orders o ON o.id=d.order_id WHERE d.restaurant_id=$1 AND d.branch_id=$2 AND d.id=$3 FOR UPDATE OF d',
  deliveries:
    "SELECT d.*,o.reference,o.status order_status,o.snapshot->>'address' address,o.snapshot->>'instructions' instructions,jsonb_build_object('name',o.contact->>'name','phone',o.contact->>'phone') contact FROM delivery_assignments d JOIN orders o ON o.id=d.order_id WHERE d.restaurant_id=$1 AND d.branch_id=$2 AND ($3::boolean OR (d.rider_id=$4 AND d.state NOT IN('DELIVERED','FAILED'))) ORDER BY d.created_at DESC LIMIT 100",
  cancelDelivery:
    "UPDATE delivery_assignments SET state='FAILED',version=version+1 WHERE restaurant_id=$1 AND order_id=$2 AND state NOT IN('FAILED','DELIVERED') RETURNING id",
  deliveryUpdate:
    'UPDATE delivery_assignments SET state=$4,version=version+1 WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 RETURNING *',
  ingredient:
    'INSERT INTO ingredients(restaurant_id,branch_id,name,unit,threshold) VALUES($1,$2,$3,$4,$5) RETURNING *',
  ingredients: 'SELECT * FROM ingredients WHERE restaurant_id=$1 AND branch_id=$2',
  ingredientGet: 'SELECT * FROM ingredients WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3',
  location:
    'INSERT INTO stock_locations(restaurant_id,branch_id,name) VALUES($1,$2,$3) RETURNING *',
  locations: 'SELECT * FROM stock_locations WHERE restaurant_id=$1 AND branch_id=$2',
  balanceEnsure:
    'INSERT INTO stock_balances(restaurant_id,branch_id,ingredient_id,location_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
  balance:
    'SELECT * FROM stock_balances WHERE restaurant_id=$1 AND branch_id=$2 AND ingredient_id=$3 AND location_id=$4 FOR UPDATE',
  balanceChange:
    'UPDATE stock_balances SET quantity=quantity+$5,reserved=reserved+$6 WHERE restaurant_id=$1 AND branch_id=$2 AND ingredient_id=$3 AND location_id=$4',
  balances:
    'SELECT b.*,i.name,i.unit,i.threshold FROM stock_balances b JOIN ingredients i ON i.id=b.ingredient_id WHERE b.restaurant_id=$1 AND b.branch_id=$2',
  consumedForWaste:
    "SELECT * FROM stock_reservations WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 AND state='CONSUMED' FOR UPDATE",
  wasteSum:
    'SELECT COALESCE(sum(quantity),0) n FROM prepared_waste_records WHERE reservation_id=$1',
  wastePrevious:
    'SELECT * FROM prepared_waste_records WHERE restaurant_id=$1 AND branch_id=$2 AND operation_key=$3',
  wasteRecord:
    'INSERT INTO prepared_waste_records(restaurant_id,branch_id,reservation_id,quantity,operation_key,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
  preparedWaste:
    "INSERT INTO stock_movements(restaurant_id,branch_id,ingredient_id,location_id,quantity,kind,operation_key,order_id,reason,actor_id,waste_quantity) VALUES($1,$2,$3,$4,0,'PREPARED_WASTE',$5,$6,$7,$8,$9)",
  stockMovement:
    'INSERT INTO stock_movements(restaurant_id,branch_id,ingredient_id,location_id,quantity,kind,operation_key,order_id,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING *',
  stockPrevious:
    'SELECT * FROM stock_movements WHERE restaurant_id=$1 AND branch_id=$2 AND operation_key=$3',
  stockLedger:
    'SELECT * FROM stock_movements WHERE restaurant_id=$1 AND branch_id=$2 ORDER BY created_at DESC LIMIT 200',
  track:
    'INSERT INTO inventory_tracking(restaurant_id,branch_id,item_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
  tracked:
    'SELECT 1 FROM inventory_tracking WHERE restaurant_id=$1 AND branch_id=$2 AND item_id=$3',
  recipes:
    'SELECT * FROM recipe_versions WHERE restaurant_id=$1 AND branch_id=$2 AND item_id=$3 AND active ORDER BY version',
  recipeOld:
    'UPDATE recipe_versions SET active=false WHERE restaurant_id=$1 AND branch_id=$2 AND item_id=$3 AND variant_id IS NOT DISTINCT FROM $4 AND option_id IS NOT DISTINCT FROM $5',
  recipe:
    'INSERT INTO recipe_versions(restaurant_id,branch_id,item_id,variant_id,option_id,location_id,version) SELECT $1,$2,$3,$4,$5,$6,COALESCE(max(version),0)+1 FROM recipe_versions WHERE restaurant_id=$1 AND branch_id=$2 AND item_id=$3 RETURNING *',
  component:
    'INSERT INTO recipe_components(restaurant_id,branch_id,recipe_id,ingredient_id,quantity) VALUES($1,$2,$3,$4,$5)',
  components:
    'SELECT * FROM recipe_components WHERE restaurant_id=$1 AND branch_id=$2 AND recipe_id=$3',
  stockReserve:
    'INSERT INTO stock_reservations(restaurant_id,branch_id,order_id,order_item_id,recipe_id,ingredient_id,location_id,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING *',
  reservations:
    "SELECT * FROM stock_reservations WHERE restaurant_id=$1 AND order_id=$2 AND state='RESERVED' ORDER BY ingredient_id,location_id FOR UPDATE",
  reserveState: 'UPDATE stock_reservations SET state=$2 WHERE id=$1',
  coupon:
    'INSERT INTO coupons(restaurant_id,branch_id,code,content) VALUES($1,$2,$3,$4) ON CONFLICT(restaurant_id,branch_id,code) DO UPDATE SET content=$4,version=coupons.version+1 RETURNING *',
  coupons: 'SELECT * FROM coupons WHERE restaurant_id=$1 AND branch_id=$2 ORDER BY code',
  couponGet: 'SELECT * FROM coupons WHERE restaurant_id=$1 AND branch_id=$2 AND code=$3 FOR UPDATE',
  couponCount:
    "SELECT count(*)::integer total,count(*) FILTER(WHERE user_id=$2)::integer personal FROM coupon_uses WHERE coupon_id=$1 AND (state='REDEEMED' OR (state='RESERVED' AND expires_at>now()))",
  verified: 'SELECT is_email_verified FROM users WHERE id=$1',
  couponUse:
    'INSERT INTO coupon_uses(restaurant_id,branch_id,coupon_id,order_id,user_id,snapshot) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(order_id) DO NOTHING',
  couponState:
    "UPDATE coupon_uses SET state=$3 WHERE restaurant_id=$1 AND order_id=$2 AND state='RESERVED'",
  posCustomer:
    'SELECT u.id FROM users u WHERE u.id=$3 AND u.is_email_verified AND (EXISTS(SELECT 1 FROM orders WHERE restaurant_id=$1 AND branch_id=$2 AND user_id=u.id) OR EXISTS(SELECT 1 FROM reservations WHERE restaurant_id=$1 AND branch_id=$2 AND user_id=u.id))',
  deliverySafe:
    'SELECT state,created_at FROM delivery_assignments WHERE restaurant_id=$1 AND order_id=$2',
  trackingList: 'SELECT * FROM inventory_tracking WHERE restaurant_id=$1 AND branch_id=$2',
  recipesList: `SELECT r.*,COALESCE(jsonb_agg(jsonb_build_object('ingredientId',c.ingredient_id,'quantity',c.quantity)) FILTER(WHERE c.id IS NOT NULL),'[]') components FROM recipe_versions r LEFT JOIN recipe_components c ON c.recipe_id=r.id WHERE r.restaurant_id=$1 AND r.branch_id=$2 AND r.active GROUP BY r.id`,
  customers: `SELECT u.id,u.full_name,u.email,u.phone,u.is_email_verified,p.content preferences,(SELECT count(*) FROM orders o WHERE o.restaurant_id=$1 AND o.user_id=u.id) order_count FROM users u LEFT JOIN customer_profiles p ON p.user_id=u.id AND p.restaurant_id=$1 WHERE (EXISTS(SELECT 1 FROM orders o WHERE o.restaurant_id=$1 AND o.branch_id=$2 AND o.user_id=u.id) OR EXISTS(SELECT 1 FROM reservations r WHERE r.restaurant_id=$1 AND r.branch_id=$2 AND r.user_id=u.id)) AND (u.full_name ILIKE $3 OR u.email ILIKE $3) ORDER BY u.full_name LIMIT $4 OFFSET $5`,
  customerTotals: `SELECT currency,sum(sales) sales,sum(collected) collected,sum(refunds) refunds FROM (SELECT currency,sum(total) sales,0::bigint collected,0::bigint refunds FROM orders WHERE restaurant_id=$1 AND branch_id=$2 AND user_id=$3 AND status='COMPLETED' GROUP BY currency UNION ALL SELECT p.currency,0,sum(p.amount),0 FROM payment_transactions p JOIN orders o ON o.id=p.order_id WHERE p.restaurant_id=$1 AND o.branch_id=$2 AND o.user_id=$3 GROUP BY p.currency UNION ALL SELECT o.currency,0,0,sum(r.amount) FROM refund_requests r JOIN orders o ON o.id=r.order_id WHERE r.restaurant_id=$1 AND o.branch_id=$2 AND o.user_id=$3 AND r.status='CONFIRMED' GROUP BY o.currency) t GROUP BY currency`,
  customerOrders:
    'SELECT id,reference,status,payment_status,total,currency,created_at FROM orders WHERE restaurant_id=$1 AND branch_id=$2 AND user_id=$3 ORDER BY created_at DESC LIMIT 100',
  customerReservations:
    'SELECT reference,status,start_at,party FROM reservations WHERE restaurant_id=$1 AND branch_id=$2 AND user_id=$3 ORDER BY start_at DESC LIMIT 100',
  notes:
    'SELECT note,actor_id,created_at FROM customer_notes WHERE restaurant_id=$1 AND branch_id=$2 AND user_id=$3 ORDER BY created_at DESC LIMIT 100',
  note: 'INSERT INTO customer_notes(restaurant_id,branch_id,user_id,note,actor_id) VALUES($1,$2,$3,$4,$5) RETURNING *',
  review:
    'INSERT INTO verified_reviews(restaurant_id,branch_id,order_id,user_id,rating,comment) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(order_id) DO NOTHING RETURNING *',
  reviews:
    'SELECT id,order_id,rating,comment,status,response,created_at FROM verified_reviews WHERE restaurant_id=$1 AND branch_id=$2 ORDER BY created_at DESC LIMIT 100',
  publicReviewGet:
    "SELECT branch_id FROM verified_reviews WHERE restaurant_id=$1 AND id=$2 AND status='PUBLISHED'",
  publicReviews:
    "SELECT rating,comment,response,created_at FROM verified_reviews WHERE restaurant_id=$1 AND status='PUBLISHED' ORDER BY created_at DESC LIMIT 100",
  reviewAggregate:
    "SELECT count(*)::integer count,avg(rating)::numeric(4,2) average FROM verified_reviews WHERE restaurant_id=$1 AND status='PUBLISHED'",
  reviewGet:
    'SELECT * FROM verified_reviews WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',
  moderate:
    'UPDATE verified_reviews SET status=$4,response=$5 WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3 RETURNING *',
  reviewReport:
    'INSERT INTO review_reports(restaurant_id,branch_id,review_id,reporter_id,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
  reviewInvite:
    "INSERT INTO review_invitations(restaurant_id,branch_id,order_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '14 days') ON CONFLICT(order_id) DO UPDATE SET token_hash=$4,expires_at=now()+interval '14 days',consumed_at=NULL",
  reviewToken:
    'SELECT * FROM review_invitations WHERE restaurant_id=$1 AND order_id=$2 AND token_hash=$3 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE',
  reviewConsume: 'UPDATE review_invitations SET consumed_at=now() WHERE id=$1',
  export:
    'INSERT INTO export_jobs(restaurant_id,branch_id,requested_by,kind,format,filters) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,state,expires_at',
  exports:
    'SELECT id,kind,format,filters,state,error,expires_at,created_at FROM export_jobs WHERE restaurant_id=$1 AND branch_id=$2 ORDER BY created_at DESC LIMIT 100',
  exportGet: 'SELECT * FROM export_jobs WHERE restaurant_id=$1 AND branch_id=$2 AND id=$3',
  exportSavepoint: 'SAVEPOINT export_generation',
  exportRollback: 'ROLLBACK TO SAVEPOINT export_generation',
  exportRelease: 'RELEASE SAVEPOINT export_generation',
  exportPending:
    "SELECT * FROM export_jobs WHERE state='PENDING' AND expires_at>now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
  exportDone: "UPDATE export_jobs SET state='DONE',bytes=$2 WHERE id=$1",
  exportFail: "UPDATE export_jobs SET state='FAILED',error=$2 WHERE id=$1",
  exportExpire: 'UPDATE export_jobs SET bytes=NULL WHERE expires_at<=now() AND bytes IS NOT NULL',
  reportOrders: `SELECT o.id,o.reference,o.status,o.payment_status,o.currency,o.total,o.snapshot->>'subtotal' subtotal,o.snapshot->>'discount' discount,o.created_at FROM orders o WHERE o.restaurant_id=$1 AND o.branch_id=$2 AND o.created_at>=($3::date::timestamp AT TIME ZONE $5) AND o.created_at<(($4::date+1)::timestamp AT TIME ZONE $5) ORDER BY o.created_at LIMIT 50001`,
  reportCollections: `SELECT p.order_id,p.amount,p.currency,p.created_at FROM payment_transactions p JOIN orders o ON o.id=p.order_id WHERE p.restaurant_id=$1 AND o.branch_id=$2 AND p.created_at>=($3::date::timestamp AT TIME ZONE $5) AND p.created_at<(($4::date+1)::timestamp AT TIME ZONE $5) LIMIT 50001`,
  reportRefunds: `SELECT r.order_id,r.amount,o.currency,r.confirmed_at FROM refund_requests r JOIN orders o ON o.id=r.order_id WHERE r.restaurant_id=$1 AND o.branch_id=$2 AND r.status='CONFIRMED' AND r.confirmed_at>=($3::date::timestamp AT TIME ZONE $5) AND r.confirmed_at<(($4::date+1)::timestamp AT TIME ZONE $5) LIMIT 50001`,
  reportCash: `SELECT s.* FROM cash_sessions s WHERE restaurant_id=$1 AND branch_id=$2 AND created_at>=($3::date::timestamp AT TIME ZONE $5) AND created_at<(($4::date+1)::timestamp AT TIME ZONE $5) LIMIT 50001`,
  reportInventory: `SELECT m.*,i.name,i.unit FROM stock_movements m JOIN ingredients i ON i.id=m.ingredient_id WHERE m.restaurant_id=$1 AND m.branch_id=$2 AND m.created_at>=($3::date::timestamp AT TIME ZONE $5) AND m.created_at<(($4::date+1)::timestamp AT TIME ZONE $5) LIMIT 50001`,
  reportCoupons: `SELECT c.code,u.state,u.snapshot,u.created_at FROM coupon_uses u JOIN coupons c ON c.id=u.coupon_id WHERE u.restaurant_id=$1 AND u.branch_id=$2 AND u.created_at>=($3::date::timestamp AT TIME ZONE $5) AND u.created_at<(($4::date+1)::timestamp AT TIME ZONE $5) LIMIT 50001`,
  reportDelivery: `SELECT d.*,o.reference FROM delivery_assignments d JOIN orders o ON o.id=d.order_id WHERE d.restaurant_id=$1 AND d.branch_id=$2 AND d.created_at>=($3::date::timestamp AT TIME ZONE $5) AND d.created_at<(($4::date+1)::timestamp AT TIME ZONE $5) LIMIT 50001`,
} as const;
export async function q(db: DB, key: keyof typeof queries, args: unknown[] = []) {
  const values = key === 'board' && args.length === 5 ? [...args, 0] : args;
  return (await db.query(queries[key], values)).rows;
}
export const read = (key: keyof typeof queries, args: unknown[] = []) => q(pool, key, args);
