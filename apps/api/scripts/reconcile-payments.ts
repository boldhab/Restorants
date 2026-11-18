import { reconcilePayments } from '../src/modules/commerce/payments.service.js';
import { pool } from '../src/database/pool.js';
try {
  console.log(await reconcilePayments());
} finally {
  await pool.end();
}
