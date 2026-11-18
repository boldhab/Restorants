import { Client } from 'pg';
import { spawn } from 'node:child_process';
import { mkdtemp, chmod, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const source = new URL(
  process.env.TEST_DATABASE_URL || 'postgres://postgres:1234@127.0.0.1:5432/zayqora_test'
);
if (!source.pathname.endsWith('_test') || !['127.0.0.1', 'localhost'].includes(source.hostname))
  throw new Error('Recovery verification is restricted to a local dedicated _test database');
const target = 'zayqora_recovery_' + Date.now() + '_test',
  folder = await mkdtemp(join(tmpdir(), 'zayqora-recovery-')),
  dump = join(folder, 'backup.dump');
const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
const admin = new Client({ connectionString: adminUrl.href });
const original = new Client({ connectionString: source.href });
let restored: Client | undefined,
  created = false;
const pgEnv = {
  ...process.env,
  PGHOST: source.hostname,
  PGPORT: source.port || '5432',
  PGUSER: decodeURIComponent(source.username),
  PGPASSWORD: decodeURIComponent(source.password),
  PGDATABASE: source.pathname.slice(1),
};
async function run(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const p = spawn(command, args, { env: pgEnv, stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    p.stderr.on('data', (d) => {
      error += d.toString();
    });
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed: ${error}`))
    );
  });
}
async function evidence(client: Client) {
  const counts: Record<string, string> = {};
  for (const table of [
    'restaurants',
    'website_revisions',
    'orders',
    'order_items',
    'payment_transactions',
    'refund_requests',
    'reservations',
    'reservation_allocations',
    'outbox_events',
    'notification_deliveries',
    'in_app_notifications',
  ])
    counts[table] = (await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n;
  return {
    counts,
    orders: (
      await client.query(
        'SELECT id,currency,total,snapshot,status,payment_status FROM orders ORDER BY id'
      )
    ).rows,
    payments: (
      await client.query(
        'SELECT order_id,amount,currency FROM payment_transactions ORDER BY order_id'
      )
    ).rows,
    refunds: (
      await client.query(
        'SELECT id,order_id,amount,status,confirmed_at FROM refund_requests ORDER BY id'
      )
    ).rows,
    reservations: (
      await client.query('SELECT id,start_at,end_at,party,status FROM reservations ORDER BY id')
    ).rows,
  };
}
try {
  await admin.connect();
  await original.connect();
  const before = await evidence(original);
  if (
    !Number(before.counts.orders) ||
    !Number(before.counts.payment_transactions) ||
    !Number(before.counts.reservations)
  )
    throw new Error(
      'Populate transaction test fixtures first; recovery evidence requires orders, payments and reservations'
    );
  await run('pg_dump', ['--format=custom', '--no-owner', '--file=' + dump]);
  await chmod(dump, 0o600);
  await admin.query(`CREATE DATABASE ${target}`);
  created = true;
  await run('pg_restore', ['--no-owner', '--exit-on-error', '--dbname=' + target, dump]);
  const targetUrl = new URL(source);
  targetUrl.pathname = '/' + target;
  restored = new Client({ connectionString: targetUrl.href });
  await restored.connect();
  const after = await evidence(restored);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error('Restored representative records do not match source evidence');
  await writeFile(
    'docs/phase-3-recovery-result.json',
    JSON.stringify(
      {
        verified: true,
        target: 'separate temporary local recovery database',
        verifiedAt: new Date().toISOString(),
        counts: after.counts,
        checks: [
          'Exact order snapshots/status/amounts',
          'Exact payment records',
          'Exact reservation intervals/party/state',
          'Record counts for financial, publication and notification tables',
        ],
        source: 'dedicated local test database only',
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    'Recovery verified: orders, payments, reservations, publications and outbox counts/snapshots match.'
  );
} finally {
  await restored?.end();
  await original.end();
  if (created) await admin.query(`DROP DATABASE ${target} WITH (FORCE)`);
  await admin.end();
  await rm(folder, { recursive: true, force: true });
}
