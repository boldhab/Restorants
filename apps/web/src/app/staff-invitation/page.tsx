'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';
export default function Page() {
  const [token, setToken] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    setToken(location.hash.slice(1));
    history.replaceState(null, '', location.pathname);
  }, []);
  return (
    <main className="commerce-page">
      <h1>Join your restaurant team</h1>
      <p>
        Sign in with the verified account matching the invited email, then accept this single-use
        invitation.
      </p>
      <a href="/login" target="_blank" rel="noreferrer">
        Sign in in another tab
      </a>
      <button
        className="button-primary"
        onClick={async () => {
          try {
            const r = await api<any>('/staff-invitations/accept', {
              method: 'POST',
              body: JSON.stringify({ token }),
            });
            location.assign(`/operations/${r.restaurantId}/kitchen`);
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        Accept invitation
      </button>
      <p role="status">{message}</p>
    </main>
  );
}
