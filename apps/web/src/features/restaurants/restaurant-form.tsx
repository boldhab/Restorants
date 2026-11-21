'use client';
import { useRef, useState, type FormEvent } from 'react';
import type { Restaurant } from '../../lib/api-client';
const fields = [
  { name: 'name', label: 'Restaurant name', placeholder: 'e.g. The Gathering Table' },
  { name: 'category', label: 'Business category', placeholder: 'e.g. Restaurant, café, bakery' },
  { name: 'email', label: 'Contact email', type: 'email' },
  { name: 'phone', label: 'Contact phone' },
  { name: 'country', label: 'Country' },
  { name: 'city', label: 'City' },
  { name: 'address', label: 'Street address' },
  { name: 'currency', label: 'Currency', placeholder: 'ETB' },
  { name: 'timezone', label: 'IANA timezone', placeholder: 'Africa/Addis_Ababa' },
] as const;
export function RestaurantForm({
  initial,
  onSave,
}: {
  initial?: Restaurant;
  onSave: (data: Record<string, unknown>, key: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const key = useRef('');
  const lastPayload = useRef('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const data: Record<string, unknown> = { ...values };
    if (!initial) {
      data.initial_branch = {
        name: values.branch_name,
        address: values.branch_address || values.address,
      };
      delete data.branch_name;
      delete data.branch_address;
    }
    const payload = JSON.stringify(data);
    if (payload !== lastPayload.current) {
      key.current = crypto.randomUUID();
      lastPayload.current = payload;
    }
    try {
      await onSave(data, key.current);
      setSuccess('Restaurant settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save restaurant.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-grid" onSubmit={submit}>
      {fields.map((f) => (
        <label key={f.name}>
          {f.label}
          <input
            name={f.name}
            type={'type' in f ? f.type : 'text'}
            defaultValue={
              initial?.[f.name] ||
              (!initial && f.name === 'currency'
                ? 'ETB'
                : !initial && f.name === 'timezone'
                  ? 'Africa/Addis_Ababa'
                  : '')
            }
            placeholder={'placeholder' in f ? f.placeholder : undefined}
            required
            maxLength={f.name === 'currency' ? 3 : 255}
          />
        </label>
      ))}
      {!initial && (
        <>
          <label>
            Restaurant slug
            <input
              name="slug"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="the-gathering-table"
              required
              minLength={2}
              maxLength={63}
            />
          </label>
          <label>
            Initial branch name
            <input name="branch_name" defaultValue="Main Branch" required minLength={2} />
          </label>
          <label>
            Branch address (optional)
            <input name="branch_address" />
          </label>
        </>
      )}
      {error && (
        <p className="notice danger full" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="notice success full" role="status">
          {success}
        </p>
      )}
      <div className="full">
        <button className="primary" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Create restaurant →'}
        </button>
      </div>
    </form>
  );
}
