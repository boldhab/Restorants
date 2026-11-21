import { VerifiedReview } from '../../../../features/operations/verified-review';
export const metadata = {
  title: 'Verified review · ZAYQORA',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function Page({
  params,
}: {
  params: Promise<{ restaurantId: string; orderId: string }>;
}) {
  const p = await params;
  return (
    <main className="commerce-page">
      <h1>Your verified review</h1>
      <p>
        This page accepts a single-use review invitation or your authenticated order ownership. It
        does not expose the order or contact details.
      </p>
      <VerifiedReview restaurantId={p.restaurantId} orderId={p.orderId} />
    </main>
  );
}
