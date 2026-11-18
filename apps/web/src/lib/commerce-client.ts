import { api } from './api-client';
export async function commerce<T>(id: string, path: string, options: RequestInit = {}): Promise<T> {
  const session = await api<{ csrf: string }>(`/commerce/${id}/session`);
  return api<T>(`/commerce/${id}${path}`, {
    ...options,
    headers: { 'X-Guest-CSRF': session.csrf, ...options.headers },
  });
}
export function money(amount: number | string, currency: string) {
  const n = Number(amount);
  if (!Number.isSafeInteger(n)) return `${amount} minor units ${currency}`;
  const digits =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(n / 10 ** digits);
}
