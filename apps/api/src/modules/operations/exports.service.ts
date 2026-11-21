import type { PoolClient } from 'pg';
import { withTransaction } from '../../database/transaction.js';
import { business } from '../commerce/commerce.service.js';
import { ConflictError, ForbiddenError } from '../../shared/errors/app-error.js';
import { q, type queries } from './operations.repository.js';
import { args, access, audit, type Context } from './access.service.js';
export const definitions =
  'Sales: completed order totals by creation date. Collections: settled payment records by collection date. Refunds: confirmed disbursements by confirmation date. Drawer: opening plus cash ledger only. Stock: canonical-unit thousandths, consumption negative; prepared waste annotations do not deduct again. All dates restaurant-local. No estimated cash or invented payments.';
export function csvCell(value: unknown) {
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export async function report(c: PoolClient, a: Context, kind: string, filters: any) {
  const b = await business(c, a.restaurantId);
  const metadata = {
    restaurant: b.content?.settings.name ?? b.name,
    restaurantId: a.restaurantId,
    branchId: a.branchId,
    timezone: b.content?.settings.timezone ?? b.timezone,
    currency: 'Separate per row; never summed across currencies',
    ...filters,
    generatedAt: new Date().toISOString(),
    definitions,
  };
  const params = [...args(a), filters.from, filters.to, metadata.timezone];
  const keys: Record<string, keyof typeof queries> = {
    orders: 'reportOrders',
    collections: 'reportCollections',
    refunds: 'reportRefunds',
    cash: 'reportCash',
    inventory: 'reportInventory',
    coupons: 'reportCoupons',
    delivery: 'reportDelivery',
  };
  let rows: any[];
  if (kind === 'customers') {
    if (!a.permissions.includes('customers.export'))
      throw new ForbiddenError('Customer export permission required');
    rows = await q(c, 'customers', [...args(a), '%', 50001, 0]);
  } else {
    if (!keys[kind]) throw new ConflictError('Unknown report');
    rows = await q(c, keys[kind], params);
  }
  if (rows.length > 50000)
    throw new ConflictError('Narrow the date range; maximum 50,000 records per export');
  return { metadata, rows };
}
export function csvReport(data: { metadata: any; rows: any[] }) {
  const keys = Object.keys(data.rows[0] ?? {});
  return Buffer.from(
    Object.entries(data.metadata)
      .map(([k, v]) => [k, v].map(csvCell).join(','))
      .join('\r\n') +
      '\r\n\r\n' +
      keys.map(csvCell).join(',') +
      '\r\n' +
      data.rows.map((r) => keys.map((k) => csvCell(r[k])).join(',')).join('\r\n')
  );
}
export function pdfReport(data: { metadata: any; rows: any[] }) {
  // Small, deterministic text-only PDF. Row wrapping/pagination retains every value.
  const clean = (s: string) => s.replace(/[^\x20-\x7e]/g, '?');
  const lines = [
    ...Object.entries(data.metadata).map(([k, v]) => `${k}: ${v}`),
    ...data.rows.map((r) => JSON.stringify(r)),
  ].flatMap((s) => clean(s).match(/.{1,95}/g) ?? ['']);
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / 55)) }, (_, i) =>
    lines.slice(i * 55, (i + 1) * 55)
  );
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
  ];
  const kids = [];
  for (const page of pages) {
    const index = objects.length + 1;
    kids.push(`${index} 0 R`);
    const stream =
      'BT /F1 8 Tf 36 800 Td 12 TL ' +
      page
        .map(
          (l, i) =>
            `${i ? 'T* ' : ''}(${l.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')}) Tj`
        )
        .join('\n') +
      ' ET';
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${index + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}
export async function exportWorkerOnce() {
  return withTransaction(async (c) => {
    await q(c, 'exportExpire');
    const job = (await q(c, 'exportPending'))[0];
    if (!job) return { processed: 0 };
    await q(c, 'exportSavepoint');
    try {
      const a = await access(
        c,
        job.restaurant_id,
        job.branch_id,
        job.requested_by,
        'exports.generate'
      );
      if (job.kind === 'customers' && !a.permissions.includes('customers.export'))
        throw new ForbiddenError('Customer export permission revoked');
      const data = await report(c, a, job.kind, job.filters);
      await q(c, 'exportDone', [job.id, job.format === 'pdf' ? pdfReport(data) : csvReport(data)]);
      await audit(c, a, 'export', job.id, 'GENERATED', 'Private report generated');
    } catch (e) {
      await q(c, 'exportRollback');
      await q(c, 'exportFail', [job.id, (e as Error).message]);
    }
    await q(c, 'exportRelease');
    return { processed: 1 };
  });
}
