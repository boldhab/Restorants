// Parameterized PostgreSQL persistence for the commerce module.
export const commerceQueries = {
  selectOrders:
    'SELECT * FROM orders WHERE restaurant_id=$1 AND (user_id=$2 OR (user_id IS NULL AND session_id=$3)) ORDER BY created_at DESC LIMIT 100',
  updatePaymentAttempts:
    "UPDATE payment_attempts SET reconcile_after=now() WHERE restaurant_id=$1 AND order_id=$2 AND status NOT IN('PAID','FAILED')",
  selectInAppNotifications:
    'SELECT content,created_at FROM in_app_notifications WHERE restaurant_id=$1 AND (user_id=$2 OR (user_id IS NULL AND session_id=$3)) ORDER BY created_at DESC LIMIT 50',
  selectOutboxEvents:
    'SELECT id,kind,state,attempts,last_error,created_at FROM outbox_events WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 100',
  updateOutboxEvents:
    "UPDATE outbox_events SET state='PENDING',available_at=now(),last_error=NULL WHERE restaurant_id=$1 AND id=$2 AND state='FAILED' RETURNING id",
  selectPlans: 'SELECT * FROM plans ORDER BY code',
  selectAuditLogs:
    "SELECT action,metadata,created_at FROM audit_logs WHERE restaurant_id=$1 AND action='platform.tenant.changed' ORDER BY created_at DESC LIMIT 100",
  selectRestaurants:
    "SELECT r.id,r.slug,r.name,r.status,r.timezone,b.id AS branch_id,b.status AS branch_status,v.id AS revision,COALESCE(v.content,(SELECT h.content FROM website_revisions h WHERE h.restaurant_id=r.id ORDER BY h.created_at DESC LIMIT 1)) AS content,COALESCE(p.ordering,false) AND (s.status='manual' OR (s.status='trial' AND s.trial_ends_at>now())) AS ordering,COALESCE(p.reservations,false) AND (s.status='manual' OR (s.status='trial' AND s.trial_ends_at>now())) AS reservations FROM restaurants r JOIN branches b ON b.restaurant_id=r.id AND b.is_default LEFT JOIN website_publications pub ON pub.restaurant_id=r.id LEFT JOIN website_revisions v ON v.id=pub.revision_id LEFT JOIN tenant_subscriptions s ON s.restaurant_id=r.id LEFT JOIN plans p ON p.code=s.plan_code WHERE r.id=$1 FOR UPDATE OF r",
  insertCommerceSettings:
    'INSERT INTO commerce_settings(restaurant_id,content) VALUES($1,$2) ON CONFLICT DO NOTHING',
  selectCommerceSettings: 'SELECT version,content FROM commerce_settings WHERE restaurant_id=$1',
  selectOrders2: 'SELECT session_id,user_id FROM orders WHERE restaurant_id=$1 AND id=$2',
  selectReservations:
    'SELECT session_id,user_id FROM reservations WHERE restaurant_id=$1 AND id=$2',
  insertOutboxEvents:
    'INSERT INTO outbox_events(restaurant_id,dedup_key,kind,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
  selectCarts:
    'SELECT * FROM carts WHERE restaurant_id=$1 AND NOT submitted AND expires_at>now() AND ((user_id=$2 AND $2 IS NOT NULL) OR (user_id IS NULL AND session_id=$3)) ORDER BY (session_id=$3 AND jsonb_array_length(lines)>0) DESC,expires_at DESC LIMIT 1 FOR UPDATE',
  insertCarts:
    'INSERT INTO carts(restaurant_id,branch_id,session_id,user_id) VALUES($1,$2,$3,$4) RETURNING *',
  selectItemAvailability: 'SELECT item_id,content FROM item_availability WHERE restaurant_id=$1',
  updateCarts:
    "UPDATE carts SET lines=$2,version=version+1,expires_at=now()+interval '7 days' WHERE id=$1 RETURNING *",
  insertCheckoutQuotes:
    'INSERT INTO checkout_quotes(restaurant_id,cart_id,session_id,user_id,cart_version,settings_version,revision_id,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
  selectWork: 'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
  selectCheckoutOperations:
    'SELECT fingerprint,result FROM checkout_operations WHERE restaurant_id=$1 AND scope=$2 AND key=$3',
  selectCheckoutQuotes:
    'SELECT * FROM checkout_quotes WHERE restaurant_id=$1 AND id=$2 AND (user_id=$3 OR (user_id IS NULL AND session_id=$4))',
  insertOrders:
    "INSERT INTO orders(restaurant_id,branch_id,cart_id,quote_id,session_id,user_id,reference,status,payment_status,method,currency,total,snapshot,contact,preparation_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9,$10,$11,$12,$13,$14) RETURNING *",
  insertOrderItems: 'INSERT INTO order_items(restaurant_id,order_id,snapshot) VALUES($1,$2,$3)',
  updateCarts2: 'UPDATE carts SET submitted=true,user_id=$2 WHERE id=$1',
  insertOrderHistory:
    "INSERT INTO order_history(restaurant_id,order_id,status,actor_id,reason) VALUES($1,$2,'PENDING',$3,'Customer submitted order')",
  insertPaymentAttempts:
    "INSERT INTO payment_attempts(restaurant_id,order_id,provider,merchant,provider_reference) VALUES($1,$2,'test',$1::uuid::text,$3)",
  insertCheckoutOperations:
    'INSERT INTO checkout_operations(restaurant_id,session_id,scope,key,fingerprint,result) VALUES($1,$2,$3,$4,$5,$6)',
  selectOrders3:
    'SELECT * FROM orders WHERE restaurant_id=$1 AND id=$2 AND (user_id=$3 OR (user_id IS NULL AND session_id=$4))',
  selectOrderHistory:
    'SELECT status,created_at FROM order_history WHERE restaurant_id=$1 AND order_id=$2 ORDER BY id',
  selectRefundRequests:
    'SELECT id,amount,status,created_at FROM refund_requests WHERE restaurant_id=$1 AND order_id=$2',
  selectRefundRequests2:
    "SELECT 1 FROM refund_requests WHERE restaurant_id=$1 AND order_id=$2 AND status='PENDING'",
  updateOrders:
    "UPDATE orders SET status=$3,version=version+1,cancellation_requested=CASE WHEN $3 IN('CANCELLED','REJECTED','COMPLETED','EXPIRED') THEN false ELSE cancellation_requested END,completed_at=CASE WHEN $3='COMPLETED' THEN now() ELSE completed_at END WHERE restaurant_id=$1 AND id=$2 RETURNING *",
  insertOrderHistory2:
    'INSERT INTO order_history(restaurant_id,order_id,status,actor_id,reason) VALUES($1,$2,$3,$4,$5)',
  selectRefundRequests3:
    "SELECT COALESCE(sum(amount),0) AS n FROM refund_requests WHERE restaurant_id=$1 AND order_id=$2 AND status<>'FAILED'",
  selectOrders4: 'SELECT * FROM orders WHERE restaurant_id=$1 AND id=$2 FOR UPDATE',
  updateOrders2: 'UPDATE orders SET preparation_minutes=$3 WHERE restaurant_id=$1 AND id=$2',
  selectOrders5:
    'SELECT * FROM orders WHERE restaurant_id=$1 AND id=$2 AND (user_id=$3 OR (user_id IS NULL AND session_id=$4)) FOR UPDATE',
  updateOrders3: 'UPDATE orders SET cancellation_requested=true,version=version+1 WHERE id=$1',
  insertPaymentTransactions:
    'INSERT INTO payment_transactions(restaurant_id,order_id,provider_reference,amount,currency) VALUES($1,$2,$3,$4,$5)',
  updateOrders4: "UPDATE orders SET payment_status='PAID',version=version+1 WHERE id=$1",
  insertAuditLogs:
    "INSERT INTO audit_logs(actor_id,restaurant_id,action,target_id,metadata) VALUES($1,$2,'payment.collected',$3,$4)",
  selectPaymentTransactions:
    'SELECT COALESCE(sum(amount),0) AS n FROM payment_transactions WHERE restaurant_id=$1 AND order_id=$2',
  insertRefundRequests:
    "INSERT INTO refund_requests(restaurant_id,order_id,amount,status,reason,actor_id) VALUES($1,$2,$3,'PENDING',$4,$5) RETURNING *",
  insertAuditLogs2:
    "INSERT INTO audit_logs(actor_id,restaurant_id,action,target_id,metadata) VALUES($1,$2,'refund.requested',$3,$4)",
  selectRefundRequests4:
    'SELECT f.*,o.method,o.contact FROM refund_requests f JOIN orders o ON o.id=f.order_id WHERE f.restaurant_id=$1 AND f.id=$2 FOR UPDATE OF f',
  updateRefundRequests:
    "UPDATE refund_requests SET status='CONFIRMED',confirmed_at=now() WHERE id=$1",
  insertAuditLogs3:
    "INSERT INTO audit_logs(actor_id,restaurant_id,action,target_id) VALUES($1,$2,'refund.confirmed',$3)",
  selectCommerceSessions:
    'SELECT id FROM commerce_sessions WHERE restaurant_id=$1 AND token_hash=$2 AND expires_at>now()',
  selectRestaurants2: 'SELECT 1 FROM restaurants WHERE id=$1',
  insertCommerceSessions:
    'INSERT INTO commerce_sessions(restaurant_id,token_hash) VALUES($1,$2) RETURNING id',
  updateCommerceSettings:
    'UPDATE commerce_settings SET version=version+1,content=$2 WHERE restaurant_id=$1',
  insertAuditLogs4:
    "INSERT INTO audit_logs(actor_id,restaurant_id,action,metadata) VALUES($1,$2,'commerce.settings',$3)",
  selectOrders6:
    'SELECT * FROM orders WHERE restaurant_id=$1 AND ($2::text IS NULL OR status=$2) AND ($3::text IS NULL OR payment_status=$3) AND ($4::text IS NULL OR reference ILIKE $4) AND ($5::date IS NULL OR created_at>=($5::date::timestamp AT TIME ZONE (SELECT timezone FROM restaurants WHERE id=$1))) AND ($6::date IS NULL OR created_at<(($6::date+1)::timestamp AT TIME ZONE (SELECT timezone FROM restaurants WHERE id=$1))) ORDER BY created_at DESC,id LIMIT $7 OFFSET $8',
  selectOrders7: 'SELECT * FROM orders WHERE restaurant_id=$1 AND id=$2',
  selectOrderHistory2:
    'SELECT status,actor_id,reason,created_at FROM order_history WHERE restaurant_id=$1 AND order_id=$2 ORDER BY id',
  selectRefundRequests5:
    'SELECT id,amount,status,reason,created_at,attempts,last_error FROM refund_requests WHERE restaurant_id=$1 AND order_id=$2 ORDER BY created_at',
  selectPaymentAttempts:
    'SELECT status,attempts,last_error,reconcile_after FROM payment_attempts WHERE restaurant_id=$1 AND order_id=$2',
  selectReservations2:
    'SELECT * FROM reservations WHERE restaurant_id=$1 ORDER BY start_at DESC LIMIT 50 OFFSET $2',
  selectOrders8:
    'SELECT currency,status,count(*)::int AS count FROM orders WHERE restaurant_id=$1 AND created_at>=($2::date::timestamp AT TIME ZONE $4) AND created_at<(($3::date+1)::timestamp AT TIME ZONE $4) GROUP BY currency,status',
  selectOrders9:
    "SELECT currency,count(*)::int AS count,COALESCE(sum(total),0)::text AS total FROM orders WHERE restaurant_id=$1 AND status='COMPLETED' AND completed_at>=($2::date::timestamp AT TIME ZONE $4) AND completed_at<(($3::date+1)::timestamp AT TIME ZONE $4) GROUP BY currency",
  selectPaymentTransactions2:
    'SELECT p.currency,o.method,sum(p.amount)::text AS amount FROM payment_transactions p JOIN orders o ON o.id=p.order_id WHERE p.restaurant_id=$1 AND p.created_at>=($2::date::timestamp AT TIME ZONE $4) AND p.created_at<(($3::date+1)::timestamp AT TIME ZONE $4) GROUP BY p.currency,o.method',
  selectRefundRequests6:
    "SELECT o.currency,sum(f.amount)::text AS amount FROM refund_requests f JOIN orders o ON o.id=f.order_id WHERE f.restaurant_id=$1 AND f.status='CONFIRMED' AND f.confirmed_at>=($2::date::timestamp AT TIME ZONE $4) AND f.confirmed_at<(($3::date+1)::timestamp AT TIME ZONE $4) GROUP BY o.currency",
  selectOrderItems:
    "SELECT o.currency,i.snapshot->>'name' AS name,sum((i.snapshot->>'quantity')::int)::int AS quantity,sum((i.snapshot->>'lineTotal')::bigint)::text AS total FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.restaurant_id=$1 AND o.status='COMPLETED' AND o.completed_at>=($2::date::timestamp AT TIME ZONE $4) AND o.completed_at<(($3::date+1)::timestamp AT TIME ZONE $4) GROUP BY o.currency,i.snapshot->>'name' ORDER BY quantity DESC LIMIT 20",
  selectReservations3:
    "SELECT CASE WHEN status='PENDING' AND hold_expires_at<=now() THEN 'EXPIRED' ELSE status END AS status,count(*)::int AS count FROM reservations WHERE restaurant_id=$1 AND start_at>=($2::date::timestamp AT TIME ZONE $4) AND start_at<(($3::date+1)::timestamp AT TIME ZONE $4) GROUP BY 1",
  selectRestaurants3:
    'SELECT r.id,r.name,r.slug,r.status,s.plan_code,s.status AS subscription_status,s.version FROM restaurants r LEFT JOIN tenant_subscriptions s ON s.restaurant_id=r.id ORDER BY r.created_at DESC LIMIT 50 OFFSET $1',
  updateRestaurants: 'UPDATE restaurants SET status=$2,updated_at=now() WHERE id=$1',
  insertTenantSubscriptions:
    'INSERT INTO tenant_subscriptions(restaurant_id,plan_code,status,trial_ends_at) VALUES($1,$2,$3,$4) ON CONFLICT(restaurant_id) DO UPDATE SET plan_code=excluded.plan_code,status=excluded.status,trial_ends_at=excluded.trial_ends_at,version=tenant_subscriptions.version+1',
  insertAuditLogs5:
    "INSERT INTO audit_logs(actor_id,restaurant_id,action,metadata) VALUES($1,$2,'platform.tenant.changed',$3)",
  selectOrders10: 'SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
  selectReservations4:
    'SELECT * FROM reservations WHERE user_id=$1 ORDER BY start_at DESC LIMIT 100',
  insertCustomerProfiles:
    'INSERT INTO customer_profiles(restaurant_id,user_id,content) VALUES($1,$2,$3) ON CONFLICT(restaurant_id,user_id) DO UPDATE SET content=excluded.content RETURNING id',
  deleteCustomerAddresses:
    'DELETE FROM customer_addresses WHERE restaurant_id=$1 AND customer_id=$2',
  insertCustomerAddresses:
    'INSERT INTO customer_addresses(restaurant_id,customer_id,content) VALUES($1,$2,$3)',
  selectCustomerProfiles: 'SELECT * FROM customer_profiles WHERE restaurant_id=$1 AND user_id=$2',
  selectCustomerAddresses:
    'SELECT content FROM customer_addresses WHERE restaurant_id=$1 AND customer_id=$2',
  selectOrders11:
    "SELECT id,restaurant_id FROM orders WHERE status='PENDING' AND expires_at<=now() ORDER BY expires_at LIMIT 100",
  selectOrders12: 'SELECT * FROM orders WHERE id=$1 FOR UPDATE',
  updateReservations:
    "UPDATE reservations SET status='EXPIRED',version=version+1 WHERE status='PENDING' AND hold_expires_at<=now() RETURNING *",
  deleteReservationAllocations:
    'DELETE FROM reservation_allocations WHERE restaurant_id=$1 AND reservation_id=$2',
  insertReservationHistory:
    "INSERT INTO reservation_history(restaurant_id,reservation_id,status,reason) VALUES($1,$2,'EXPIRED','Pending request hold expired')",
  insertTestProviderLedger:
    'INSERT INTO test_provider_ledger(reference,merchant,amount,currency) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
  selectTestProviderLedger: 'SELECT * FROM test_provider_ledger WHERE reference=$1 AND merchant=$2',
  selectPaymentAttempts2:
    "SELECT * FROM payment_attempts WHERE provider='test' AND merchant=$1 AND provider_reference=$2",
  insertProviderEvents:
    "INSERT INTO provider_events(provider,merchant,event_id,restaurant_id,fingerprint) VALUES('test',$1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id",
  selectProviderEvents:
    "SELECT fingerprint FROM provider_events WHERE provider='test' AND merchant=$1 AND event_id=$2",
  insertPaymentTransactions2:
    'INSERT INTO payment_transactions(restaurant_id,order_id,provider_reference,amount,currency) VALUES($1,$2,$3,$4,$5) ON CONFLICT(order_id) DO NOTHING RETURNING id',
  updateOrders5:
    "UPDATE orders SET payment_status='PAID',version=version+1 WHERE id=$1 AND payment_status<>'PAID'",
  updatePaymentAttempts2: "UPDATE payment_attempts SET status='PAID',last_error=NULL WHERE id=$1",
  updateOrders6: 'UPDATE orders SET payment_status=$2,version=version+1 WHERE id=$1',
  updatePaymentAttempts3: 'UPDATE payment_attempts SET status=$2 WHERE id=$1',
  selectPaymentAttempts3:
    "SELECT a.*,o.total,o.currency FROM payment_attempts a JOIN orders o ON o.id=a.order_id WHERE a.status NOT IN('PAID','FAILED') AND a.reconcile_after<=now() ORDER BY a.reconcile_after LIMIT 50",
  updatePaymentAttempts4:
    "UPDATE payment_attempts SET reconcile_after=now()+interval '2 minutes',attempts=attempts+1 WHERE id=$1 AND reconcile_after<=now() RETURNING id",
  updatePaymentAttempts5:
    "UPDATE payment_attempts SET status='UNKNOWN',last_error=$2 WHERE id=$1 AND status<>'PAID'",
  updateOrders7:
    "UPDATE orders SET payment_status='UNKNOWN' WHERE id=$1 AND payment_status<>'PAID'",
  selectRefundRequests7:
    "SELECT f.*,a.provider_reference,a.merchant FROM refund_requests f JOIN payment_attempts a ON a.order_id=f.order_id WHERE f.status='PENDING' AND f.reconcile_after<=now() ORDER BY f.created_at LIMIT 50",
  updateRefundRequests2:
    "UPDATE refund_requests SET status=$2,last_error=NULL,confirmed_at=CASE WHEN $2='CONFIRMED' THEN now() END WHERE id=$1 AND status='PENDING' RETURNING id",
  selectOrders13: 'SELECT contact FROM orders WHERE id=$1',
  selectReservationAllocations:
    "SELECT a.start_at,a.end_at,a.covers FROM reservation_allocations a JOIN reservations r ON r.id=a.reservation_id WHERE a.restaurant_id=$1 AND r.id<>$4 AND a.start_at<$3 AND a.end_at>$2 AND (r.status IN('CONFIRMED','SEATED') OR (r.status='PENDING' AND r.hold_expires_at>now()))",
  insertReservations:
    "INSERT INTO reservations(restaurant_id,branch_id,session_id,user_id,reference,status,start_at,end_at,party,contact,hold_expires_at) VALUES($1,$2,$3,$4,$5,'PENDING',$6,$7,$8,$9,now()+$10*interval '1 minute') RETURNING *",
  insertReservationAllocations:
    'INSERT INTO reservation_allocations(restaurant_id,reservation_id,start_at,end_at,covers) VALUES($1,$2,$3,$4,$5)',
  insertReservationHistory2:
    'INSERT INTO reservation_history(restaurant_id,reservation_id,status,actor_id,reason) VALUES($1,$2,$3,$4,$5)',
  selectReservations5:
    'SELECT * FROM reservations WHERE restaurant_id=$1 AND (user_id=$2 OR (user_id IS NULL AND session_id=$3)) ORDER BY start_at DESC LIMIT 100',
  selectReservations6: 'SELECT * FROM reservations WHERE restaurant_id=$1 AND id=$2 FOR UPDATE',
  updateReservations2:
    'UPDATE reservations SET start_at=$3,end_at=$4,version=version+1 WHERE restaurant_id=$1 AND id=$2',
  updateReservationAllocations:
    'UPDATE reservation_allocations SET start_at=$3,end_at=$4 WHERE restaurant_id=$1 AND reservation_id=$2',
  updateReservations3:
    'UPDATE reservations SET status=$3,version=version+1 WHERE restaurant_id=$1 AND id=$2',
  withOutboxEvents:
    "WITH due AS (SELECT id FROM outbox_events WHERE (state='PENDING' AND available_at<=now()) OR (state='LEASED' AND lease_until<=now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20) UPDATE outbox_events e SET state='LEASED',lease_until=now()+interval '2 minutes',lease_token=$1,attempts=attempts+1 FROM due WHERE e.id=due.id RETURNING e.*",
  updateOutboxEvents2:
    "UPDATE outbox_events SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND lease_token=$2 AND state='LEASED' RETURNING id",
  insertInAppNotifications:
    'INSERT INTO in_app_notifications(event_id,restaurant_id,user_id,session_id,content) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
  selectCustomerProfiles2:
    'SELECT content FROM customer_profiles WHERE restaurant_id=$1 AND user_id=$2',
  updateOutboxEvents3:
    "UPDATE outbox_events SET state=$3,lease_until=NULL,lease_token=NULL,last_error=$4,available_at=now()+LEAST(3600,power(2,LEAST(attempts,8))*15)*interval '1 second' WHERE id=$1 AND lease_token=$2 RETURNING id",
  insertNotificationDeliveries:
    'INSERT INTO notification_deliveries(event_id,attempt,status,error) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
  operationsHealth: `SELECT (SELECT count(*)::int FROM payment_attempts WHERE status IN('PENDING','UNKNOWN')) AS pending_payments,(SELECT count(*)::int FROM outbox_events WHERE state IN('PENDING','LEASED')) AS outbox_backlog,(SELECT count(*)::int FROM outbox_events WHERE state='FAILED') AS failed_notifications,(SELECT count(*)::int FROM orders WHERE status='PENDING' AND expires_at<now()) AS expired_pending_orders,(SELECT count(*)::int FROM reservations WHERE status='PENDING' AND hold_expires_at<now()) AS expired_pending_reservations,(SELECT COALESCE(EXTRACT(EPOCH FROM now()-min(created_at)),0)::int FROM outbox_events WHERE state IN('PENDING','LEASED')) AS oldest_outbox_seconds`,
  claimRefund:
    "UPDATE refund_requests SET reconcile_after=now()+interval '2 minutes',attempts=attempts+1 WHERE id=$1 AND status='PENDING' AND reconcile_after<=now() RETURNING id",
  refundRecoveryError: "UPDATE refund_requests SET last_error=$2 WHERE id=$1 AND status='PENDING'",
  insertTestRefund:
    'INSERT INTO test_provider_refunds(id,reference,merchant,amount) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
  readTestRefund: 'SELECT * FROM test_provider_refunds WHERE id=$1',
  cancellationReview:
    'UPDATE orders SET cancellation_requested=false,version=version+1 WHERE restaurant_id=$1 AND id=$2',
} as const;
