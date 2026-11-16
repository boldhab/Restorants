'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, type Restaurant } from '../../lib/api-client';
import { useSession } from '../session';
import { RestaurantForm } from '../restaurants/restaurant-form';
type Data = { restaurant: Restaurant; permissions: string[]; roles: string[] };
export function Workspace({
  restaurantId,
  settings = false,
}: {
  restaurantId: string;
  settings?: boolean;
}) {
  const { session, loading, logout } = useSession();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [branches, setBranches] = useState<{ id: string; name: string; address: string }[]>([]);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    setBranches([]);
    api<Data>(`/restaurants/${restaurantId}`)
      .then(async (d) => {
        const b = await api<{ branches: typeof branches }>(`/restaurants/${restaurantId}/branches`);
        if (active) {
          setData(d);
          setBranches(b.branches);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof ApiError && e.status === 401
              ? 'Your session expired. Sign in again.'
              : e.message
          );
      });
    return () => {
      active = false;
    };
  }, [restaurantId]);
  if (loading) return <main className="center">Loading your workspace…</main>;
  if (!session?.user)
    return (
      <main className="center">
        <h1>Sign in to your workspace.</h1>
        <Link href="/login">Sign in →</Link>
      </main>
    );
  if (error)
    return (
      <main className="center" role="alert">
        <h1>Workspace unavailable.</h1>
        <p>{error}</p>
        <Link href="/restaurants">Choose a restaurant</Link> · <Link href="/login">Sign in</Link>
      </main>
    );
  if (!data) return <main className="center">Opening restaurant…</main>;
  const { restaurant: r, permissions } = data;
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/restaurants" className="wordmark">
          zayqora<span>✳</span>
        </Link>
        <p className="eyebrow">YOUR WORKSPACE</p>
        <label className="switch-label">
          Restaurant
          <select
            aria-label="Switch restaurant"
            value={restaurantId}
            onChange={(e) => router.push(`/workspace/${e.target.value}/dashboard`)}
          >
            {session.memberships.map((m) => (
              <option key={m.restaurant_id} value={m.restaurant_id}>
                {m.restaurant_name}
              </option>
            ))}
          </select>
        </label>
        <nav>
          <Link className={!settings ? 'active' : ''} href={`/workspace/${restaurantId}/dashboard`}>
            ◫ &nbsp; Overview
          </Link>
          {permissions.includes('restaurant:update') && (
            <Link className={settings ? 'active' : ''} href={`/workspace/${restaurantId}/settings`}>
              ⚙ &nbsp; Restaurant settings
            </Link>
          )}
          <Link href="/restaurants">↔ &nbsp; All restaurants</Link>
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{session.user.full_name[0]}</span>
          <strong>{session.user.full_name}</strong>
          <small>{session.user.email}</small>
          <button onClick={() => logout().catch((e) => setError(e.message))}>Sign out ↗</button>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <span>
            {r.name} <span className="breadcrumb">/ {settings ? 'Settings' : 'Overview'}</span>
          </span>
          <span className="status">
            <i /> {r.status === 'onboarding' ? 'Onboarding' : r.status}
          </span>
        </header>
        <main className="workspace-main">
          <p className="eyebrow">{settings ? 'RESTAURANT SETTINGS' : 'YOUR NEXT CHAPTER'}</p>
          <h1>
            {settings ? (
              'The details matter.'
            ) : (
              <>
                Welcome to <em>{r.name}.</em>
              </>
            )}
          </h1>
          <p className="muted">
            {settings
              ? 'Keep the essentials up to date.'
              : 'A strong foundation for everything that comes next.'}
          </p>
          {settings ? (
            permissions.includes('restaurant:update') ? (
              <section className="panel">
                <RestaurantForm
                  initial={r}
                  onSave={async (body) => {
                    const result = await api<{ restaurant: Restaurant }>(
                      `/restaurants/${restaurantId}`,
                      { method: 'PATCH', body: JSON.stringify(body) }
                    );
                    setData({ ...data, restaurant: result.restaurant });
                  }}
                />
              </section>
            ) : (
              <p role="alert" className="notice">
                You don’t have permission to edit this restaurant.
              </p>
            )
          ) : (
            <>
              <section className="welcome-panel">
                <div>
                  <span className="tag">YOUR RESTAURANT · TOGETHER</span>
                  <h2>
                    Your restaurant.
                    <br />
                    Room to grow.
                  </h2>
                  <p>
                    Your workspace is ready. Review your business details and get your team’s
                    foundation in place.
                  </p>
                  {permissions.includes('restaurant:update') && (
                    <Link className="light-button" href={`/workspace/${restaurantId}/settings`}>
                      Review restaurant details ↗
                    </Link>
                  )}
                </div>
                <div className="graphic" aria-hidden="true">
                  <span>✳</span>
                </div>
              </section>
              <div className="overview-grid">
                <section className="panel">
                  <p className="eyebrow">BUSINESS PROFILE</p>
                  <h2>{r.name}</h2>
                  <dl>
                    <div>
                      <dt>Location</dt>
                      <dd>
                        {r.city}, {r.country}
                      </dd>
                    </div>
                    <div>
                      <dt>Currency</dt>
                      <dd>{r.currency}</dd>
                    </div>
                    <div>
                      <dt>Timezone</dt>
                      <dd>{r.timezone}</dd>
                    </div>
                    <div>
                      <dt>Your access</dt>
                      <dd>{data.roles.join(', ')}</dd>
                    </div>
                  </dl>
                </section>
                <section className="panel">
                  <p className="eyebrow">YOUR LOCATIONS</p>
                  <h2>A home for hospitality.</h2>
                  {branches.map((b) => (
                    <div className="branch" key={b.id}>
                      <span>⌂</span>
                      <div>
                        <strong>{b.name}</strong>
                        <p>{b.address}</p>
                      </div>
                    </div>
                  ))}
                  <p className="fine-print">
                    Your default branch was created with your restaurant.
                  </p>
                </section>
              </div>
              <section className="coming-next">
                <span>✧</span>
                <div>
                  <h3>The foundation comes first.</h3>
                  <p>
                    Menus, orders, and operations arrive in later phases. Your public website has
                    not been published.
                  </p>
                </div>
                <span className="tag">COMING LATER</span>
              </section>
            </>
          )}
        </main>
        <footer>
          Built for better hospitality. <span>ZAYQORA · WORKSPACE</span>
        </footer>
      </div>
    </div>
  );
}
