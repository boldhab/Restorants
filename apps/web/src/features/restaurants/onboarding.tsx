'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type Restaurant } from '../../lib/api-client';
import { useSession } from '../session';
import { RestaurantForm } from './restaurant-form';
export function Onboarding() {
  const { session, loading, error, refresh } = useSession();
  const router = useRouter();
  if (loading) return <main className="center">Loading…</main>;
  if (error)
    return (
      <main className="center" role="alert">
        {error}
      </main>
    );
  if (!session?.user)
    return (
      <main className="center">
        <Link href="/login">Sign in to continue</Link>
      </main>
    );
  if (!session.user.is_email_verified)
    return (
      <main className="center">
        <h1>One more step.</h1>
        <Link href="/verify-email">Verify your email first →</Link>
      </main>
    );
  return (
    <main className="onboarding">
      <Link href="/restaurants">← Your restaurants</Link>
      <p className="eyebrow">01 / YOUR FOUNDATION</p>
      <h1>
        Let’s make it <em>yours.</em>
      </h1>
      <p className="muted">
        Start with the essentials. Your restaurant begins as a private onboarding workspace.
      </p>
      <section className="panel">
        <RestaurantForm
          onSave={async (data, key) => {
            const result = await api<{ restaurant: Restaurant }>('/restaurants', {
              method: 'POST',
              headers: { 'Idempotency-Key': key },
              body: JSON.stringify(data),
            });
            await refresh();
            router.replace(`/workspace/${result.restaurant.id}/dashboard`);
          }}
        />
      </section>
    </main>
  );
}
