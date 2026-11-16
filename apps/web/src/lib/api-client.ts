export interface User {
  id: string;
  email: string;
  full_name: string;
  is_email_verified: boolean;
}
export interface Membership {
  restaurant_id: string;
  restaurant_name: string;
  roles: string[];
  permissions: string[];
}
export interface Session {
  authenticated: boolean;
  user: User | null;
  memberships: Membership[];
}
export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  category: string;
  phone: string;
  email: string;
  country: string;
  city: string;
  address: string;
  currency: string;
  timezone: string;
  status: string;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const csrf =
    typeof document === 'undefined'
      ? ''
      : document.cookie
          .split('; ')
          .find((c) => c.startsWith('zayqora_csrf='))
          ?.split('=')[1];
  const res = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}),
      ...options.headers,
    },
  });
  const body = await res.json();
  if (!res.ok)
    throw new ApiError(
      body.error?.details
        ?.map((d: { field: string; message: string }) => `${d.field}: ${d.message}`)
        .join(' · ') ||
        body.error?.message ||
        'Request failed',
      res.status,
      body.error?.code || 'UNKNOWN'
    );
  return body as T;
}
