'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { money } from '../../lib/commerce-client';
export function Operations({ restaurantId: id }: { restaurantId: string }) {
  const [tab, setTab] = useState('Orders'),
    [orders, setOrders] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [reservations, setReservations] = useState<any[]>([]),
    [settings, setSettings] = useState<any>(null),
    [reports, setReports] = useState<any>(null),
    [jobs, setJobs] = useState<any[]>([]),
    [message, setMessage] = useState(''),
    [reason, setReason] = useState(''),
    [estimate, setEstimate] = useState(15),
    [refund, setRefund] = useState(0),
    [reference, setReference] = useState(''),
    [status, setStatus] = useState(''),
    [payment, setPayment] = useState(''),
    [offset, setOffset] = useState(0),
    [from, setFrom] = useState(new Date().toISOString().slice(0, 10)),
    [to, setTo] = useState(new Date().toISOString().slice(0, 10)),
    [busy, setBusy] = useState(false);
  const base = `/operations/${id}`;
  async function load() {
    if (tab === 'Orders') {
      setOrders(
        await api(
          `${base}/orders?offset=${offset}&limit=30${reference ? '&reference=' + encodeURIComponent(reference) : ''}${status ? '&status=' + status : ''}${payment ? '&payment=' + payment : ''}&from=${from}&to=${to}`
        )
      );
      if (selected) setSelected(await api(`${base}/orders/${selected.id}`));
    }
    if (tab === 'Reservations') setReservations(await api(`${base}/reservations?offset=${offset}`));
    if (tab === 'Reports') setReports(await api(`${base}/reports?from=${from}&to=${to}`));
    if (tab === 'Notifications') setJobs(await api(`${base}/notifications/jobs`));
  }
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
    if (['Orders', 'Reservations'].includes(tab)) {
      const t = setInterval(() => load().catch((e) => setMessage(e.message)), 5000);
      return () => clearInterval(t);
    }
  }, [id, tab, reference, status, payment, offset, from, to, selected?.id]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      setMessage('Saved successfully.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="commerce-page">
      <header>
        <Link href={`/workspace/${id}/dashboard`}>← Workspace</Link>
        <strong>Restaurant operations</strong>
        <Link href={`/workspace/${id}/website`}>Menu & website</Link>
      </header>
      <p className="eyebrow">SERVICE, WITH CLARITY</p>
      <h1>Keep every visit moving.</h1>
      <nav className="editor-tabs">
        {['Orders', 'Reservations', 'Reports', 'Settings', 'Notifications'].map((t) => (
          <button
            aria-pressed={t === tab}
            key={t}
            onClick={() => {
              setTab(t);
              setOffset(0);
              setSelected(null);
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      <p role="status">{message}</p>
      {['Orders', 'Reports'].includes(tab) && (
        <div className="inline-fields">
          <label>
            From (restaurant-local date)
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Through (restaurant-local date)
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      )}
      {tab === 'Orders' && (
        <>
          <section className="panel">
            <div className="inline-fields">
              <label>
                Order reference
                <input
                  value={reference}
                  onChange={(e) => {
                    setReference(e.target.value.toUpperCase());
                    setOffset(0);
                  }}
                />
              </label>
              <label>
                Fulfillment status
                <select
                  aria-label="Fulfillment status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">All</option>
                  {[
                    'PENDING',
                    'CONFIRMED',
                    'PREPARING',
                    'READY',
                    'COMPLETED',
                    'CANCELLED',
                    'REJECTED',
                    'EXPIRED',
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Payment state
                <select
                  aria-label="Payment state"
                  value={payment}
                  onChange={(e) => setPayment(e.target.value)}
                >
                  <option value="">All</option>
                  {['UNPAID', 'PENDING', 'UNKNOWN', 'PAID', 'FAILED'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            <p>Pickup only. Updates refresh every five seconds.</p>
            {!orders.length && <p>No orders match these filters.</p>}
            {orders.map((o) => (
              <article className="cart-row" key={o.id}>
                <h2>{o.reference}</h2>
                <p>
                  {o.status} · Payment {o.paymentStatus} · {money(o.total, o.currency)}
                </p>
                {o.cancellationRequested && <p>Customer requested cancellation</p>}
                <button
                  onClick={() =>
                    action(async () => setSelected(await api(`${base}/orders/${o.id}`)))
                  }
                >
                  Open {o.reference}
                </button>
              </article>
            ))}
            <button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 30))}>
              Previous page
            </button>
            <button disabled={orders.length < 30} onClick={() => setOffset(offset + 30)}>
              Next page
            </button>
          </section>
          {selected && (
            <section className="panel">
              <h2>Order details · {selected.reference}</h2>
              <p>
                Fulfillment: {selected.status} · Payment: {selected.paymentStatus}
              </p>
              <p>
                {selected.contact.name} · {selected.contact.phone} · {selected.contact.email}
              </p>
              {selected.snapshot.lines.map((l: any) => (
                <p key={l.id}>
                  {l.quantity} × {l.name}
                  {l.variant && ' · ' + l.variant.name}
                  {l.modifiers.map((m: any) => ' · ' + m.name).join('')} —{' '}
                  {money(l.lineTotal, selected.currency)}
                </p>
              ))}
              <label>
                Action reason
                <input
                  aria-label="Action reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label>
                Preparation estimate (minutes)
                <input
                  type="number"
                  min={0}
                  max={180}
                  value={estimate}
                  onChange={(e) => setEstimate(Number(e.target.value))}
                />
              </label>
              {selected.cancellationRequested && (
                <div>
                  <p>Customer cancellation requires review before preparation.</p>
                  {(['approve', 'decline'] as const).map((decision) => (
                    <button
                      disabled={busy || reason.trim().length < 3}
                      key={decision}
                      onClick={() =>
                        action(async () => {
                          await api(`${base}/orders/${selected.id}/cancellation-resolution`, {
                            method: 'POST',
                            body: JSON.stringify({ version: selected.version, decision, reason }),
                          });
                          await load();
                        })
                      }
                    >
                      {decision === 'approve'
                        ? 'Approve cancellation request'
                        : 'Decline cancellation request'}
                    </button>
                  ))}
                </div>
              )}
              <div className="inline-fields">
                {(
                  {
                    PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
                    CONFIRMED: ['PREPARING', 'CANCELLED'],
                    PREPARING: ['READY'],
                    READY: ['COMPLETED'],
                  } as Record<string, string[]>
                )[selected.status]?.map((s) => (
                  <button
                    disabled={busy || reason.trim().length < 3}
                    key={s}
                    onClick={() =>
                      action(async () => {
                        await api(`${base}/orders/${selected.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            version: selected.version,
                            status: s,
                            reason,
                            preparationMinutes: estimate,
                          }),
                        });
                        await load();
                      })
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
              {selected.method === 'pay_at_pickup' && selected.paymentStatus !== 'PAID' && (
                <button
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      await api(`${base}/orders/${selected.id}/collection`, {
                        method: 'POST',
                        body: JSON.stringify({ version: selected.version }),
                      });
                      await load();
                    })
                  }
                >
                  Record payment collected at pickup
                </button>
              )}
              <label>
                Refund amount (minor units)
                <input
                  type="number"
                  min={1}
                  value={refund}
                  onChange={(e) => setRefund(Number(e.target.value))}
                />
              </label>
              <button
                disabled={busy || refund <= 0 || reason.trim().length < 3}
                onClick={() =>
                  action(async () => {
                    await api(`${base}/orders/${selected.id}/refunds`, {
                      method: 'POST',
                      body: JSON.stringify({ amount: refund, reason }),
                    });
                    await load();
                  })
                }
              >
                Request refund
              </button>
              {selected.refunds.map((f: any) => (
                <div key={f.id}>
                  <p>
                    Refund {money(f.amount, selected.currency)} · {f.status}{' '}
                    {f.last_error && `· Recovery pending: ${f.last_error}`}
                  </p>
                  {selected.method === 'pay_at_pickup' && f.status === 'PENDING' && (
                    <button
                      onClick={() =>
                        action(async () => {
                          await api(`${base}/refunds/${f.id}/confirmation`, { method: 'POST' });
                          await load();
                        })
                      }
                    >
                      Record pickup refund handed back
                    </button>
                  )}
                </div>
              ))}
              <h3>History</h3>
              <ol>
                {selected.history.map((h: any, n: number) => (
                  <li key={n}>
                    {h.status} · {h.reason} · {new Date(h.created_at).toLocaleString()}
                  </li>
                ))}
              </ol>
              {selected.paymentAttempts.map((p: any, n: number) => (
                <p key={n}>
                  Provider attempt: {p.status} · attempts {p.attempts} · {p.last_error}
                </p>
              ))}
            </section>
          )}
        </>
      )}
      {tab === 'Reservations' && (
        <section className="panel">
          <h2>Reservation calendar list</h2>
          <p>Branch cover capacity; no table assignment is implied.</p>
          <label>
            Action reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {!reservations.length && <p>No reservations.</p>}
          {reservations.map((r) => (
            <article className="cart-row" key={r.id}>
              <h3>
                {r.reference} · {r.status}
              </h3>
              <p>
                {new Date(r.start).toLocaleString()} → {new Date(r.end).toLocaleString()} ·{' '}
                {r.party} covers · {r.contact.name}
              </p>
              {(
                {
                  PENDING: ['CONFIRMED', 'DECLINED', 'CANCELLED'],
                  CONFIRMED: ['SEATED', 'NO_SHOW', 'CANCELLED'],
                  SEATED: ['COMPLETED'],
                } as Record<string, string[]>
              )[r.status]?.map((s) => (
                <button
                  disabled={busy || reason.trim().length < 3}
                  key={s}
                  onClick={() =>
                    action(async () => {
                      await api(`${base}/reservations/${r.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ version: r.version, status: s, reason }),
                      });
                      await load();
                    })
                  }
                >
                  {s} reservation
                </button>
              ))}
            </article>
          ))}
          <button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>
            Previous page
          </button>
          <button disabled={reservations.length < 50} onClick={() => setOffset(offset + 50)}>
            Next page
          </button>
        </section>
      )}
      {tab === 'Settings' && (
        <section className="panel">
          <h2>Pickup & reservation settings</h2>
          <button onClick={() => action(async () => setSettings(await api(`${base}/settings`)))}>
            Load saved settings
          </button>
          {settings && (
            <>
              <p>
                Platform entitlements: ordering{' '}
                {settings.entitlements.ordering ? 'enabled' : 'disabled'}; reservations{' '}
                {settings.entitlements.reservations ? 'enabled' : 'disabled'}. Both a plan
                entitlement and owner configuration are required.
              </p>
              {['enabled', 'payAtPickup', 'reservations'].map((k) => (
                <label key={k} className="check-row">
                  <input
                    type="checkbox"
                    checked={settings.settings[k]}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        settings: { ...settings.settings, [k]: e.target.checked },
                      })
                    }
                  />
                  {k === 'enabled'
                    ? 'Enable pickup ordering'
                    : k === 'reservations'
                      ? 'Enable reservation requests'
                      : 'Allow pay at pickup'}
                </label>
              ))}
              <div className="form-grid">
                {[
                  'minimum',
                  'taxBps',
                  'serviceCharge',
                  'leadMinutes',
                  'capacity',
                  'durationMinutes',
                  'bufferMinutes',
                  'reservationLeadMinutes',
                  'advanceDays',
                  'maxParty',
                  'holdMinutes',
                ].map((k) => (
                  <label key={k}>
                    {
                      (
                        {
                          minimum: 'Minimum order',
                          taxBps: 'Tax rate',
                          serviceCharge: 'Service charge',
                          leadMinutes: 'Pickup lead time (minutes)',
                          capacity: 'Cover capacity',
                          durationMinutes: 'Reservation duration (minutes)',
                          bufferMinutes: 'Reservation buffer (minutes)',
                          reservationLeadMinutes: 'Reservation lead time (minutes)',
                          advanceDays: 'Advance booking window (days)',
                          maxParty: 'Maximum party size',
                          holdMinutes: 'Pending hold expiry (minutes)',
                        } as Record<string, string>
                      )[k]
                    }{' '}
                    {['minimum', 'serviceCharge'].includes(k)
                      ? '(minor units)'
                      : k === 'taxBps'
                        ? '(basis points)'
                        : ''}
                    <input
                      type="number"
                      value={settings.settings[k]}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          settings: { ...settings.settings, [k]: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  Slot interval
                  <select
                    aria-label="Slot interval"
                    value={settings.settings.slotMinutes}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        settings: { ...settings.settings, slotMinutes: e.target.value },
                      })
                    }
                  >
                    {['15', '30', '60'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              <h3>Reservation blackout intervals (UTC ISO timestamps)</h3>
              {settings.settings.blackouts.map((b: any, n: number) => (
                <div key={n} className="inline-fields">
                  {['start', 'end'].map((k) => (
                    <label key={k}>
                      {k}
                      <input
                        value={b[k]}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            settings: {
                              ...settings.settings,
                              blackouts: settings.settings.blackouts.map((v: any, i: number) =>
                                i === n ? { ...v, [k]: e.target.value } : v
                              ),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                  <button
                    onClick={() =>
                      setSettings({
                        ...settings,
                        settings: {
                          ...settings.settings,
                          blackouts: settings.settings.blackouts.filter(
                            (_: any, i: number) => i !== n
                          ),
                        },
                      })
                    }
                  >
                    Remove blackout
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setSettings({
                    ...settings,
                    settings: {
                      ...settings.settings,
                      blackouts: [
                        ...settings.settings.blackouts,
                        {
                          start: new Date().toISOString(),
                          end: new Date(Date.now() + 3600000).toISOString(),
                        },
                      ],
                    },
                  })
                }
              >
                Add blackout
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await api(`${base}/settings`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        version: settings.version,
                        settings: settings.settings,
                      }),
                    });
                    setSettings(await api(`${base}/settings`));
                  })
                }
              >
                Save operational settings
              </button>
            </>
          )}
        </section>
      )}
      {tab === 'Reports' && reports && (
        <section className="panel">
          <h2>Operations & collections</h2>
          <p>{reports.definition}</p>
          <p>Timezone: {reports.timezone}</p>
          <h3>Orders by creation date</h3>
          {!reports.orders.length && <p>No orders in this date range.</p>}
          {reports.orders.map((r: any, n: number) => (
            <p key={n}>
              {r.currency} · {r.status}: {r.count}
            </p>
          ))}
          <h3>Completed orders</h3>
          {reports.completed.map((r: any) => (
            <p key={r.currency}>
              {r.count} · {money(r.total, r.currency)}
            </p>
          ))}
          <h3>Collected payments by method</h3>
          {reports.collections.map((r: any, n: number) => (
            <p key={n}>
              {r.method} · {money(r.amount, r.currency)}
            </p>
          ))}
          <h3>Confirmed refunds</h3>
          {reports.refunds.map((r: any) => (
            <p key={r.currency}>{money(r.amount, r.currency)}</p>
          ))}
          <h3>Net collected</h3>
          {reports.netCollected.map((r: any) => (
            <p key={r.currency}>{money(r.amount, r.currency)}</p>
          ))}
          <h3>Average completed order value</h3>
          {reports.averageOrderValue.map((r: any) => (
            <p key={r.currency}>
              {money(r.amount, r.currency)} ({r.count} completed orders)
            </p>
          ))}
          <h3>Top dishes</h3>
          {reports.topItems.map((r: any, n: number) => (
            <p key={n}>
              {r.name} · {r.quantity} · {money(r.total, r.currency)}
            </p>
          ))}
          <h3>Reservations by start date</h3>
          {reports.reservations.map((r: any) => (
            <p key={r.status}>
              {r.status}: {r.count}
            </p>
          ))}
        </section>
      )}
      {tab === 'Notifications' && (
        <section className="panel">
          <h2>Notification delivery jobs</h2>
          {!jobs.length && <p>No notification jobs.</p>}
          {jobs.map((j) => (
            <article className="cart-row" key={j.id}>
              <strong>{j.kind}</strong>
              <p>
                {j.state} · {j.attempts} attempts · {j.last_error}
              </p>
              {j.state === 'FAILED' && (
                <button
                  onClick={() =>
                    action(async () => {
                      await api(`${base}/notifications/jobs/${j.id}/retry`, { method: 'POST' });
                      await load();
                    })
                  }
                >
                  Retry failed delivery
                </button>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
export function PlatformControls() {
  const [rows, setRows] = useState<any[]>([]),
    [plans, setPlans] = useState<any[]>([]),
    [message, setMessage] = useState(''),
    [reason, setReason] = useState(''),
    [offset, setOffset] = useState(0);
  async function load() {
    setRows(await api(`/platform/tenants?offset=${offset}`));
    setPlans(await api('/platform/plans'));
  }
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [offset]);
  async function update(id: string, body: any) {
    try {
      await api(`/platform/tenants/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...body, reason }),
      });
      await load();
      setMessage('Platform action recorded in audit history.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <main className="commerce-page">
      <h1>Platform tenant controls</h1>
      <Link href="/restaurants">Restaurant workspaces</Link>
      <p role="status">{message}</p>
      <p>
        Separate platform administrator assignment is required. Plans are manually managed; no
        subscription charges are created.
      </p>
      <label>
        Mandatory action reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {rows.map((r) => (
        <section className="panel" key={r.id}>
          <h2>{r.name}</h2>
          <p>
            {r.slug} · {r.status} · {r.plan_code ?? 'basic'} ·{' '}
            {r.subscription_status ?? 'unassigned'}
          </p>
          {['active', 'suspended'].map((status) => (
            <button
              disabled={reason.trim().length < 3}
              key={status}
              onClick={() => update(r.id, { status })}
            >
              {status === 'active' ? 'Activate / reactivate' : 'Suspend'} {r.name}
            </button>
          ))}
          {plans.map((p) => (
            <button
              disabled={reason.trim().length < 3}
              key={p.code}
              onClick={() => update(r.id, { plan: p.code, subscriptionStatus: 'manual' })}
            >
              Assign {p.name} plan
            </button>
          ))}
          <button
            onClick={async () => {
              try {
                const d = await api<any>(`/platform/tenants/${r.id}`);
                setMessage(
                  d.audit.map((a: any) => `${a.created_at}: ${a.metadata.reason}`).join(' · ') ||
                    'No platform status history.'
                );
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            View audit for {r.name}
          </button>
        </section>
      ))}
      <button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>
        Previous page
      </button>
      <button disabled={rows.length < 50} onClick={() => setOffset(offset + 50)}>
        Next page
      </button>
    </main>
  );
}
