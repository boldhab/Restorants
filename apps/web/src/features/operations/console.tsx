'use client';
import Link from 'next/link';
import { NavigationBar, NavigationLink } from '../navigation/navigation-bar';
import QRCode from 'qrcode';
import { useEffect, useState, useRef, useId, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api-client';
import { money } from '../../lib/commerce-client';
import { operationDefaults, operationalRoles } from '@zayqora/contracts';
import { OrderTerminal } from './terminal';
import { RecipeEditor } from './recipe-editor';
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { id: string; name: string }[];
  value?: any;
  required?: boolean;
};
export function ActionForm({
  title,
  fields,
  submit,
  button = 'Save',
  storageKey,
}: {
  title: string;
  fields: Field[];
  submit: (data: any) => Promise<void>;
  button?: string;
  storageKey?: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const original = useRef<any>(null);
  const requestKey = useRef('');
  const [recover, setRecover] = useState(false);
  useEffect(() => {
    if (storageKey) {
      const value = sessionStorage.getItem(storageKey);
      if (value) {
        original.current = JSON.parse(value);
        setRecover(true);
      }
    }
  }, [storageKey]);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const values = new FormData(e.currentTarget);
    const data: any = {};
    for (const f of original.current ? [] : fields) {
      const v = values.get(f.name);
      if (!v && f.required === false) {
        delete data[f.name];
        continue;
      }
      if (f.type === 'multi') {
        data[f.name] = values.getAll(f.name);
        continue;
      }
      data[f.name] = f.type === 'number' ? Number(v) : f.type === 'checkbox' ? v === 'on' : v;
      if (f.type === 'datetime-local') data[f.name] = new Date(String(v)).toISOString();
      if (!v && f.required === false) delete data[f.name];
    }
    try {
      if (!original.current) {
        requestKey.current = crypto.randomUUID();
        original.current = { ...data, __operationKey: requestKey.current };
        if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(original.current));
      }
      await submit(original.current);
      original.current = null;
      setRecover(false);
      if (storageKey) sessionStorage.removeItem(storageKey);
      setMessage('Saved.');
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        original.current = null;
        setRecover(false);
        if (storageKey) sessionStorage.removeItem(storageKey);
      } else setRecover(true);
      setMessage(
        (e as Error).message +
          (original.current ? ' — Submit again to recover the original request.' : '')
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel op-form" noValidate={recover} onSubmit={send}>
      <h2>{title}</h2>
      <div className="inline-fields">
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.options ? (
              <select
                aria-label={f.label}
                name={f.name}
                multiple={f.type === 'multi'}
                defaultValue={f.value ?? (f.type === 'multi' ? [] : '')}
                required={f.required !== false}
              >
                <option value="">Choose…</option>
                {f.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea
                aria-label={f.label}
                name={f.name}
                defaultValue={f.value ?? ''}
                required={f.required !== false}
              />
            ) : (
              <input
                aria-label={f.label}
                name={f.name}
                type={f.type ?? 'text'}
                defaultValue={f.type === 'checkbox' ? undefined : f.value}
                defaultChecked={f.type === 'checkbox' ? f.value : undefined}
                required={f.type === 'checkbox' ? false : f.required !== false}
                step={f.type === 'number' ? 1 : undefined}
              />
            )}
          </label>
        ))}
      </div>
      <button className="button-primary" disabled={busy}>
        {busy ? 'Saving…' : recover ? 'Recover original request' : button}
      </button>
      <p role="status" data-tone={message === 'Saved.' ? 'success' : message ? 'error' : undefined}>
        {message}
      </p>
    </form>
  );
}
const operationalGroups = [
  {
    title: 'Service & Counter',
    items: [
      { id: 'pos', label: 'POS', permission: 'pos.create' },
      { id: 'kitchen', label: 'Kitchen', permission: 'kitchen.read' },
      { id: 'tables', label: 'Tables', permission: 'tables.manage' },
      { id: 'cash', label: 'Cash sessions', permission: 'cash_sessions.manage' },
    ],
  },
  {
    title: 'Fulfillment',
    items: [
      { id: 'delivery', label: 'Dispatch', permission: 'delivery.assign' },
      { id: 'deliveries', label: 'My deliveries', permission: 'delivery.update_assigned' },
    ],
  },
  {
    title: 'Management',
    items: [
      { id: 'staff', label: 'Staff', permission: 'staff.manage' },
      { id: 'inventory', label: 'Inventory', permission: 'inventory.adjust' },
      { id: 'coupons', label: 'Coupons', permission: 'coupons.manage' },
      { id: 'customers', label: 'Customers', permission: 'customers.read' },
      { id: 'reviews', label: 'Reviews', permission: 'reviews.manage' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { id: 'reports', label: 'Reports & exports', permission: 'exports.generate' },
      { id: 'settings', label: 'Setup', permission: 'operations.configure' },
    ],
  },
] as const;

const tabs: [string, string, string][] = operationalGroups.flatMap((group) =>
  group.items.map((item) => [item.id, item.label, item.permission] as [string, string, string])
);

function OperationNavIcon({ id }: { id: string }) {
  switch (id) {
    case 'pos':
      return (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      );
    case 'kitchen':
      return (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
          <line x1="6" y1="17" x2="18" y2="17" />
        </svg>
      );
    case 'tables':
      return (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      );
    case 'cash':
      return (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
      );
    case 'delivery':
      return (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="16.5 9.4 7.5 4.21" />
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case 'deliveries':
      return (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="18.5" cy="17.5" r="3.5" />
          <circle cx="5.5" cy="17.5" r="3.5" />
          <circle cx="15" cy="5" r="1" />
          <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
        </svg>
      );
    case 'staff':
      return (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'inventory':
      return (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <path d="M9 12h6M9 16h6" />
        </svg>
      );
    case 'coupons':
      return (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <path d="M9 9h.01M15 15h.01M15 9l-6 6" />
        </svg>
      );
    case 'customers':
      return (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'reviews':
      return (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case 'reports':
      return (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case 'settings':
      return (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    default:
      return null;
  }
}
const reason = { name: 'reason', label: 'Reason', value: 'Operational action' };
export function OperationsConsole({
  restaurantId: id,
  view,
}: {
  restaurantId: string;
  view: string;
}) {
  const [context, setContext] = useState<any>(null),
    [data, setData] = useState<any>(null),
    [message, setMessage] = useState(''),
    [connection, setConnection] = useState('Connecting'),
    [selection, setSelection] = useState<any>(null),
    [extra, setExtra] = useState<any>(null),
    [sound, setSound] = useState(false),
    [filter, setFilter] = useState(''),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState(''),
    [qrImage, setQrImage] = useState(''),
    [navigationOpen, setNavigationOpen] = useState(false),
    [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigationToggle = useRef<HTMLButtonElement>(null);
  const navigationId = useId();
  const count = useRef(0);
  const latestPoll = useRef(0);
  useEffect(() => {
    if (extra?.path)
      QRCode.toDataURL(location.origin + extra.path, {
        width: 280,
        margin: 4,
        errorCorrectionLevel: 'M',
      })
        .then(setQrImage)
        .catch((e) => setMessage(e.message));
    else setQrImage('');
  }, [extra?.path]);
  const base = `/ops/${id}`;
  const endpoint: Record<string, string> = {
    staff: 'staff',
    kitchen: 'kitchen',
    tables: 'tables',
    cash: 'cash',
    delivery: 'delivery',
    deliveries: 'deliveries',
    inventory: 'inventory',
    coupons: 'coupons',
    customers: 'customers',
    reviews: 'reviews',
    reports: 'exports',
    settings: 'settings',
  };
  async function load() {
    const poll = ++latestPoll.current;
    try {
      const c = await api<any>(base + '/context');
      if (poll !== latestPoll.current) return;
      setContext(c);
      if (view === 'pos') {
        setConnection('Connected · server pricing');
        return;
      }
      const query =
        view === 'kitchen'
          ? '?offset=' + offset + (filter ? '&stationId=' + filter : '')
          : view === 'customers'
            ? `?offset=${offset}&search=${encodeURIComponent(search)}`
            : '';
      const d = await api<any>(base + '/' + endpoint[view] + query);
      if (poll !== latestPoll.current) return;
      setData(d);
      if (view === 'kitchen' && sound && d.work.length > count.current) {
        const AudioCtor = (window as any).AudioContext;
        if (AudioCtor) {
          const ac = new AudioCtor(),
            o = ac.createOscillator(),
            g = ac.createGain();
          g.gain.value = 0.04;
          o.connect(g);
          g.connect(ac.destination);
          o.start();
          o.stop(ac.currentTime + 0.12);
          o.onended = () => ac.close();
        }
      }
      count.current = d.work?.length ?? 0;
      setConnection('Connected · refreshed ' + new Date().toLocaleTimeString());
    } catch (e) {
      if (poll === latestPoll.current) throw e;
    }
  }
  useEffect(() => {
    let active = true;
    const update = () =>
      load().catch((e) => {
        if (active) {
          setData(null);
          setSelection(null);
          setMessage(e.message);
          setConnection('Disconnected or access revoked · retrying');
        }
      });
    update();
    const t = setInterval(update, 5000);
    window.addEventListener('online', update);
    return () => {
      active = false;
      latestPoll.current++;
      clearInterval(t);
      window.removeEventListener('online', update);
    };
  }, [id, view, filter, offset, search, sound]);
  async function post(
    path: string,
    body: any,
    method = 'POST',
    operationKey = crypto.randomUUID()
  ) {
    const r = await api<any>(base + path, {
      method,
      headers: { 'Idempotency-Key': operationKey },
      body: JSON.stringify(body),
    });
    await load();
    return r;
  }
  async function action(fn: () => Promise<unknown>) {
    try {
      await fn();
      setMessage('Saved after server acknowledgement.');
    } catch (e) {
      setMessage((e as Error).message);
      await load().catch(() => {});
    }
  }
  const form = (
    title: string,
    path: string,
    fields: Field[],
    transform = (v: any) => v,
    method = 'POST'
  ) => (
    <ActionForm
      title={title}
      storageKey={`zq_form:${base}${path}:${title}`}
      fields={fields}
      submit={async (v) => {
        const opKey = v.__operationKey;
        const values = { ...v };
        delete values.__operationKey;
        const transformed = transform(values);
        if (transformed.key && !transformed.orderId && !transformed.refundId)
          transformed.key = opKey;
        const r = await post(path, transformed, method, opKey);
        if (r.activation || r.path) setExtra(r);
      }}
    />
  );
  const options = (rows: any[] = []) =>
    rows.map((r) => ({ id: r.id, name: r.name ?? r.reference ?? r.email ?? r.id }));
  const permitted = (p: string) => context?.permissions?.includes(p);
  return (
    <div className={`operations-workspace ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar operations-sidebar" aria-label="Operations sidebar">
        <div className="sidebar-heading">
          <Link href="/restaurants" className="wordmark" aria-label="ZAYQORA workspaces">
            zayqora<span aria-hidden="true">✳</span>
          </Link>
          <button
            ref={navigationToggle}
            className="workspace-nav-toggle operations-nav-toggle"
            aria-expanded={navigationOpen}
            aria-controls={navigationId}
            onClick={() => setNavigationOpen(!navigationOpen)}
          >
            Operations menu
          </button>
        </div>

        <div className="operations-sidebar-header">
          <p className="eyebrow">DAILY OPERATIONS</p>
          <Link href={`/workspace/${id}/dashboard`} className="back-link">
            ← Workspace
          </Link>
        </div>

        <div
          className="workspace-navigation-panel operations-nav-panel"
          id={navigationId}
          data-open={navigationOpen}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setNavigationOpen(false);
              navigationToggle.current?.focus();
            }
          }}
        >
          <nav aria-label="Daily operations navigation" className="operations-nav">
            {operationalGroups.map((group) => {
              const visibleItems = group.items.filter((item) => permitted(item.permission));
              if (visibleItems.length === 0) return null;
              return (
                <div key={group.title} className="operations-nav-group">
                  <span className="operations-nav-group-title">{group.title}</span>
                  {visibleItems.map((item) => {
                    const isActive = view === item.id;
                    return (
                      <Link
                        key={item.id}
                        href={`/operations/${id}/${item.id}`}
                        aria-current={isActive ? 'page' : undefined}
                        className={isActive ? 'active' : ''}
                        title={item.label}
                        aria-label={item.label}
                        onClick={() => setNavigationOpen(false)}
                      >
                        <span className="nav-icon" aria-hidden="true">
                          <OperationNavIcon id={item.id} />
                        </span>
                        <span className="nav-label">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          <div className="sidebar-bottom operations-sidebar-bottom">
            <div className="operations-status-indicator">
              <span className="operations-status-dot" aria-hidden="true" />
              <span className="operations-status-text">{connection.split('·')[0].trim()}</span>
            </div>
            <Link href={`/workspace/${id}/operations`} className="secondary-link">
              Orders & reservations ↗
            </Link>
          </div>
        </div>
      </aside>

      <div className="operations-body">
        <NavigationBar className="app-navigation" context="Daily operations">
          <NavigationLink href={`/workspace/${id}/dashboard`}>← Workspace</NavigationLink>
          <NavigationLink href={`/workspace/${id}/operations`}>
            Orders & reservations
          </NavigationLink>
        </NavigationBar>

        <main className="commerce-page op-console">
          <div className="op-console-header">
            <div>
              <p className="eyebrow">ZAYQORA · DAILY SERVICE</p>
              <h1>{tabs.find((t) => t[0] === view)?.[1] ?? 'Operations'}</h1>
            </div>
            <button
              type="button"
              className="sidebar-collapse-btn"
              aria-expanded={!sidebarCollapsed}
              aria-controls={navigationId}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? '⇥ Expand menu' : '⇤ Collapse menu'}
            </button>
          </div>
          <p role="status">{connection}</p>
          <p
            role={message === 'Saved after server acknowledgement.' ? 'status' : 'alert'}
            className={message ? 'notice' : undefined}
            data-tone={message === 'Saved after server acknowledgement.' ? 'success' : 'error'}
          >
            {message}
          </p>
          {!context && <p>Loading secure workspace…</p>}
          {data &&
            ((Array.isArray(data) && data.length === 0) ||
              (view === 'tables' && data.tables?.length === 0) ||
              (view === 'inventory' && data.ingredients?.length === 0)) && (
              <p>No records yet. Create your first entry using the controls below.</p>
            )}
          {context && !permitted(tabs.find((t) => t[0] === view)?.[2] ?? '') && (
            <p>This role has no permission to open this screen.</p>
          )}
          {extra && (
            <section className="panel" role="status">
              <h2>Share with this visit only</h2>
              {extra.activation && (
                <p>
                  Activation code: <strong>{extra.activation}</strong>
                </p>
              )}
              {extra.path && (
                <>
                  <p>Print this table reference:</p>
                  {qrImage && (
                    <img src={qrImage} width={280} height={280} alt="Scannable table QR code" />
                  )}
                  <Link href={extra.path}>{extra.path}</Link>
                  <button onClick={() => window.print()}>Print table reference</button>
                </>
              )}
              <button onClick={() => setExtra(null)}>Dismiss</button>
            </section>
          )}
          {view === 'pos' && permitted('pos.create') && (
            <OrderTerminal restaurantId={id} channel="pos" />
          )}
          {data &&
            view === 'settings' &&
            form(
              'Enable configured features',
              '/settings',
              Object.keys(operationDefaults).map((k) => ({
                name: k,
                label: k.charAt(0).toUpperCase() + k.slice(1),
                type: 'checkbox',
                value: data.content[k],
              })),
              (v) => v,
              'PATCH'
            )}
          {data && view === 'staff' && (
            <>
              {form(
                'Invite a staff member',
                '/staff/invitations',
                [
                  { name: 'email', label: 'Email', type: 'email' },
                  {
                    name: 'role',
                    label: 'Role',
                    options: operationalRoles.map((r) => ({ id: r, name: r })),
                  },
                ],
                (v) => ({ ...v, branchId: context.branchId })
              )}
              <section className="op-grid">
                {data.members.map((m: any) => (
                  <article className="panel" key={m.id}>
                    <h2>{m.full_name}</h2>
                    <p>
                      {m.email} · {m.roles.join(', ')} · {m.status}
                    </p>
                    {form(
                      'Change membership',
                      '/staff/' + m.id,
                      [
                        {
                          name: 'role',
                          label: 'New role',
                          options: operationalRoles.map((r) => ({ id: r, name: r })),
                          value: m.roles[0],
                        },
                        {
                          name: 'active',
                          label: 'Active',
                          type: 'checkbox',
                          value: m.status === 'active',
                        },
                        reason,
                      ],
                      (v) => v,
                      'PATCH'
                    )}
                  </article>
                ))}
              </section>
              <h2>Invitations</h2>
              {data.invitations.map((i: any) => (
                <article className="panel" key={i.id}>
                  <p>
                    {i.email} · {i.role} · expires {new Date(i.expires_at).toLocaleString()} ·{' '}
                    {i.consumed_at ? 'Accepted' : i.revoked_at ? 'Revoked' : 'Pending'}
                  </p>
                  {!i.consumed_at && (
                    <>
                      <button
                        onClick={() =>
                          action(() =>
                            post(`/staff/invitations/${i.id}/resend`, {
                              reason: 'Staff requested resend',
                            })
                          )
                        }
                      >
                        Resend
                      </button>
                      <button
                        className="button-danger"
                        onClick={() =>
                          action(() =>
                            post(`/staff/invitations/${i.id}/revoke`, {
                              reason: 'Invitation revoked by manager',
                            })
                          )
                        }
                      >
                        Revoke
                      </button>
                    </>
                  )}
                </article>
              ))}
            </>
          )}
          {data && view === 'kitchen' && (
            <>
              <div className="inline-fields">
                <label>
                  Station filter
                  <select
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="">All assigned stations</option>
                    {data.stations.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={sound}
                    onChange={(e) => setSound(e.target.checked)}
                  />
                  Enable sound alerts
                </label>
              </div>
              {!data.work.length && <p>No preparation work at your assigned stations.</p>}
              <div className="inline-fields">
                <button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 300))}>
                  Previous kitchen page
                </button>
                <button disabled={!data.hasMore} onClick={() => setOffset(offset + 300)}>
                  Next kitchen page
                </button>
                <button onClick={() => setOffset(0)}>Newest queue overview</button>
              </div>
              <section className="op-grid">
                {data.work
                  .filter(
                    (w: any) =>
                      w.state !== 'CANCELLED' || Date.now() - Date.parse(w.created_at) < 86400000
                  )
                  .map((w: any) => (
                    <article
                      className={
                        'panel kitchen-card ' + (w.state === 'CANCELLED' ? 'cancelled' : '')
                      }
                      key={w.id}
                      data-testid={`kitchen-work-${w.id}`}
                      data-state={w.state}
                      data-delayed={!!w.delay_reason && w.state !== 'CANCELLED'}
                    >
                      <p className="eyebrow">
                        {w.station} · {w.fulfillment}
                      </p>
                      <h2>{w.reference}</h2>
                      <h3>
                        {w.snapshot.quantity} × {w.snapshot.name}
                      </h3>
                      <p>
                        {w.snapshot.variant?.name}{' '}
                        {w.snapshot.modifiers?.map((m: any) => m.name).join(' · ')}
                      </p>
                      <p>
                        Received {new Date(w.created_at).toLocaleTimeString()} ·{' '}
                        {Math.floor((Date.now() - Date.parse(w.created_at)) / 60000)} min elapsed
                      </p>
                      <p>
                        <strong className="work-state">{w.state}</strong>
                        {w.delay_reason
                          ? (w.state === 'CANCELLED' ? ' · Cancellation: ' : ' · Delay: ') +
                            w.delay_reason
                          : ''}
                      </p>
                      {w.preparation_notes && <p>Preparation: {w.preparation_notes}</p>}
                      {w.snapshot.allergens && (
                        <p className="notice warning allergy-note">
                          <strong>MENU ALLERGENS:</strong> {w.snapshot.allergens}
                        </p>
                      )}
                      {w.allergy_notes && (
                        <p className="notice warning allergy-note">
                          <strong>ALLERGY ALERT:</strong> {w.allergy_notes}
                        </p>
                      )}
                      {w.table_id && <p>Table: {w.table_name ?? 'Assigned table'}</p>}
                      {['WAITING', 'PREPARING'].includes(w.state) && (
                        <button
                          className="button-primary"
                          onClick={() =>
                            action(() =>
                              post(`/kitchen/work/${w.id}`, {
                                version: w.version,
                                action: w.state === 'WAITING' ? 'start' : 'ready',
                                reason: 'Station preparation update',
                              })
                            )
                          }
                        >
                          {w.state === 'WAITING' ? 'Start preparation' : 'Mark work ready'}
                        </button>
                      )}
                      {form(
                        'Delay or correction',
                        `/kitchen/work/${w.id}`,
                        [
                          {
                            name: 'action',
                            label: 'Action',
                            options: [
                              { id: 'delay', name: 'Flag delay' },
                              ...(permitted('kitchen.correct')
                                ? [{ id: 'reopen', name: 'Reopen ready work' }]
                                : []),
                            ],
                          },
                          reason,
                        ],
                        (v) => ({ ...v, version: w.version })
                      )}
                    </article>
                  ))}
              </section>
              {permitted('kitchen.configure') && (
                <>
                  {form('Create station', '/kitchen/stations', [
                    { name: 'name', label: 'Station name' },
                  ])}
                  {form(
                    'Route published item',
                    '/kitchen/routing',
                    [
                      {
                        name: 'itemId',
                        label: 'Published item',
                        options: options(context?.catalog?.items),
                      },
                      {
                        name: 'stationIds',
                        type: 'multi',
                        label: 'Required stations',
                        options: options(context?.catalog?.stations),
                      },
                    ],
                    (v) => ({ itemId: v.itemId, stationIds: v.stationIds })
                  )}
                  {form('Assign station access', '/kitchen/access', [
                    {
                      name: 'membershipId',
                      label: 'Staff member',
                      options: context?.catalog?.roster.map((r: any) => ({
                        id: r.membership_id,
                        name: r.name,
                      })),
                    },
                    {
                      name: 'stationId',
                      label: 'Station',
                      options: options(context?.catalog?.stations),
                    },
                  ])}
                </>
              )}
            </>
          )}
          {data && view === 'tables' && (
            <>
              {form('Create dining area', '/areas', [{ name: 'name', label: 'Area name' }])}
              {form('Add table', '/tables', [
                { name: 'areaId', label: 'Dining area', options: options(data.areas) },
                { name: 'name', label: 'Table name' },
                { name: 'seats', label: 'Seats', type: 'number', value: 2 },
              ])}
              <section className="op-grid">
                {data.tables.map((t: any) => (
                  <article
                    className="panel table-card"
                    data-occupancy={
                      t.session_id
                        ? 'occupied'
                        : t.cleaning
                          ? 'cleaning'
                          : t.blocked_reason || !t.active
                            ? 'blocked'
                            : 'available'
                    }
                    key={t.id}
                  >
                    <h2>
                      {t.name} · {t.seats} seats
                    </h2>
                    <p>
                      {t.session_id
                        ? 'Occupied'
                        : t.cleaning
                          ? 'Ready for cleaning'
                          : t.blocked_reason
                            ? 'Blocked: ' + t.blocked_reason
                            : !t.active
                              ? 'Inactive'
                              : 'Available'}
                    </p>
                    {t.session_id ? (
                      <>
                        <p>
                          Party {t.party} · expected departure{' '}
                          {new Date(t.expected_end).toLocaleString()}
                        </p>
                        <button
                          onClick={() =>
                            action(async () =>
                              setSelection(await api(base + '/visits/' + t.session_id))
                            )
                          }
                        >
                          Open bill
                        </button>
                        {form(
                          'Update visit',
                          '/visits/' + t.session_id,
                          [
                            {
                              name: 'action',
                              label: 'Action',
                              options: [
                                { id: 'move', name: 'Move table' },
                                { id: 'extend', name: 'Extend visit' },
                                { id: 'close', name: 'Close settled visit' },
                              ],
                            },
                            {
                              name: 'tableId',
                              label: 'Destination table',
                              options: options(data.tables),
                              required: false,
                            },
                            {
                              name: 'expectedEnd',
                              label: 'Expected departure',
                              type: 'datetime-local',
                              required: false,
                            },
                            reason,
                          ],
                          (v) => ({ ...v, version: t.version })
                        )}
                      </>
                    ) : (
                      <>
                        {form(
                          'Seat guests',
                          '/visits',
                          [
                            { name: 'party', label: 'Party size', type: 'number', value: 2 },
                            {
                              name: 'expectedEnd',
                              label: 'Expected departure',
                              type: 'datetime-local',
                            },
                            {
                              name: 'reservationId',
                              label: 'Confirmed reservation (optional)',
                              options: options(context?.catalog?.reservations),
                              required: false,
                            },
                            {
                              name: 'waiterId',
                              label: 'Waiter (optional)',
                              options: options(context?.catalog?.roster),
                              required: false,
                            },
                          ],
                          (v) => ({ ...v, tableId: t.id })
                        )}
                        {form(
                          'Table availability',
                          '/tables/' + t.id,
                          [
                            { name: 'active', label: 'Active', type: 'checkbox', value: t.active },
                            {
                              name: 'cleaning',
                              label: 'Needs cleaning',
                              type: 'checkbox',
                              value: t.cleaning,
                            },
                            { name: 'blockedReason', label: 'Block reason', required: false },
                            reason,
                          ],
                          (v) => ({ ...v, blockedReason: v.blockedReason ?? null }),
                          'PATCH'
                        )}
                      </>
                    )}
                    <button
                      onClick={() =>
                        action(async () => setExtra(await post('/tables/' + t.id + '/qr', {})))
                      }
                    >
                      Rotate printed QR reference
                    </button>
                  </article>
                ))}
              </section>
              {selection && (
                <section className="panel">
                  <h2>Visit bill</h2>
                  {selection.orders.map((o: any) => (
                    <p key={o.id}>
                      {o.reference} · {money(o.total, o.currency)} · {o.status} · {o.payment_status}
                    </p>
                  ))}
                  <p>Settle each outstanding order in Cash sessions. No new sale is created.</p>
                  <button onClick={() => setSelection(null)}>Close bill view</button>
                </section>
              )}
            </>
          )}
          {data && view === 'cash' && (
            <>
              {permitted('refunds.request') &&
                form(
                  'Request item refund',
                  '/refunds/lines',
                  [
                    {
                      name: 'orderItemId',
                      label: 'Original collected order item',
                      options: options(context?.catalog?.refundItems),
                    },
                    { name: 'quantity', label: 'Refund quantity', type: 'number', value: 1 },
                    reason,
                  ],
                  (v) => ({
                    orderId: context.catalog.refundItems.find((i: any) => i.id === v.orderItemId)
                      ?.order_id,
                    lines: [{ orderItemId: v.orderItemId, quantity: v.quantity }],
                    reason: v.reason,
                  })
                )}
              {permitted('refunds.request') && (
                <p>
                  Item refunds use the original discount and allocated tax. Requesting a refund does
                  not return drawer cash until it is disbursed.
                </p>
              )}

              {form('Create register', '/cash/registers', [
                { name: 'name', label: 'Register name' },
              ])}
              {form('Open cash session', '/cash/sessions', [
                { name: 'registerId', label: 'Register', options: options(data.registers) },
                { name: 'opening', label: 'Opening float (minor units)', type: 'number', value: 0 },
              ])}
              {data.sessions.map((s: any) => (
                <article className="panel" key={s.id}>
                  <h2>
                    {s.status} · {new Date(s.created_at).toLocaleString()}
                  </h2>
                  <p>
                    Opening {money(s.opening, s.currency)}
                    {s.status === 'CLOSED'
                      ? ` · Expected ${money(s.expected, s.currency)} · Counted ${money(s.counted, s.currency)} · Variance ${money(s.variance, s.currency)}`
                      : ''}
                  </p>
                  <button
                    onClick={() =>
                      action(async () => setSelection(await api(base + '/cash/sessions/' + s.id)))
                    }
                  >
                    Inspect ledger
                  </button>
                  {s.status === 'OPEN' && (
                    <>
                      {form(
                        'Collect order',
                        '/cash/sessions/' + s.id,
                        [
                          {
                            name: 'orderId',
                            label: 'Order',
                            options: options(context?.catalog?.orders),
                          },
                          reason,
                        ],
                        (v) => ({ ...v, action: 'SALE', key: 'cash:' + v.orderId })
                      )}
                      {form(
                        'Disburse approved refund',
                        '/cash/sessions/' + s.id,
                        [
                          {
                            name: 'refundId',
                            label: 'Pending cash refund',
                            options: options(context?.catalog?.pendingRefunds),
                          },
                          reason,
                        ],
                        (v) => ({ ...v, action: 'REFUND', key: 'refund:' + v.refundId })
                      )}
                      {form(
                        'Paid in / paid out',
                        '/cash/sessions/' + s.id,
                        [
                          {
                            name: 'action',
                            label: 'Movement',
                            options: [
                              { id: 'IN', name: 'Paid in' },
                              { id: 'OUT', name: 'Paid out' },
                            ],
                          },
                          { name: 'amount', label: 'Minor-unit amount', type: 'number' },
                          reason,
                        ],
                        (v) => ({ ...v, key: crypto.randomUUID() })
                      )}
                      {form(
                        'Close cash session',
                        '/cash/sessions/' + s.id,
                        [
                          { name: 'counted', label: 'Counted cash (minor units)', type: 'number' },
                          reason,
                        ],
                        (v) => ({ ...v, action: 'close' })
                      )}
                    </>
                  )}
                  {s.status === 'CLOSED' && (
                    <button
                      onClick={() =>
                        action(() =>
                          post('/cash/sessions/' + s.id, {
                            action: 'review',
                            reason: 'Closing reviewed',
                          })
                        )
                      }
                    >
                      Mark reviewed
                    </button>
                  )}
                </article>
              ))}
              {selection && (
                <section className="panel">
                  <h2>Cash ledger</h2>
                  <p>Expected {money(selection.expectedCurrent, selection.currency)}</p>
                  {selection.movements.map((m: any) => (
                    <p key={m.id}>
                      {m.kind} {money(m.amount, selection.currency)} · {m.reason}
                    </p>
                  ))}
                </section>
              )}
            </>
          )}
          {data && view === 'delivery' && (
            <>
              {form('Create delivery zone', '/delivery/zones', [
                { name: 'name', label: 'Zone name' },
                { name: 'description', label: 'Serviceable area description' },
                { name: 'fee', label: 'Delivery fee (minor units)', type: 'number' },
                { name: 'active', label: 'Active', type: 'checkbox', value: true },
              ])}
              {data.zones.map((z: any) => (
                <p key={z.id}>
                  {z.name} · {z.description} · fee {z.fee} minor units · ID {z.id}
                </p>
              ))}
              <p>
                Delivery checkout requires a configured prepaid provider. Cash on delivery is
                disabled.
              </p>
              {form('Assign or reassign rider', '/delivery/assign', [
                {
                  name: 'orderId',
                  label: 'Delivery order',
                  options: options(context?.catalog?.orders),
                },
                { name: 'riderId', label: 'Rider', options: options(context?.catalog?.roster) },
                reason,
              ])}
              {data.assignments.map((d: any) => (
                <p className="panel" key={d.id}>
                  {d.reference} · {d.state} · rider {d.rider_id}
                </p>
              ))}
            </>
          )}
          {data && view === 'deliveries' && (
            <>
              {!data.length && <p>No active deliveries assigned to you.</p>}
              {data.map((d: any) => (
                <article className="panel" key={d.id}>
                  <h2>
                    {d.reference} · {d.state}
                  </h2>
                  <p>{d.address}</p>
                  <p>
                    {d.contact.name} · <a href={'tel:' + d.contact.phone}>{d.contact.phone}</a>
                  </p>
                  <p>{d.instructions}</p>
                  {form(
                    'Update assigned delivery',
                    '/deliveries/' + d.id,
                    [
                      {
                        name: 'state',
                        label: 'Next milestone',
                        options:
                          (
                            {
                              ASSIGNED: ['ACCEPTED', 'FAILED'],
                              ACCEPTED: ['PICKED_UP', 'FAILED'],
                              PICKED_UP: ['EN_ROUTE', 'FAILED'],
                              EN_ROUTE: ['DELIVERED', 'FAILED'],
                            } as any
                          )[d.state]?.map((s: string) => ({
                            id: s,
                            name: s.replaceAll('_', ' '),
                          })) ?? [],
                      },
                      reason,
                    ],
                    (v) => ({ ...v, version: d.version })
                  )}
                </article>
              ))}
            </>
          )}
          {data && view === 'inventory' && (
            <>
              {form('Create ingredient', '/inventory/ingredients', [
                { name: 'name', label: 'Ingredient name' },
                {
                  name: 'unit',
                  label: 'Canonical unit',
                  options: ['g', 'ml', 'each'].map((id) => ({ id, name: id })),
                },
                {
                  name: 'threshold',
                  label: 'Low stock threshold (thousandths)',
                  type: 'number',
                  value: 0,
                },
              ])}
              {form('Create stock location', '/inventory/locations', [
                { name: 'name', label: 'Location name' },
              ])}
              {form(
                'Record stock movement',
                '/inventory/movements',
                [
                  { name: 'ingredientId', label: 'Ingredient', options: options(data.ingredients) },
                  { name: 'locationId', label: 'Location', options: options(data.locations) },
                  {
                    name: 'unit',
                    label: 'Input unit',
                    options: ['g', 'kg', 'ml', 'l', 'each'].map((id) => ({ id, name: id })),
                  },
                  {
                    name: 'quantity',
                    label: 'Quantity in thousandths (negative for waste)',
                    type: 'number',
                  },
                  {
                    name: 'kind',
                    label: 'Movement type',
                    options: ['OPENING', 'RECEIPT', 'ADJUSTMENT', 'WASTE'].map((id) => ({
                      id,
                      name: id,
                    })),
                  },
                  reason,
                ],
                (v) => ({ ...v, key: crypto.randomUUID() })
              )}
              <RecipeEditor
                catalog={context?.catalog}
                inventory={data}
                save={(v, key) => post('/inventory/recipes', v, 'POST', key)}
              />
              {form('Track item ingredients', '/inventory/tracking', [
                {
                  name: 'itemId',
                  label: 'Published item',
                  options: options(context?.catalog?.items),
                },
              ])}
              <h2>Recipe configuration</h2>
              {data.tracked?.map((t: any) => (
                <p key={t.id}>
                  {context?.catalog?.items.find((i: any) => i.id === t.item_id)?.name ??
                    'Published item'}
                  :{' '}
                  {data.recipes.some((r: any) => r.item_id === t.item_id)
                    ? 'Recipe configured'
                    : 'MISSING RECIPE — acceptance blocked'}
                </p>
              ))}
              <h2>Stock balances</h2>
              {data.balances.map((b: any) => (
                <article
                  className="panel stock-card"
                  data-low-stock={Number(b.quantity) - Number(b.reserved) <= Number(b.threshold)}
                  key={b.id}
                >
                  <h3>{b.name}</h3>
                  <p className="stock-quantity">
                    {Number(b.quantity) / 1000} {b.unit} · reserved {Number(b.reserved) / 1000} ·
                    available {(Number(b.quantity) - Number(b.reserved)) / 1000}{' '}
                    {Number(b.quantity) - Number(b.reserved) <= Number(b.threshold)
                      ? ' · LOW STOCK'
                      : ''}
                  </p>
                </article>
              ))}
              <h2>Append-only ledger</h2>
              {data.movements.map((m: any) => (
                <p key={m.id}>
                  {m.kind} · {m.quantity} thousandths · {m.reason}
                </p>
              ))}
            </>
          )}
          {data && view === 'coupons' && (
            <>
              {form(
                'Save coupon rules',
                '/coupons',
                [
                  { name: 'code', label: 'Coupon code' },
                  {
                    name: 'kind',
                    label: 'Discount',
                    options: [
                      { id: 'percent', name: 'Percentage (basis points)' },
                      { id: 'fixed', name: 'Fixed minor units' },
                      { id: 'free_delivery', name: 'Free delivery' },
                    ],
                  },
                  { name: 'value', label: 'Value', type: 'number', value: 1000 },
                  { name: 'minimum', label: 'Minimum eligible subtotal', type: 'number', value: 0 },
                  {
                    name: 'maximum',
                    label: 'Maximum discount (0 = eligible subtotal)',
                    type: 'number',
                    value: 0,
                  },
                  { name: 'startsAt', label: 'Starts', type: 'datetime-local' },
                  { name: 'endsAt', label: 'Ends', type: 'datetime-local' },
                  { name: 'limit', label: 'Total redemption limit', type: 'number', value: 100 },
                  {
                    name: 'perCustomer',
                    label: 'Per verified customer limit (0 = none)',
                    type: 'number',
                    value: 0,
                  },
                  {
                    name: 'itemIds',
                    label: 'Eligible dishes (empty = all)',
                    type: 'multi',
                    options: options(context?.catalog?.items),
                    required: false,
                  },
                  {
                    name: 'categoryIds',
                    label: 'Eligible categories (empty = all)',
                    type: 'multi',
                    options: options(context?.catalog?.categories),
                    required: false,
                  },
                  {
                    name: 'modes',
                    label: 'Eligible service modes',
                    type: 'multi',
                    value: ['pickup'],
                    options: ['pickup', 'dine_in', 'delivery'].map((id) => ({ id, name: id })),
                  },
                  { name: 'active', label: 'Active', type: 'checkbox', value: true },
                ],
                (v) => ({ ...v, itemIds: v.itemIds ?? [], categoryIds: v.categoryIds ?? [] })
              )}
              {data.map((c: any) => (
                <article className="panel" key={c.id}>
                  <h2>{c.code}</h2>
                  <p>
                    {c.content.kind} · {c.content.value} · limit {c.content.limit} ·{' '}
                    {c.content.active ? 'Active' : 'Inactive'}
                  </p>
                </article>
              ))}
            </>
          )}
          {data && view === 'customers' && (
            <>
              <label>
                Search customers
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setOffset(0);
                  }}
                />
              </label>
              {data.map((c: any) => (
                <article className="panel" key={c.id}>
                  <h2>{c.full_name}</h2>
                  <p>
                    {c.email} · {c.is_email_verified ? 'Email verified' : 'Unverified contact'} ·{' '}
                    {c.order_count} orders
                  </p>
                  <p>
                    Marketing consent: {c.preferences?.marketingConsent ? 'Granted' : 'Not granted'}{' '}
                    · Transactional email:{' '}
                    {c.preferences?.transactionalEmail === false ? 'Off' : 'On'}
                  </p>
                  <button
                    onClick={() =>
                      action(async () => setSelection(await api(base + '/customers/' + c.id)))
                    }
                  >
                    View history & spending
                  </button>
                  {permitted('customers.notes') &&
                    form('Restricted staff note', '/customers/' + c.id + '/notes', [
                      { name: 'note', label: 'Private note', type: 'textarea' },
                    ])}
                </article>
              ))}
              <button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 30))}>
                Previous
              </button>
              <button disabled={data.length < 30} onClick={() => setOffset(offset + 30)}>
                Next
              </button>
              {selection && (
                <section className="panel">
                  <h2>Customer history</h2>
                  {Object.entries(selection.summary).map(([currency, v]: any) => (
                    <p key={currency}>
                      {currency}: completed sales {money(v.completedSales, currency)} · collected{' '}
                      {money(v.collected, currency)} · refunds {money(v.refunds, currency)}
                    </p>
                  ))}
                  {selection.orders.map((o: any) => (
                    <p key={o.id}>
                      {o.reference} · {o.status} · {money(o.total, o.currency)}
                    </p>
                  ))}
                  {selection.reservations.map((r: any) => (
                    <p key={r.reference}>
                      {r.reference} · {r.status} · {r.party} covers
                    </p>
                  ))}
                  {selection.notes?.map((n: any, i: number) => (
                    <p key={i}>Private: {n.note}</p>
                  ))}
                </section>
              )}
            </>
          )}
          {data && view === 'reviews' && (
            <>
              {form('Send review invitation', '/reviews/invitations', [
                {
                  name: 'orderId',
                  label: 'Completed order',
                  options: options(context?.catalog?.orders),
                },
              ])}
              {data.map((r: any) => (
                <article className="panel" key={r.id}>
                  <h2>
                    {r.rating} / 5 · {r.status}
                  </h2>
                  <p>{r.comment}</p>
                  {r.response && <p>Restaurant: {r.response}</p>}
                  {form('Respond or moderate', '/reviews/' + r.id, [
                    {
                      name: 'response',
                      label: 'Public response',
                      type: 'textarea',
                      required: false,
                    },
                    {
                      name: 'status',
                      label: 'Visibility',
                      options: [
                        { id: 'PUBLISHED', name: 'Published (includes negative reviews)' },
                        { id: 'HIDDEN', name: 'Hidden for policy violation' },
                      ],
                      value: r.status,
                    },
                    {
                      name: 'category',
                      label: 'Policy reason',
                      options: [
                        { id: 'spam', name: 'Spam' },
                        { id: 'abuse', name: 'Abuse' },
                        { id: 'privacy', name: 'Privacy' },
                      ],
                      required: false,
                    },
                    reason,
                  ])}
                </article>
              ))}
            </>
          )}
          {data && view === 'reports' && (
            <>
              {form('Generate private export', '/exports', [
                {
                  name: 'kind',
                  label: 'Report',
                  options: [
                    'orders',
                    'collections',
                    'refunds',
                    'cash',
                    'inventory',
                    'customers',
                    'coupons',
                    'delivery',
                  ]
                    .filter((k) => k !== 'customers' || permitted('customers.export'))
                    .map((id) => ({ id, name: id })),
                },
                {
                  name: 'format',
                  label: 'Format',
                  options: [
                    { id: 'csv', name: 'CSV' },
                    { id: 'pdf', name: 'PDF' },
                  ],
                },
                { name: 'from', label: 'From (restaurant-local date)', type: 'date' },
                { name: 'to', label: 'Through (restaurant-local date)', type: 'date' },
              ])}
              <p>
                Sales, collections, refunds, cash and inventory use separate source ledgers.
                Generated files expire in 24 hours.
              </p>
              {data.map((j: any) => (
                <article className="panel" key={j.id}>
                  <h2>
                    {j.kind} · {j.format.toUpperCase()}
                  </h2>
                  <p>
                    {j.state} · {j.error ?? ''} · expires {new Date(j.expires_at).toLocaleString()}
                  </p>
                  {j.state === 'DONE' && (
                    <a href={`/api/v1${base}/exports/${j.id}/download`}>
                      Download authorized export
                    </a>
                  )}
                </article>
              ))}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
