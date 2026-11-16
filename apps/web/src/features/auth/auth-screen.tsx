'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/api-client';
import { useSession } from '../session';
type Mode = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify-email';
const headings = {
  login: 'Welcome back.',
  register: 'Your next chapter starts here.',
  'forgot-password': 'Let’s get you back in.',
  'reset-password': 'A fresh start.',
  'verify-email': 'Verify your email.',
};
export function AuthScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '');
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === 'login') {
        await api('/auth/login', { method: 'POST', body: JSON.stringify(data) });
        await refresh();
        router.replace('/restaurants');
      }
      if (mode === 'register') {
        await api('/auth/register', { method: 'POST', body: JSON.stringify(data) });
        setMessage('Account created. Check your inbox for a verification link, then sign in.');
      }
      if (mode === 'forgot-password') {
        await api('/auth/password/forgot', { method: 'POST', body: JSON.stringify(data) });
        setMessage('If an account exists, a reset link has been sent.');
      }
      if (mode === 'reset-password') {
        await api('/auth/password/reset', {
          method: 'POST',
          body: JSON.stringify({ ...data, token }),
        });
        setMessage('Password updated. You can now sign in.');
      }
      if (mode === 'verify-email') {
        await api(token ? '/auth/verify-email' : '/auth/resend-verification', {
          method: 'POST',
          body: JSON.stringify(token ? { token } : data),
        });
        setMessage(
          token
            ? 'Email verified. Sign in to create your restaurant.'
            : 'If an unverified account exists, a new link has been sent.'
        );
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-grid">
      <aside className="auth-story">
        <Link className="wordmark" href="/">
          zayqora<span>✳</span>
        </Link>
        <div>
          <p className="eyebrow">THE SPACE BEHIND YOUR RESTAURANT</p>
          <h1>
            Great hospitality.
            <br />
            <em>Solid foundations.</em>
          </h1>
          <p>Bring your people, places, and possibilities together. One restaurant at a time.</p>
        </div>
        <small>Made for the people who bring us together.</small>
      </aside>
      <section className="auth-content">
        <div className="auth-card">
          <p className="eyebrow">WELCOME TO ZAYQORA</p>
          <h2>{headings[mode]}</h2>
          <p className="muted">
            {mode === 'login'
              ? 'Sign in to your restaurant workspace.'
              : mode === 'register'
                ? 'Create your account. Build something worth gathering around.'
                : mode === 'verify-email'
                  ? 'Use your email link to finish setting up your account.'
                  : 'We’ll help you securely access your workspace.'}
          </p>
          <form onSubmit={submit}>
            {mode === 'register' && (
              <label>
                Full name
                <input
                  name="full_name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
            )}
            {mode !== 'reset-password' && !(mode === 'verify-email' && token) && (
              <label>
                Email address
                <input name="email" type="email" autoComplete="email" required />
              </label>
            )}
            {['register', 'login', 'reset-password'].includes(mode) && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'login' ? 1 : 8}
                  maxLength={72}
                />
              </label>
            )}
            {error && (
              <p role="alert" className="notice danger">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="notice">
                {message}
              </p>
            )}
            <button disabled={busy} className="primary">
              {busy
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in →'
                  : mode === 'register'
                    ? 'Create account →'
                    : mode === 'verify-email'
                      ? token
                        ? 'Verify email →'
                        : 'Resend verification →'
                      : mode === 'reset-password'
                        ? 'Save new password →'
                        : 'Send reset link →'}
            </button>
          </form>
          <div className="auth-links">
            <Link href="/login">Sign in</Link>
            <Link href="/register">Create account</Link>
            <Link href="/forgot-password">Forgot password?</Link>
          </div>
          <p className="fine-print">Your restaurant data stays within your workspace.</p>
        </div>
      </section>
    </div>
  );
}
