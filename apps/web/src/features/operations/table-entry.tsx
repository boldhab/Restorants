'use client';
import { useState, useEffect } from 'react';
import { commerce } from '../../lib/commerce-client';
import { OrderTerminal } from './terminal';
export function TableEntry({ restaurantId: id }: { restaurantId: string }) {
  const [reference, setReference] = useState(''),
    [activation, setActivation] = useState(''),
    [visit, setVisit] = useState<any>(null),
    [message, setMessage] = useState('');
  useEffect(() => {
    setReference(window.location.hash.slice(1));
    history.replaceState(null, '', window.location.pathname);
  }, []);
  return (
    <main className="commerce-page">
      <h1>Your table, your order.</h1>
      <p>Ask your waiter for the activation code for this visit.</p>
      {!visit ? (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              setVisit(
                await commerce(id, '/table/join', {
                  method: 'POST',
                  body: JSON.stringify({ reference, activation }),
                })
              );
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <label>
            Table reference
            <input value={reference} onChange={(e) => setReference(e.target.value)} required />
          </label>
          <label>
            Visit activation code
            <input
              value={activation}
              onChange={(e) => setActivation(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <button className="button-primary">Join this visit</button>
          <p role="alert">{message}</p>
        </form>
      ) : (
        <>
          <h2>{visit.tableName}</h2>
          <OrderTerminal restaurantId={id} channel="qr" sessionId={visit.sessionId} />
        </>
      )}
    </main>
  );
}
