'use client';
import Link from 'next/link';
import { useSession } from '../session';
export function RestaurantSelection() {
  const { session, loading, error, logout } = useSession();
  if (loading) return <main className="center">Loading your workspaces…</main>;
  if (error)
    return (
      <main className="center" role="alert">
        {error} <button onClick={() => window.location.reload()}>Retry</button>
      </main>
    );
  if (!session?.user)
    return (
      <main className="center">
        <h1>Your workspace awaits.</h1>
        <Link href="/login">Sign in to continue →</Link>
      </main>
    );
  return (
    <main className="selection">
      <header>
        <Link className="wordmark" href="/">
          zayqora<span>✳</span>
        </Link>
        <button onClick={() => logout().catch((e) => alert(e.message))}>Sign out</button>
      </header>
      <nav>
        <Link href="/customer/history">Your customer history</Link>
        {session.user.is_platform_admin && (
          <>
            {' '}
            · <Link href="/platform">Platform controls</Link>
          </>
        )}
      </nav>
      <p className="eyebrow">YOUR RESTAURANTS</p>
      <h1>
        A place for every
        <br />
        <em>possibility.</em>
      </h1>
      <p className="muted">Welcome, {session.user.full_name}. Choose where you’d like to work.</p>
      {!session.user.is_email_verified && (
        <p className="notice">
          Verify your email before creating a restaurant.{' '}
          <Link href="/verify-email">Resend verification</Link>
        </p>
      )}
      <div className="restaurant-grid">
        {session.memberships.map((m) => (
          <Link
            className="restaurant-card"
            key={m.restaurant_id}
            href={`/workspace/${m.restaurant_id}/dashboard`}
          >
            <span className="restaurant-icon">{m.restaurant_name.slice(0, 1)}</span>
            <h2>{m.restaurant_name}</h2>
            <p>{m.roles.join(' · ')}</p>
            <span>Open workspace ↗</span>
          </Link>
        ))}
        <Link
          className="restaurant-card new"
          href={session.user.is_email_verified ? '/onboarding' : '/verify-email'}
        >
          <span className="restaurant-icon">＋</span>
          <h2>Create a restaurant</h2>
          <p>Give your next chapter a home.</p>
          <span>Get started ↗</span>
        </Link>
      </div>
    </main>
  );
}
