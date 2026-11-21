import {exportWorkerOnce} from '../operations/exports.service.js';
import { commerceRepository as repo } from './commerce.repository.js';
import { randomUUID } from 'node:crypto';
import { pool } from '../../database/pool.js';
import { withTransaction } from '../../database/transaction.js';
import { emailService } from '../../integrations/email/email-service.js';
import { expireTransactions } from './management.service.js';
import { reconcilePayments } from './payments.service.js';
export async function runOutboxOnce(send = emailService.sendEmail.bind(emailService)) {
  const token = randomUUID();
  const events = await withTransaction(
    async (c) => (await repo.execute(c, 'withOutboxEvents', [token])).rows
  );
  for (const e of events) {
    if (!(await repo.execute(pool, 'updateOutboxEvents2', [e.id, token])).rowCount) continue;
    try {
      const p = e.payload;
      await repo.execute(pool, 'insertInAppNotifications', [
        e.id,
        e.restaurant_id,
        p.userId ?? null,
        p.sessionId ?? null,
        { kind: e.kind, orderId: p.orderId, reservationId: p.reservationId },
      ]);
      let enabled = true;
      if (p.userId) {
        const preference = (
          await repo.execute(pool, 'selectCustomerProfiles2', [e.restaurant_id, p.userId])
        ).rows[0];
        enabled = preference?.content.transactionalEmail !== false;
      }
      if (enabled && p.contact?.email)
        await send({
          to: p.contact.email,
          subject: 'ZAYQORA · ' + e.kind.replaceAll('.', ' '),
          text: p.invitationUrl ? `Accept your staff invitation: ${p.invitationUrl}` : p.reviewUrl ? `Review your completed order: ${p.reviewUrl}` : `Update: ${e.kind}. Open your ZAYQORA customer history in the same browser to see the current status.`,
          html: '',
        });
      await finish(e, 'SENT', null);
    } catch (error) {
      await finish(e, 'FAILED', (error as Error).message);
    }
  }
  async function finish(e: any, status: string, error: string | null) {
    await withTransaction(async (c) => {
      const row = await repo.execute(c, 'updateOutboxEvents3', [
        e.id,
        token,
        status === 'SENT' ? 'DONE' : e.attempts >= 8 ? 'FAILED' : 'PENDING',
        error,
      ]);
      if (row.rowCount)
        await repo.execute(c, 'insertNotificationDeliveries', [e.id, e.attempts, status, error]);
    });
  }
  return { processed: events.length };
}
export async function maintenanceOnce() {
  return withTransaction((c) => expireTransactions(c));
}
export async function workerOnce() {
  return {
    exports: await exportWorkerOnce(),
    maintenance: await maintenanceOnce(),
    payments: await reconcilePayments(),
    notifications: await runOutboxOnce(),
  };
}
