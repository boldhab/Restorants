'use client';
import Link from 'next/link';
import { NavigationBar, NavigationLink } from '../navigation/navigation-bar';
import { VerifiedReview, PublicReviews } from '../operations/verified-review';
import { useEffect, useState, useRef } from 'react';
import { commerce, money } from '../../lib/commerce-client';
import { api, ApiError } from '../../lib/api-client';
const contactEmpty = { name: '', email: '', phone: '' };
export function CustomerShop({ restaurantId: id, page }: { restaurantId: string; page: string[] }) {
  const [session, setSession] = useState<any>(null),
    [cart, setCart] = useState<any>(null),
    [quote, setQuote] = useState<any>(null),
    [order, setOrder] = useState<any>(null),
    [history, setHistory] = useState<any[]>([]),
    [notifications, setNotifications] = useState<any[]>([]),
    [bookings, setBookings] = useState<any[]>([]),
    [slots, setSlots] = useState<any[]>([]),
    [contact, setContact] = useState(contactEmpty),
    [message, setMessage] = useState(''),
    [feedback, setFeedback] = useState('info'),
    [busy, setBusy] = useState(false),
    [party, setParty] = useState(2),
    [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10)),
    [slot, setSlot] = useState(''),
    [profile, setProfile] = useState<any>(null),
    [addresses, setAddresses] = useState(''),
    [coupon, setCoupon] = useState('');
  const [menu, setMenu] = useState<any>(null);
  const key = useRef('');
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => setUncertain(!!sessionStorage.getItem(`zq_checkout_${id}`)), [id]);
  const mode = page[0];
  async function load() {
    const s = await api<any>(`/commerce/${id}/session`);
    setSession(s);
    if (['cart', 'checkout'].includes(mode) && s.slug) {
      try {
        setMenu((await api<any>(`/public/restaurants/${s.slug}`)).draft);
      } catch {
        setMenu(null);
      }
    }
    if (mode === 'cart' || mode === 'checkout') {
      const current = await commerce<any>(id, '/cart');
      setCart(current);
      if (mode === 'checkout' && current.lines.length) {
        setQuote(await commerce(id, '/quotes', { method: 'POST' }));
        key.current = crypto.randomUUID();
      }
    }
    if (mode === 'orders' && page[1]) setOrder(await commerce(id, `/orders/${page[1]}`));
    if (mode === 'history') {
      setHistory(await commerce(id, '/orders'));
      setNotifications(await commerce(id, '/notifications'));
    }
    if (mode === 'reservations') setBookings(await commerce(id, '/reservations'));
  }
  useEffect(() => {
    load().catch((e) => {
      setFeedback('error');
      setMessage(e.message);
    });
    if (['orders', 'history', 'reservations'].includes(mode)) {
      const timer = setInterval(
        () =>
          load().catch((e) => {
            setFeedback('error');
            setMessage(e.message);
          }),
        5000
      );
      return () => clearInterval(timer);
    }
  }, [id, mode, page[1]]); // Refetch after interruptions; records remain authoritative.
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    setFeedback('info');
    try {
      await fn();
      setFeedback('success');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'QUOTE_CHANGED') {
        const replacement = (e.details as any)?.quote;
        if (replacement) {
          setQuote(replacement);
          key.current = crypto.randomUUID();
          sessionStorage.removeItem(`zq_checkout_${id}`);
          setUncertain(false);
        }
      }
      setFeedback('error');
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function requestQuote() {
    await action(async () => {
      setQuote(await commerce(id, '/quotes', { method: 'POST' }));
      key.current = crypto.randomUUID();
      setMessage('Review this server-calculated quote before confirming.');
    });
  }
  const contactFields = (
    <fieldset>
      <legend>Your contact details</legend>
      {(['name', 'email', 'phone'] as const).map((k) => (
        <label key={k}>
          {k.charAt(0).toUpperCase() + k.slice(1)}
          <input
            aria-label={'Contact ' + k}
            type={k === 'email' ? 'email' : 'text'}
            value={contact[k]}
            onChange={(e) => setContact({ ...contact, [k]: e.target.value })}
          />
        </label>
      ))}
    </fieldset>
  );
  return (
    <main className="commerce-page">
      <NavigationBar
        className="app-navigation customer-navigation"
        context={session?.name || 'Your restaurant visit'}
        label="Customer navigation"
      >
        <NavigationLink href={`/shop/${id}/cart`}>Cart</NavigationLink>
        {session?.ordering && (
          <NavigationLink href={`/shop/${id}/checkout`}>Checkout</NavigationLink>
        )}
        <NavigationLink href={`/shop/${id}/history`}>Your orders</NavigationLink>
        <NavigationLink href={`/shop/${id}/reservations`}>Reservations</NavigationLink>
        <NavigationLink href={`/shop/${id}/reviews`}>Verified reviews</NavigationLink>
        <NavigationLink href={`/shop/${id}/profile`}>Customer settings</NavigationLink>
      </NavigationBar>
      <p className="eyebrow">YOUR TABLE · YOUR TIME</p>
      <h1>
        {mode === 'orders'
          ? 'Your order'
          : mode === 'reservations'
            ? 'Plan a visit'
            : mode === 'profile'
              ? 'Your preferences'
              : mode === 'history'
                ? 'Your order history'
                : 'Your pickup cart'}
      </h1>
      {mode === 'reviews' && <PublicReviews restaurantId={id} />}
      {order?.status === 'COMPLETED' && <VerifiedReview restaurantId={id} orderId={order.id} />}
      {order?.delivery && <p>Delivery: {order.delivery.state.replaceAll('_', ' ')}</p>}
      <p role="status" data-tone={feedback} className={message ? 'notice' : undefined}>
        {message}
      </p>
      {uncertain && (
        <button
          disabled={busy}
          onClick={() =>
            action(async () => {
              const saved = sessionStorage.getItem(`zq_checkout_${id}`);
              if (!saved) throw new Error('No pending operation');
              const op = JSON.parse(saved);
              const r = await commerce<any>(id, '/orders', {
                method: 'POST',
                headers: { 'Idempotency-Key': op.key },
                body: JSON.stringify(op.operation),
              });
              sessionStorage.removeItem(`zq_checkout_${id}`);
              window.location.assign(`/shop/${id}/orders/${r.id}`);
            })
          }
        >
          Recover previous checkout submission
        </button>
      )}
      {['cart', 'checkout'].includes(mode) && cart?.operational_context?.mode === 'dine_in' && (
        <button
          disabled={busy || uncertain}
          onClick={() =>
            action(async () => {
              setCart(
                await commerce(id, '/context', {
                  method: 'POST',
                  body: JSON.stringify({ channel: 'online', mode: 'pickup' }),
                })
              );
              setQuote(null);
              setMessage('Your cart now uses pickup service. Review a fresh quote.');
            })
          }
        >
          Switch this cart to pickup
        </button>
      )}
      {['cart', 'checkout'].includes(mode) && (
        <section className="panel">
          <h2>Coupon</h2>
          <label>
            Coupon code
            <input value={coupon} onChange={(e) => setCoupon(e.target.value)} />
          </label>
          <button
            disabled={busy || uncertain}
            onClick={() =>
              action(async () => {
                await commerce(id, '/context', {
                  method: 'POST',
                  body: JSON.stringify({
                    ...cart?.operational_context,
                    coupon: coupon || undefined,
                  }),
                });
                setCart(await commerce(id, '/cart'));
                setQuote(await commerce(id, '/quotes', { method: 'POST' }));
                key.current = crypto.randomUUID();
                setMessage('Coupon evaluated by the restaurant pricing service.');
              })
            }
          >
            Apply coupon
          </button>
        </section>
      )}
      {['cart', 'checkout'].includes(mode) && (
        <section className="panel">
          {cart && !cart.lines.length && (
            <p>Your cart is empty. Return to the restaurant menu to choose a dish.</p>
          )}
          {cart?.issues.map((i: any) => (
            <p key={i.id} role="alert">
              {i.message}
            </p>
          ))}
          {cart?.lines.map((l: any) => (
            <article className="cart-row" key={l.id}>
              <h2>{l.name}</h2>
              <p>
                {l.variant?.name}
                {l.modifiers?.map((m: any) => ' · ' + m.name).join('')}
              </p>
              <p>
                {money(l.unit, l.currency ?? quote?.content.currency ?? 'USD')} per item (last added
                price; refresh quote for current prices)
              </p>
              <label>
                Quantity
                <input
                  aria-label={`Quantity for ${l.name}`}
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
                Remove {l.name}
              </button>
              <CartConfiguration
                line={l}
                item={menu?.items.find((i: any) => i.id === l.itemId)}
                busy={busy}
                onSave={(line: any) =>
                  action(async () => {
                    setCart(
                      await commerce(id, '/cart', {
                        method: 'PATCH',
                        body: JSON.stringify({ version: cart.version, line }),
                      })
                    );
                    setQuote(null);
                  })
                }
              />
            </article>
          ))}
          {cart?.lines.length > 0 && (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    setCart(
                      await commerce(id, '/cart', {
                        method: 'PATCH',
                        body: JSON.stringify({ version: cart.version, clear: true }),
                      })
                    );
                    setQuote(null);
                  })
                }
              >
                Clear cart
              </button>
              <button disabled={busy || !session?.ordering} onClick={requestQuote}>
                Calculate checkout quote
              </button>
            </>
          )}
          {!session?.ordering && session && (
            <p>This restaurant is not accepting new pickup orders.</p>
          )}
          {quote && (
            <div className="checkout-panel">
              <h2>Review your pickup order</h2>
              {quote.content.discount > 0 && (
                <p>Coupon discount: {money(quote.content.discount, quote.content.currency)}</p>
              )}
              <p>
                Pickup at {quote.content.pickupAddress} · {quote.content.pickupPhone}
              </p>
              {quote.content.lines.map((l: any) => (
                <p key={l.id}>
                  {l.quantity} × {l.name} — {money(l.lineTotal, quote.content.currency)}
                </p>
              ))}
              {['subtotal', 'tax', 'serviceCharge', 'deliveryFee', 'total'].map((k) => (
                <p key={k}>
                  {
                    (
                      {
                        subtotal: 'Subtotal',
                        tax: 'Tax',
                        serviceCharge: 'Service charge',
                        deliveryFee: 'Delivery fee',
                        total: 'Total',
                      } as Record<string, string>
                    )[k]
                  }
                  : <strong>{money(quote.content[k], quote.content.currency)}</strong>
                </p>
              ))}
              <p>
                Quote expires {new Date(quote.expires_at).toLocaleTimeString()}. Pickup preparation
                estimate: {quote.content.leadMinutes} minutes after acceptance.
              </p>
              {quote.content.warnings.map((w: string) => (
                <p key={w}>{w}</p>
              ))}
              {contactFields}
              <p>Payment: pay at pickup. Online payment is not configured.</p>
              <p>
                You may cancel while pending. After acceptance, staff must review cancellation
                requests; cancellation is unavailable once preparation starts.
              </p>
              <button
                className="button-primary"
                disabled={busy || !session.payAtPickup}
                onClick={() =>
                  action(async () => {
                    const operation = { quoteId: quote.id, contact, method: 'pay_at_pickup' };
                    const fingerprint = JSON.stringify(operation);
                    const storageKey = `zq_checkout_${id}`;
                    const existing = sessionStorage.getItem(storageKey);
                    let saved = existing ? JSON.parse(existing) : null;
                    if (saved && saved.fingerprint !== fingerprint)
                      throw new Error(
                        'Recover the previous checkout before changing its contact details or quote.'
                      );
                    if (!saved)
                      saved = { key: key.current || crypto.randomUUID(), fingerprint, operation };
                    sessionStorage.setItem(storageKey, JSON.stringify(saved));
                    setUncertain(true);
                    const r = await commerce<any>(id, '/orders', {
                      method: 'POST',
                      headers: { 'Idempotency-Key': saved.key },
                      body: JSON.stringify(saved.operation),
                    });
                    sessionStorage.removeItem(storageKey);
                    window.location.assign(`/shop/${id}/orders/${r.id}`);
                  })
                }
              >
                {busy ? 'Submitting…' : 'Place pickup order'}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const saved = sessionStorage.getItem(`zq_checkout_${id}`);
                    if (!saved) throw new Error('No uncertain checkout operation to recover');
                    const op = JSON.parse(saved);
                    const r = await commerce<any>(id, '/orders', {
                      method: 'POST',
                      headers: { 'Idempotency-Key': op.key },
                      body: JSON.stringify(op.operation),
                    });
                    sessionStorage.removeItem(`zq_checkout_${id}`);
                    window.location.assign(`/shop/${id}/orders/${r.id}`);
                  })
                }
              >
                Recover an uncertain submission
              </button>
            </div>
          )}
        </section>
      )}
      {mode === 'orders' && order && (
        <section className="panel">
          <h2>Order {order.reference}</h2>
          <p>
            Fulfillment:{' '}
            <strong>
              {
                (
                  {
                    PENDING: 'Order received',
                    CONFIRMED: 'Confirmed',
                    PREPARING: 'Preparing',
                    READY: 'Ready for pickup',
                    COMPLETED: 'Completed',
                    CANCELLED: 'Cancelled',
                    REJECTED: 'Rejected',
                    EXPIRED: 'Expired',
                  } as Record<string, string>
                )[order.status]
              }{' '}
              ({order.status})
            </strong>
          </p>
          <p>
            Payment: <strong>{order.paymentStatus}</strong> · {order.method}
          </p>
          <p>{money(order.total, order.currency)} · Pickup</p>
          <p>Preparation estimate: {order.preparationMinutes} minutes after acceptance.</p>
          <p>
            Pickup at {order.snapshot.pickupAddress} · {order.snapshot.pickupPhone}
          </p>
          {order.snapshot.lines.map((l: any) => (
            <p key={l.id}>
              {l.quantity} × {l.name} — {money(l.lineTotal, order.currency)}
            </p>
          ))}
          <ol>
            {order.history.map((h: any, n: number) => (
              <li key={n}>
                {h.status} · {new Date(h.created_at).toLocaleString()}
              </li>
            ))}
          </ol>
          {order.refunds.map((f: any) => (
            <p key={f.id}>
              Refund {money(f.amount, order.currency)}: {f.status}
            </p>
          ))}
          {order.cancellationRequested && <p>Cancellation requested — awaiting staff review.</p>}
          {['PENDING', 'CONFIRMED'].includes(order.status) && (
            <button
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await commerce(id, `/orders/${order.id}/cancellation`, { method: 'POST' });
                  await load();
                  setMessage('Cancellation processed or requested for staff review.');
                })
              }
            >
              Request cancellation
            </button>
          )}
          {order.method === 'test_online' &&
            ['PENDING', 'UNKNOWN', 'FAILED'].includes(order.paymentStatus) && (
              <>
                <p>
                  Payment is not yet confirmed. Reconciliation uses the original payment identity.
                </p>
                <button
                  onClick={() =>
                    action(async () => {
                      await commerce(id, `/orders/${order.id}/payment`, { method: 'POST' });
                      setMessage('Payment reconciliation requested.');
                    })
                  }
                >
                  Check payment status
                </button>
              </>
            )}
        </section>
      )}
      {mode === 'history' && (
        <section className="panel">
          {!history.length && <p>No orders in this browser or account for this restaurant.</p>}
          {history.map((o) => (
            <p key={o.id}>
              <Link href={`/shop/${id}/orders/${o.id}`}>{o.reference}</Link> · {o.status} ·{' '}
              {o.paymentStatus} · {money(o.total, o.currency)}
            </p>
          ))}
          <Link href="/customer/history">Account history across restaurants</Link>
          <h2>Updates</h2>
          {notifications.map((n: any, i: number) => (
            <p key={i}>
              {n.content.kind.replaceAll('.', ' ')} · {new Date(n.created_at).toLocaleString()}
            </p>
          ))}
        </section>
      )}
      {mode === 'reservations' && (
        <section className="panel">
          <h2>Request a reservation</h2>
          <p>
            Availability is for branch covers, not a specific table. Staff confirmation is required;
            pending requests hold capacity for a limited time.
          </p>
          <div className="inline-fields">
            <label>
              Date in {session?.timezone}
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSlots([]);
                  setSlot('');
                }}
              />
            </label>
            <label>
              Party size
              <input
                type="number"
                min={1}
                max={100}
                value={party}
                onChange={(e) => {
                  setParty(Number(e.target.value));
                  setSlots([]);
                  setSlot('');
                }}
              />
            </label>
            <button
              disabled={busy || !session?.reservations}
              onClick={() =>
                action(async () => {
                  const r = await commerce<any>(
                    id,
                    `/reservations/availability?date=${date}&party=${party}`
                  );
                  setSlots(r.slots);
                  if (!r.slots.length) setMessage('No available slots for this date and party.');
                })
              }
            >
              Find available times
            </button>
          </div>
          <label>
            Restaurant-local time
            <select
              aria-label="Reservation time"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
            >
              <option value="">Choose a time</option>
              {slots.map((s) => (
                <option key={s.start} value={s.start}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {contactFields}
          <button
            disabled={busy || !slot || !session?.reservations}
            onClick={() =>
              action(async () => {
                await commerce(id, '/reservations', {
                  method: 'POST',
                  body: JSON.stringify({ start: slot, party, contact }),
                });
                await load();
                setMessage('Reservation requested. Await staff confirmation.');
              })
            }
          >
            Request reservation
          </button>
          <h2>Your reservations</h2>
          {!bookings.length && <p>No reservations yet.</p>}
          {bookings.map((r) => (
            <article className="cart-row" key={r.id}>
              <h3>
                {r.reference} · {r.status}
              </h3>
              <p>
                {new Intl.DateTimeFormat('en', {
                  timeZone: session?.timezone,
                  dateStyle: 'full',
                  timeStyle: 'long',
                }).format(new Date(r.start))}{' '}
                · {r.party} guests
              </p>
              {['PENDING', 'CONFIRMED'].includes(r.status) && (
                <>
                  <button
                    className="button-danger"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await commerce(id, `/reservations/${r.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            version: r.version,
                            status: 'CANCELLED',
                            reason: 'Customer cancellation',
                          }),
                        });
                        await load();
                      })
                    }
                  >
                    Cancel reservation
                  </button>
                  <button
                    disabled={busy || !slot}
                    onClick={() =>
                      action(async () => {
                        await commerce(id, `/reservations/${r.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            version: r.version,
                            start: slot,
                            reason: 'Customer reschedule',
                          }),
                        });
                        await load();
                      })
                    }
                  >
                    Move to selected time
                  </button>
                </>
              )}
            </article>
          ))}
        </section>
      )}
      {mode === 'profile' && (
        <section className="panel">
          <button
            onClick={() =>
              action(async () => {
                const p = await commerce<any>(id, '/profile');
                setProfile(p);
                setAddresses(p.addresses.map((a: any) => a.label + ' | ' + a.address).join('\n'));
              })
            }
          >
            Load account preferences
          </button>
          {profile && (
            <>
              <label>
                Name
                <input
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                />
              </label>
              <label>
                Phone
                <input
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </label>
              <label>
                Saved addresses (label | address, one per line)
                <textarea
                  aria-label="Saved addresses"
                  value={addresses}
                  onChange={(e) => setAddresses(e.target.value)}
                />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={profile.transactionalEmail}
                  onChange={(e) => setProfile({ ...profile, transactionalEmail: e.target.checked })}
                />
                Transactional email updates (in-app history remains available)
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={profile.marketingConsent}
                  onChange={(e) => setProfile({ ...profile, marketingConsent: e.target.checked })}
                />
                Explicit marketing consent (marketing is not sent in this phase)
              </label>
              <button
                className="button-primary"
                onClick={() =>
                  action(async () => {
                    await commerce(id, '/profile', {
                      method: 'PATCH',
                      body: JSON.stringify({
                        ...profile,
                        addresses: addresses
                          .split('\n')
                          .filter(Boolean)
                          .map((line) => {
                            const [label, ...parts] = line.split('|');
                            return { label: label.trim(), address: parts.join('|').trim() };
                          }),
                      }),
                    });
                    setMessage('Preferences saved.');
                  })
                }
              >
                Save customer settings
              </button>
            </>
          )}
          <p>A verified account is required. Guest orders are never claimed by matching email.</p>
        </section>
      )}
    </main>
  );
}
export function AccountHistory() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState('');
  useEffect(() => {
    api('/customer/history')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="commerce-page">
      <h1>Your account history</h1>
      <p role="status">{error}</p>
      <Link href="/login">Sign in</Link>
      {data && (
        <>
          <h2>Orders</h2>
          {!data.orders.length && <p>No account orders yet.</p>}
          {data.orders.map((o: any) => (
            <p key={o.id}>
              <Link href={`/shop/${o.restaurantId}/orders/${o.id}`}>{o.reference}</Link> ·{' '}
              {o.status}
            </p>
          ))}
          <h2>Reservations</h2>
          {data.reservations.map((r: any) => (
            <p key={r.id}>
              <Link href={`/shop/${r.restaurantId}/reservations`}>{r.reference}</Link> · {r.status}
            </p>
          ))}
        </>
      )}
    </main>
  );
}

function CartConfiguration({
  line,
  item,
  busy,
  onSave,
}: {
  line: any;
  item: any;
  busy: boolean;
  onSave: (line: any) => void;
}) {
  const [variant, setVariant] = useState(line.variantId || ''),
    [options, setOptions] = useState<string[]>(line.options);
  return (
    <details>
      <summary>Change selected options</summary>
      {!item ? (
        <p>This dish is no longer publicly available. Remove it or contact the restaurant.</p>
      ) : (
        <>
          {item.variants.length > 0 && (
            <label>
              Variant
              <select
                aria-label={'Variant for ' + line.name}
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
              >
                {item.variants.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {item.modifiers.map((g: any) => (
            <fieldset key={g.id}>
              <legend>
                {g.name} · choose {g.min}–{g.max}
              </legend>
              {g.options.map((o: any) => (
                <label className="check-row" key={o.id}>
                  <input
                    type="checkbox"
                    disabled={!o.available}
                    checked={options.includes(o.id)}
                    onChange={(e) =>
                      setOptions(
                        e.target.checked ? [...options, o.id] : options.filter((id) => id !== o.id)
                      )
                    }
                  />
                  {o.name}
                </label>
              ))}
            </fieldset>
          ))}
          <button
            disabled={busy}
            onClick={() =>
              onSave({
                id: line.id,
                itemId: line.itemId,
                variantId: variant || undefined,
                options,
                quantity: line.quantity,
              })
            }
          >
            Update dish configuration
          </button>
        </>
      )}
    </details>
  );
}
