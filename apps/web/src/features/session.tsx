'use client';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api, type Session } from '../lib/api-client';
const SessionContext = createContext<{
  session: Session | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<Session>;
  logout: () => Promise<void>;
} | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const data = await api<Session>('/auth/me');
    setSession(data);
    setError('');
    return data;
  }, []);
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setSession(null);
    window.location.assign('/login');
  }
  return (
    <SessionContext.Provider value={{ session, loading, error, refresh, logout }}>
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider missing');
  return context;
}
