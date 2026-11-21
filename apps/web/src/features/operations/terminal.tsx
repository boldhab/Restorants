'use client';
import { SectionNavigation } from '../navigation/navigation-bar';
import { useEffect, useState, useRef } from 'react';
import { api, ApiError } from '../../lib/api-client';
import { commerce, money } from '../../lib/commerce-client';
export function OrderTerminal({
  restaurantId: id,
  channel,
  sessionId,
}: {
  restaurantId: string;
  channel: 'pos' | 'qr';
  sessionId?: string;
}) {
  const [menu, setMenu] = useState<any>(null),
    [cart, setCart] = useState<any>(null),
    [quote, setQuote] = useState<any>(null),
    [receipt, setReceipt] = useState<any>(null),
    [message, setMessage] = useState(''),
    [feedback, setFeedback] = useState('info'),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [contact, setContact] = useState({ name: '', email: '', phone: '' }),
    [mode, setMode] = useState(channel === 'qr' ? 'dine_in' : 'pickup'),
    [visit, setVisit] = useState(sessionId ?? ''),
    [coupon, setCoupon] = useState(''),
    [notes, setNotes] = useState(''),
    [allergies, setAllergies] = useState(''),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [visits, setVisits] = useState<any[]>([]),
    [customers, setCustomers] = useState<any[]>([]),
    [customerId, setCustomerId] = useState('');
  const key = useRef(''),
    store = `zq_terminal_${id}_${channel}`;
  async function context() {
    await commerce(id, '/context', {
      method: 'POST',
      body: JSON.stringify({
        channel,
        mode,
        customerId: customerId || undefined,
        serviceSessionId: mode === 'dine_in' ? visit : undefined,
        coupon: coupon || undefined,
        preparationNotes: notes,
        allergyNotes: allergies,
      }),
    });
  }
  async function load() {
    const s = await commerce<any>(id, '/session');
    setMenu((await api<any>(`/public/restaurants/${s.slug}`)).draft);
    setCart(await commerce(id, '/cart'));
    if (channel === 'pos') {
      const t = await api<any>(`/ops/${id}/tables`).catch(() => ({ tables: [] }));
      setVisits(t.tables.filter((v: any) => v.session_id));
      setCustomers(await api<any[]>(`/ops/${id}/pos/customers`).catch(() => []));
    }
    setPending(!!sessionStorage.getItem(store));
  }
  useEffect(() => {
    load().catch((e) => {
      setFeedback('error');
      setMessage(e.message);
    });
  }, [id]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      setFeedback('success');
    } catch (e) {
      setFeedback('error');
      setMessage((e as Error).message);
      if (e instanceof ApiError && e.status < 500 && e.status !== 409) {
        sessionStorage.removeItem(store);
        setPending(false);
      }
      if (e instanceof ApiError && e.code === 'QUOTE_CHANGED') {
        setQuote((e.details as any)?.quote);
        sessionStorage.removeItem(store);
        setPending(false);
      }
    } finally {
      setBusy(false);
    }
  }
  async function submit(recover = false) {
    await action(async () => {
      let operation: any;
      if (recover) {
        const saved = JSON.parse(sessionStorage.getItem(store) ?? 'null');
        if (!saved) throw new Error('No uncertain submission');
        operation = saved.operation;
        key.current = saved.key;
      } else {
        if (sessionStorage.getItem(store))
          throw new Error('Recover the original submission before creating another');
        operation = { quoteId: quote.id, contact, method: 'pay_at_pickup' };
        key.current = key.current || crypto.randomUUID();
        sessionStorage.setItem(store, JSON.stringify({ key: key.current, operation }));
        setPending(true);
      }
      const r = await commerce<any>(id, '/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': key.current },
        body: JSON.stringify(operation),
      });
      sessionStorage.removeItem(store);
      setPending(false);
      setReceipt(
        channel === 'pos'
          ? await api(`/ops/${id}/pos/orders/${r.id}`)
          : await commerce<any>(id, '/orders/' + r.id)
      );
      setCart(await commerce(id, '/cart'));
      setQuote(null);
      setMessage(
        'Order saved. Track preparation in the kitchen and settle this order in the cash session.'
      );
    });
  }
  return (
    <section>
      <p>
        Published menu · server prices ·{' '}
        {channel === 'qr' ? 'Dine-in visit' : 'POS online connection required'}
      </p>
      <p role="status" className={message ? 'notice' : undefined} data-tone={feedback}>
        {message}
      </p>
      {pending && (
        <button disabled={busy} onClick={() => submit(true)}>
          Recover original submission
        </button>
      )}
      {channel === 'pos' && (
        <div className="inline-fields">
          <label>
            Service mode
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setQuote(null);
              }}
            >
              <option value="pickup">Counter / takeaway</option>
              <option value="dine_in">Dine-in</option>
            </select>
          </label>
          {mode === 'dine_in' && (
            <label>
              Active table visit
              <select
                value={visit}
                onChange={(e) => {
                  setVisit(e.target.value);
                  setQuote(null);
                }}
              >
                <option value="">Select table</option>
                {visits.map((t) => (
                  <option key={t.session_id} value={t.session_id}>
                    {t.name} · {t.party} covers
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {channel === 'pos' && (
        <label>
          Customer account
          <select
            value={customerId}
            onChange={(e) => {
              const selected = customers.find((c) => c.id === e.target.value);
              setCustomerId(e.target.value);
              if (selected)
                setContact({
                  name: selected.full_name,
                  email: selected.email,
                  phone: selected.phone ?? '',
                });
              setQuote(null);
            }}
          >
            <option value="">Guest (no account association)</option>
            {customers
              .filter((c) => c.is_email_verified)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} · {c.email}
                </option>
              ))}
          </select>
        </label>
      )}
      <label>
        Search published menu
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <SectionNavigation label="Product categories" current={category}>
        <button aria-pressed={category === ''} onClick={() => setCategory('')}>
          All dishes
        </button>
        {menu?.categories.map((c: any) => (
          <button key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
            {c.name}
          </button>
        ))}
      </SectionNavigation>
      <div className="op-grid">
        {menu?.items
          .filter(
            (i: any) =>
              (!category || i.categoryId === category) &&
              i.name.toLowerCase().includes(search.toLowerCase())
          )
          .map((i: any) => (
            <form
              className="panel pos-product"
              data-selected={cart?.lines.some((line: any) => line.itemId === i.id)}
              key={i.id}
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                action(async () => {
                  await context();
                  const current = await commerce<any>(id, '/cart');
                  setCart(
                    await commerce(id, '/cart', {
                      method: 'PATCH',
                      body: JSON.stringify({
                        version: current.version,
                        line: {
                          itemId: i.id,
                          variantId: fd.get('variant') || undefined,
                          quantity: Number(fd.get('quantity')),
                          options: fd.getAll('option'),
                        },
                      }),
                    })
                  );
                  setQuote(null);
                });
              }}
            >
              <h2>{i.name}</h2>
              <p>{money(i.price, menu.settings.currency)}</p>
              {i.variants.length > 0 && (
                <label>
                  Variant
                  <select name="variant" required>
                    <option value="">Choose variant</option>
                    {i.variants.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {v.name} · {money(v.price, menu.settings.currency)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {i.modifiers.map((g: any) => (
                <fieldset key={g.id}>
                  <legend>
                    {g.name} · select {g.min}–{g.max}
                  </legend>
                  {g.options
                    .filter((o: any) => o.available)
                    .map((o: any) => (
                      <label key={o.id}>
                        <input type="checkbox" name="option" value={o.id} />
                        {o.name} + {money(o.price, menu.settings.currency)}
                      </label>
                    ))}
                </fieldset>
              ))}
              <label>
                Quantity
                <input name="quantity" type="number" defaultValue={1} min={1} max={20} />
              </label>
              <button className="button-primary" disabled={busy || pending}>
                Add {i.name}
              </button>
            </form>
          ))}
      </div>
      <section className="panel pos-cart">
        <h2>Current order</h2>
        {!cart?.lines.length && <p>No items yet.</p>}
        {cart?.lines.map((l: any) => (
          <article key={l.id}>
            <h3>
              {l.quantity} × {l.name}
            </h3>
            <p>
              {l.variant?.name} · {l.modifiers.map((m: any) => m.name).join(', ')}
            </p>
            <label>
              Order quantity
              <input
                type="number"
                min={1}
                max={20}
                value={l.quantity}
                onChange={(e) => {
                  const quantity = Number(e.target.value);
                  if (quantity >= 1 && quantity <= 20)
                    action(async () => {
                      setCart(
                        await commerce(id, '/cart', {
                          method: 'PATCH',
                          body: JSON.stringify({
                            version: cart.version,
                            line: {
                              id: l.id,
                              itemId: l.itemId,
                              variantId: l.variantId,
                              options: l.options,
                              quantity,
                            },
                          }),
                        })
                      );
                      setQuote(null);
                    });
                }}
              />
            </label>
            <button
              className="button-danger"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  setCart(
                    await commerce(id, '/cart', {
                      method: 'PATCH',
                      body: JSON.stringify({ version: cart.version, removeId: l.id }),
                    })
                  );
                  setQuote(null);
                })
              }
            >
              Remove item
            </button>
          </article>
        ))}
        <div className="inline-fields">
          <label>
            Coupon
            <input
              value={coupon}
              onChange={(e) => {
                setCoupon(e.target.value);
                setQuote(null);
              }}
            />
          </label>
          <label>
            Preparation notes
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setQuote(null);
              }}
            />
          </label>
          <label>
            Allergy-related notes
            <textarea
              value={allergies}
              onChange={(e) => {
                setAllergies(e.target.value);
                setQuote(null);
              }}
            />
          </label>
        </div>
        <button
          className="button-primary"
          disabled={busy || pending || !cart?.lines.length}
          onClick={() =>
            action(async () => {
              await context();
              setCart(await commerce(id, '/cart'));
              setQuote(await commerce(id, '/quotes', { method: 'POST' }));
              key.current = crypto.randomUUID();
            })
          }
        >
          Calculate server quote
        </button>
        {quote && (
          <>
            <h3>Confirm authoritative totals</h3>
            <p>
              Subtotal {money(quote.content.subtotal, quote.content.currency)} · discount{' '}
              {money(quote.content.discount ?? 0, quote.content.currency)} · tax{' '}
              {money(quote.content.tax, quote.content.currency)} · service{' '}
              {money(quote.content.serviceCharge, quote.content.currency)}
            </p>
            <strong>Total {money(quote.content.total, quote.content.currency)}</strong>
            {(['name', 'email', 'phone'] as const).map((k) => (
              <label key={k}>
                Customer {k}
                <input
                  type={k === 'email' ? 'email' : 'text'}
                  value={contact[k]}
                  onChange={(e) => setContact({ ...contact, [k]: e.target.value })}
                />
              </label>
            ))}
            <button className="button-primary" disabled={busy || pending} onClick={() => submit()}>
              Submit {channel === 'qr' ? 'table' : 'POS'} order
            </button>
          </>
        )}
      </section>
      {receipt && (
        <section className="panel op-receipt">
          <h2>Receipt · {receipt.reference}</h2>
          <p>Order ID: {receipt.id}</p>
          {receipt.snapshot.lines.map((l: any) => (
            <p key={l.id}>
              {l.quantity} × {l.name} · {money(l.discountedTotal ?? l.lineTotal, receipt.currency)}
            </p>
          ))}
          <p>
            Total {money(receipt.total, receipt.currency)} · {receipt.paymentStatus} ·{' '}
            {receipt.status}
          </p>
          <button onClick={() => window.print()}>Print receipt</button>
          <p>Browser printing; hardware delivery is not verified.</p>
          <a
            href={
              channel === 'pos' ? `/workspace/${id}/operations` : `/shop/${id}/orders/${receipt.id}`
            }
          >
            {channel === 'pos' ? 'Open order operations' : 'Track this order'}
          </a>
        </section>
      )}
    </section>
  );
}
