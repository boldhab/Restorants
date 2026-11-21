'use client';
import { useEffect, useState } from 'react';
import { commerce } from '../../lib/commerce-client';
export function VerifiedReview({
  restaurantId: id,
  orderId,
}: {
  restaurantId: string;
  orderId: string;
}) {
  const [token, setToken] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    const hash = new URLSearchParams(location.hash.slice(1));
    setToken(hash.get('review') ?? '');
    if (hash.has('review')) history.replaceState(null, '', location.pathname);
  }, []);
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
          await commerce(id, `/orders/${orderId}/review`, {
            method: 'POST',
            body: JSON.stringify({
              rating: Number(fd.get('rating')),
              comment: fd.get('comment'),
              token: token || undefined,
            }),
          });
          setMessage('Your verified review was published. Thank you.');
        } catch (e) {
          setMessage((e as Error).message);
        }
      }}
    >
      <h2>Review your completed order</h2>
      <p>Use your order account or the single-use invitation sent by the restaurant.</p>
      <label>
        Rating
        <select aria-label="Rating" name="rating" required>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} / 5
            </option>
          ))}
        </select>
      </label>
      <label>
        Your review
        <textarea name="comment" minLength={3} maxLength={2000} required />
      </label>
      <button className="button-primary">Publish verified review</button>
      <p
        role="status"
        data-tone={
          message.startsWith('Your verified review was published')
            ? 'success'
            : message
              ? 'error'
              : undefined
        }
      >
        {message}
      </p>
    </form>
  );
}
export function PublicReviews({ restaurantId: id }: { restaurantId: string }) {
  const [data, setData] = useState<any>(null),
    [message, setMessage] = useState('');
  useEffect(() => {
    commerce(id, '/reviews')
      .then(setData)
      .catch((e) => setMessage(e.message));
  }, [id]);
  return (
    <section className="panel">
      <h2>Verified customer reviews</h2>
      <p>{message}</p>
      {data && (
        <>
          <p>
            {data.aggregate.count
              ? `${data.aggregate.average} / 5 from ${data.aggregate.count} verified reviews`
              : 'No verified reviews yet.'}
          </p>
          {data.reviews.map((r: any, i: number) => (
            <article key={i}>
              <h3>{r.rating} / 5</h3>
              <p>{r.comment}</p>
              {r.response && <p>Restaurant response: {r.response}</p>}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
