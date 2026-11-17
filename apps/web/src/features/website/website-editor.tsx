'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  type Draft,
  type Hours,
  type Item,
  type Availability,
  formatMoney,
} from '@zayqora/contracts';
import { api } from '../../lib/api-client';
import { RestaurantSite } from './restaurant-site';
type Asset = { id: string; alt: string };
type EditorData = {
  draft: Draft;
  version: number;
  issues: string[];
  assets: Asset[];
  publication: { revision_id: string; draft_version: number; published_at: string } | null;
  history: { id: string; draft_version: number; created_at: string }[];
};
const uid = () => crypto.randomUUID();
function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function HoursEditor({ value, onChange }: { value: Hours; onChange: (value: Hours) => void }) {
  const time = (v: number) =>
    `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
  const minutes = (v: string) => {
    const [h, m] = v.split(':').map(Number);
    return h * 60 + m;
  };
  function intervals(list: Hours['week'][number], update: (v: Hours['week'][number]) => void) {
    return (
      <>
        {!list.length && <span>Closed </span>}
        {list.map((i, n) => (
          <div className="inline-fields" key={n}>
            <Field
              label="Opens"
              type="time"
              value={time(i.start)}
              onChange={(v) =>
                update(list.map((x, k) => (k === n ? { ...x, start: minutes(v) } : x)))
              }
            />
            <Field
              label="Closes (earlier = next day)"
              type="time"
              value={time(i.end)}
              onChange={(v) =>
                update(list.map((x, k) => (k === n ? { ...x, end: minutes(v) } : x)))
              }
            />
            <button type="button" onClick={() => update(list.filter((_, k) => k !== n))}>
              Remove interval
            </button>
          </div>
        ))}
        <button type="button" onClick={() => update([...list, { start: 540, end: 1020 }])}>
          Add interval
        </button>
      </>
    );
  }
  return (
    <>
      <p className="fine-print">
        Hours use restaurant-local time. Earlier closing times mean the next day. A date exception
        overrides that date, including overnight spillover.
      </p>
      {value.week.map((day, n) => (
        <fieldset key={n}>
          <legend>
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][n]}
          </legend>
          {intervals(day, (v) =>
            onChange({ ...value, week: value.week.map((x, k) => (k === n ? v : x)) })
          )}
        </fieldset>
      ))}
      <h3>Holiday hours & temporary closures</h3>
      {value.exceptions.map((e, n) => (
        <fieldset key={n}>
          <Field
            label="Date"
            type="date"
            value={e.date}
            onChange={(v) =>
              onChange({
                ...value,
                exceptions: value.exceptions.map((x, k) => (k === n ? { ...x, date: v } : x)),
              })
            }
          />
          <Field
            label="Reason"
            value={e.label}
            onChange={(v) =>
              onChange({
                ...value,
                exceptions: value.exceptions.map((x, k) => (k === n ? { ...x, label: v } : x)),
              })
            }
          />
          {intervals(e.intervals, (v) =>
            onChange({
              ...value,
              exceptions: value.exceptions.map((x, k) => (k === n ? { ...x, intervals: v } : x)),
            })
          )}
          <button
            type="button"
            onClick={() =>
              onChange({ ...value, exceptions: value.exceptions.filter((_, k) => k !== n) })
            }
          >
            Remove exception
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...value,
            exceptions: [
              ...value.exceptions,
              { date: new Date().toISOString().slice(0, 10), label: '', intervals: [] },
            ],
          })
        }
      >
        Add date exception
      </button>
    </>
  );
}
export function WebsiteEditor({ restaurantId }: { restaurantId: string }) {
  const [data, setData] = useState<EditorData | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('Profile');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewport, setViewport] = useState('100%');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadAlt, setUploadAlt] = useState('');
  const base = `/restaurants/${restaurantId}`;
  async function load() {
    const r = await api<EditorData>(`${base}/website/draft`);
    setData(r);
    setDraft(r.draft);
    setDirty(false);
  }
  useEffect(() => {
    let active = true;
    api<EditorData>(`${base}/website/draft`)
      .then((r) => {
        if (active) {
          setData(r);
          setDraft(r.draft);
        }
      })
      .catch((e) => setMessage(e.message));
    return () => {
      active = false;
    };
  }, [base]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [dirty]);
  function change(fn: (d: Draft) => void) {
    if (!draft) return;
    const next = structuredClone(draft);
    fn(next);
    setDraft(next);
    setDirty(true);
    setMessage('Unsaved changes');
  }
  async function save() {
    if (!data || !draft) return;
    setBusy(true);
    try {
      const r = await api<{ version: number; issues: string[] }>(`${base}/website/draft`, {
        method: 'PATCH',
        body: JSON.stringify({ version: data.version, draft }),
      });
      setData({ ...data, version: r.version, issues: r.issues, draft });
      setDirty(false);
      setMessage('All changes saved');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publish(action: 'publish' | 'unpublish') {
    if (!data) return;
    setBusy(true);
    try {
      await api(`${base}/website/${action}`, {
        method: 'POST',
        body: JSON.stringify({ version: data.version }),
      });
      await load();
      setMessage(action === 'publish' ? 'Website published' : 'Website unpublished');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (!uploadAlt.trim()) {
      setMessage('Describe the image before uploading');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Image exceeds 5 MB');
      return;
    }
    setUploadProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/v1${base}/media`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Image-Alt', encodeURIComponent(uploadAlt));
    const csrf = document.cookie
      .split('; ')
      .find((c) => c.startsWith('zayqora_csrf='))
      ?.split('=')[1];
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', decodeURIComponent(csrf));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploadProgress(null);
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status !== 201) throw new Error(body.error?.message || 'Upload failed');
        setData((current) =>
          current ? { ...current, assets: [body, ...current.assets] } : current
        );
        setMessage('Image uploaded. Attach it below, then save.');
      } catch (e) {
        setMessage((e as Error).message);
      }
    };
    xhr.onerror = () => {
      setUploadProgress(null);
      setMessage('Upload failed. Select the image to retry.');
    };
    xhr.send(file);
  }
  if (!data || !draft)
    return (
      <main className="center">
        <h1>Restaurant website</h1>
        <p role="status">{message || 'Loading saved setup…'}</p>
        <Link href="/restaurants">Your restaurants</Link>
      </main>
    );
  const s = draft.settings;
  function asset(label: string, value: string | null, update: (id: string | null) => void) {
    return (
      <label>
        {label}
        <select
          aria-label={label}
          value={value || ''}
          onChange={(e) => update(e.target.value || null)}
        >
          <option value="">No image</option>
          {data!.assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.alt}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function itemEdit(id: string, fn: (i: Item) => void) {
    change((d) => {
      const item = d.items.find((i) => i.id === id);
      if (item) fn(item);
    });
  }
  function reorder<T>(list: T[], n: number, delta: number) {
    const other = n + delta;
    if (other >= 0 && other < list.length) [list[n], list[other]] = [list[other], list[n]];
  }
  return (
    <div className="phase2-editor">
      <header className="editor-header">
        <Link
          href={`/workspace/${restaurantId}/dashboard`}
          onClick={(e) => {
            if (dirty && !window.confirm('Leave with unsaved changes?')) e.preventDefault();
          }}
        >
          ← Workspace
        </Link>
        <strong>{s.name}</strong>
        <span>
          {data.publication
            ? `Published ${new Date(data.publication.published_at).toLocaleString()}`
            : 'Unpublished'}
        </span>
      </header>
      <main>
        <p className="eyebrow">BUILD YOUR RESTAURANT’S NEXT CHAPTER</p>
        <h1>Your table. Your story.</h1>
        <p>Complete setup, curate your menu and publish your restaurant website.</p>
        <nav className="editor-tabs" aria-label="Setup steps">
          {[
            'Profile',
            'Hours',
            'Images',
            'Categories',
            'Items',
            'Website',
            'Preview',
            'Publish',
          ].map((name, n) => (
            <button
              key={name}
              aria-current={tab === name ? 'step' : undefined}
              onClick={async () => {
                if (name === 'Preview') {
                  try {
                    const saved = await api<EditorData>(`${base}/website/preview`);
                    setData(saved);
                  } catch (e) {
                    setMessage((e as Error).message);
                    return;
                  }
                }
                setTab(name);
              }}
            >
              {n + 1}. {name}
            </button>
          ))}
        </nav>
        <div className="save-bar">
          <span role="status">{message || (dirty ? 'Unsaved changes' : 'Saved draft loaded')}</span>
          <button disabled={busy || !dirty} onClick={save}>
            {busy ? 'Working…' : 'Save changes'}
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (!dirty || window.confirm('Discard unsaved changes and reload?'))
                load().catch((e) => setMessage(e.message));
            }}
          >
            Reload saved draft
          </button>
        </div>
        {tab === 'Profile' && (
          <section className="panel">
            <h2>Restaurant profile</h2>
            <div className="form-grid">
              {(['name', 'category', 'phone', 'email', 'address', 'timezone'] as const).map(
                (key) => (
                  <Field
                    key={key}
                    label={key.charAt(0).toUpperCase() + key.slice(1)}
                    value={s[key]}
                    onChange={(v) =>
                      change((d) => {
                        d.settings[key] = v;
                      })
                    }
                  />
                )
              )}
              <label>
                Currency
                <select
                  aria-label="Currency"
                  value={s.currency}
                  onChange={(e) =>
                    change((d) => {
                      d.settings.currency = e.target.value as typeof s.currency;
                    })
                  }
                >
                  {Intl.supportedValuesOf('currency').map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea
                aria-label="Description"
                value={s.description}
                onChange={(e) =>
                  change((d) => {
                    d.settings.description = e.target.value;
                  })
                }
              />
            </label>
            <fieldset>
              <legend>Supported service modes (information only)</legend>
              {(['dine_in', 'takeaway', 'delivery'] as const).map((mode) => (
                <label key={mode} className="check-row">
                  <input
                    type="checkbox"
                    checked={s.serviceModes.includes(mode)}
                    onChange={(e) =>
                      change((d) => {
                        d.settings.serviceModes = e.target.checked
                          ? [...s.serviceModes, mode]
                          : s.serviceModes.filter((m) => m !== mode);
                      })
                    }
                  />
                  {mode.replace('_', ' ')}
                </label>
              ))}
            </fieldset>
            <p className="fine-print">
              Currency changes are rejected once menu prices exist. All menu prices are integer
              minor units.
            </p>
          </section>
        )}
        {tab === 'Hours' && (
          <section className="panel">
            <h2>Opening hours</h2>
            <HoursEditor
              value={s.hours}
              onChange={(v) =>
                change((d) => {
                  d.settings.hours = v;
                })
              }
            />
          </section>
        )}
        {tab === 'Images' && (
          <section className="panel">
            <h2>Your image library</h2>
            <p>
              JPEG, PNG or WebP. Maximum 5 MB, 6000px per side. Images remain private until included
              in a publication.
            </p>
            <Field
              label="Describe the image (alternative text)"
              value={uploadAlt}
              onChange={setUploadAlt}
            />
            <label>
              Upload image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadProgress !== null}
                onChange={(e) => {
                  if (e.target.files?.[0]) upload(e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {uploadProgress !== null && (
              <progress max={100} value={uploadProgress}>
                {uploadProgress}%
              </progress>
            )}
            <div className="form-grid">
              {asset('Logo', s.logo, (id) =>
                change((d) => {
                  d.settings.logo = id;
                })
              )}
              {asset('Cover image', s.cover, (id) =>
                change((d) => {
                  d.settings.cover = id;
                })
              )}
              {asset('Social preview image', draft.theme.socialImage, (id) =>
                change((d) => {
                  d.theme.socialImage = id;
                })
              )}
            </div>
            <div className="asset-grid">
              {data.assets.map((a) => (
                <article key={a.id}>
                  <img src={`/api/v1${base}/media/${a.id}`} alt={a.alt} />
                  <p>{a.alt}</p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={draft.theme.gallery.includes(a.id)}
                      onChange={(e) =>
                        change((d) => {
                          d.theme.gallery = e.target.checked
                            ? [...d.theme.gallery, a.id]
                            : d.theme.gallery.filter((id) => id !== a.id);
                        })
                      }
                    />
                    Gallery
                  </label>
                  <button
                    onClick={async () => {
                      if (!window.confirm('Delete this unused image?')) return;
                      try {
                        await api(`${base}/media/${a.id}`, { method: 'DELETE' });
                        setData({ ...data, assets: data.assets.filter((x) => x.id !== a.id) });
                        setMessage('Image deleted');
                      } catch (e) {
                        setMessage((e as Error).message);
                      }
                    }}
                  >
                    Delete unused image
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}
        {tab === 'Categories' && (
          <section className="panel">
            <h2>Menu categories</h2>
            <p>
              Archiving hides this category and its items on your next publication. Existing items
              are preserved.
            </p>
            {!draft.categories.length && (
              <p>No categories yet. Create your first category below.</p>
            )}
            {draft.categories.map((c, n) => (
              <fieldset key={c.id}>
                <legend>Category {n + 1}</legend>
                <Field
                  label="Name"
                  value={c.name}
                  onChange={(v) =>
                    change((d) => {
                      d.categories[n].name = v;
                    })
                  }
                />
                <Field
                  label="Description"
                  value={c.description}
                  onChange={(v) =>
                    change((d) => {
                      d.categories[n].description = v;
                    })
                  }
                />
                {asset('Category image', c.image, (id) =>
                  change((d) => {
                    d.categories[n].image = id;
                  })
                )}
                <button
                  disabled={n === 0}
                  onClick={() =>
                    change((d) => {
                      reorder(d.categories, n, -1);
                      d.categories.forEach((c, i) => (c.order = i));
                    })
                  }
                >
                  Move up
                </button>
                <button
                  disabled={n === draft.categories.length - 1}
                  onClick={() =>
                    change((d) => {
                      reorder(d.categories, n, 1);
                      d.categories.forEach((c, i) => (c.order = i));
                    })
                  }
                >
                  Move down
                </button>
                <button
                  onClick={() => {
                    if (
                      c.active &&
                      !window.confirm(
                        'Archive this category? Its items stay saved and will be hidden after publishing.'
                      )
                    )
                      return;
                    change((d) => {
                      d.categories[n].active = !c.active;
                    });
                  }}
                >
                  {c.active ? 'Archive category' : 'Restore category'}
                </button>
              </fieldset>
            ))}
            <button
              onClick={() =>
                change((d) => {
                  d.categories.push({
                    id: uid(),
                    name: 'New category',
                    description: '',
                    image: null,
                    order: d.categories.length,
                    active: true,
                  });
                })
              }
            >
              Add category
            </button>
          </section>
        )}
        {tab === 'Items' && (
          <section className="panel">
            <h2>Your menu</h2>
            <p>
              Prices, names and item content become public when published. Sold-out controls take
              effect immediately.
            </p>
            {!draft.categories.length && <p>Create a category first.</p>}
            {draft.items.map((item) => (
              <details className="item-editor" key={item.id}>
                <summary>
                  {item.name} · {formatMoney(item.price, s.currency)} · {item.state}
                </summary>
                <div className="form-grid">
                  <Field
                    label="Item name"
                    value={item.name}
                    onChange={(v) =>
                      itemEdit(item.id, (i) => {
                        i.name = v;
                      })
                    }
                  />
                  <label>
                    Category
                    <select
                      aria-label="Category"
                      value={item.categoryId}
                      onChange={(e) =>
                        itemEdit(item.id, (i) => {
                          i.categoryId = e.target.value;
                        })
                      }
                    >
                      {draft.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {!c.active && ' (archived)'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label={`Base price (${s.currency}, minor units)`}
                    type="number"
                    value={item.price}
                    onChange={(v) =>
                      itemEdit(item.id, (i) => {
                        i.price = Number(v);
                      })
                    }
                  />
                  <Field
                    label="Preparation estimate (minutes)"
                    type="number"
                    value={item.preparationMinutes}
                    onChange={(v) =>
                      itemEdit(item.id, (i) => {
                        i.preparationMinutes = Number(v);
                      })
                    }
                  />
                  <label>
                    State
                    <select
                      aria-label="State"
                      value={item.state}
                      onChange={(e) =>
                        itemEdit(item.id, (i) => {
                          i.state = e.target.value as Item['state'];
                        })
                      }
                    >
                      {['draft', 'active', 'archived'].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  {asset('Dish image', item.image, (id) =>
                    itemEdit(item.id, (i) => {
                      i.image = id;
                    })
                  )}
                </div>
                <Field
                  label="Description"
                  value={item.description}
                  onChange={(v) =>
                    itemEdit(item.id, (i) => {
                      i.description = v;
                    })
                  }
                />
                <Field
                  label="Dietary labels (restaurant supplied)"
                  value={item.dietary}
                  onChange={(v) =>
                    itemEdit(item.id, (i) => {
                      i.dietary = v;
                    })
                  }
                />
                <Field
                  label="Allergen information (restaurant supplied)"
                  value={item.allergens}
                  onChange={(v) =>
                    itemEdit(item.id, (i) => {
                      i.allergens = v;
                    })
                  }
                />
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={item.featured}
                    onChange={(e) =>
                      itemEdit(item.id, (i) => {
                        i.featured = e.target.checked;
                      })
                    }
                  />
                  Featured dish
                </label>
                <h3>Variants</h3>
                <p className="fine-print">
                  A variant replaces the base price. Modifiers add to the selected price.
                </p>
                {item.variants.map((v, n) => (
                  <fieldset key={v.id}>
                    <Field
                      label="Variant name"
                      value={v.name}
                      onChange={(value) =>
                        itemEdit(item.id, (i) => {
                          i.variants[n].name = value;
                        })
                      }
                    />
                    <Field
                      label="Replacement price (minor units)"
                      type="number"
                      value={v.price}
                      onChange={(value) =>
                        itemEdit(item.id, (i) => {
                          i.variants[n].price = Number(value);
                        })
                      }
                    />
                    <button onClick={() => itemEdit(item.id, (i) => reorder(i.variants, n, -1))}>
                      Move up
                    </button>
                    <button onClick={() => itemEdit(item.id, (i) => reorder(i.variants, n, 1))}>
                      Move down
                    </button>
                    <button
                      onClick={() =>
                        itemEdit(item.id, (i) => {
                          i.variants.splice(n, 1);
                        })
                      }
                    >
                      Remove variant
                    </button>
                  </fieldset>
                ))}
                <button
                  onClick={() =>
                    itemEdit(item.id, (i) => {
                      i.variants.push({ id: uid(), name: 'New portion', price: i.price });
                    })
                  }
                >
                  Add variant
                </button>
                <h3>Modifier groups</h3>
                {item.modifiers.map((g, n) => (
                  <fieldset key={g.id}>
                    <legend>{g.name}</legend>
                    <Field
                      label="Group name"
                      value={g.name}
                      onChange={(v) =>
                        itemEdit(item.id, (i) => {
                          i.modifiers[n].name = v;
                        })
                      }
                    />
                    <div className="inline-fields">
                      <Field
                        label="Minimum (0 = optional)"
                        type="number"
                        value={g.min}
                        onChange={(v) =>
                          itemEdit(item.id, (i) => {
                            i.modifiers[n].min = Number(v);
                          })
                        }
                      />
                      <Field
                        label="Maximum"
                        type="number"
                        value={g.max}
                        onChange={(v) =>
                          itemEdit(item.id, (i) => {
                            i.modifiers[n].max = Number(v);
                          })
                        }
                      />
                    </div>
                    {g.options.map((o, k) => (
                      <fieldset key={o.id}>
                        <Field
                          label="Option name"
                          value={o.name}
                          onChange={(v) =>
                            itemEdit(item.id, (i) => {
                              i.modifiers[n].options[k].name = v;
                            })
                          }
                        />
                        <Field
                          label="Price addition (minor units)"
                          type="number"
                          value={o.price}
                          onChange={(v) =>
                            itemEdit(item.id, (i) => {
                              i.modifiers[n].options[k].price = Number(v);
                            })
                          }
                        />
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={o.available}
                            onChange={(e) =>
                              itemEdit(item.id, (i) => {
                                i.modifiers[n].options[k].available = e.target.checked;
                              })
                            }
                          />
                          Available
                        </label>
                        <button
                          onClick={() =>
                            itemEdit(item.id, (i) => reorder(i.modifiers[n].options, k, -1))
                          }
                        >
                          Move option up
                        </button>
                        <button
                          onClick={() =>
                            itemEdit(item.id, (i) => reorder(i.modifiers[n].options, k, 1))
                          }
                        >
                          Move option down
                        </button>
                        <button
                          onClick={() =>
                            itemEdit(item.id, (i) => {
                              i.modifiers[n].options.splice(k, 1);
                            })
                          }
                        >
                          Remove option
                        </button>
                      </fieldset>
                    ))}
                    <button
                      onClick={() =>
                        itemEdit(item.id, (i) => {
                          i.modifiers[n].options.push({
                            id: uid(),
                            name: 'New option',
                            price: 0,
                            available: true,
                          });
                        })
                      }
                    >
                      Add option
                    </button>
                    <button onClick={() => itemEdit(item.id, (i) => reorder(i.modifiers, n, -1))}>
                      Move group up
                    </button>
                    <button onClick={() => itemEdit(item.id, (i) => reorder(i.modifiers, n, 1))}>
                      Move group down
                    </button>
                    <button
                      onClick={() =>
                        itemEdit(item.id, (i) => {
                          i.modifiers.splice(n, 1);
                        })
                      }
                    >
                      Remove group
                    </button>
                  </fieldset>
                ))}
                <button
                  onClick={() =>
                    itemEdit(item.id, (i) => {
                      i.modifiers.push({
                        id: uid(),
                        name: 'Extras',
                        min: 0,
                        max: 1,
                        options: [{ id: uid(), name: 'Extra', price: 0, available: true }],
                      });
                    })
                  }
                >
                  Add modifier group
                </button>
                <AvailabilityEditor itemId={item.id} base={base} onMessage={setMessage} />
              </details>
            ))}
            <button
              disabled={!draft.categories.length}
              onClick={() =>
                change((d) => {
                  d.items.push({
                    id: uid(),
                    categoryId: d.categories[0].id,
                    name: 'New dish',
                    description: '',
                    image: null,
                    price: 0,
                    preparationMinutes: 0,
                    featured: false,
                    dietary: '',
                    allergens: '',
                    state: 'draft',
                    variants: [],
                    modifiers: [],
                  });
                })
              }
            >
              Add menu item
            </button>
          </section>
        )}
        {tab === 'Website' && (
          <section className="panel">
            <h2>Your restaurant, beautifully told.</h2>
            <Field
              label="Hero title / page title"
              value={draft.theme.title}
              onChange={(v) =>
                change((d) => {
                  d.theme.title = v;
                })
              }
            />
            <Field
              label="Hero description / SEO description"
              value={draft.theme.description}
              onChange={(v) =>
                change((d) => {
                  d.theme.description = v;
                })
              }
            />
            <label>
              Our story
              <textarea
                aria-label="Our story"
                value={draft.theme.story}
                onChange={(e) =>
                  change((d) => {
                    d.theme.story = e.target.value;
                  })
                }
              />
            </label>
            <label>
              Policy content
              <textarea
                aria-label="Policy content"
                value={draft.theme.policy}
                onChange={(e) =>
                  change((d) => {
                    d.theme.policy = e.target.value;
                  })
                }
              />
            </label>
            <label>
              Brand palette
              <select
                aria-label="Brand palette"
                value={draft.theme.color}
                onChange={(e) =>
                  change((d) => {
                    d.theme.color = e.target.value as Draft['theme']['color'];
                  })
                }
              >
                {['forest', 'navy', 'terracotta'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Typography
              <select
                aria-label="Typography"
                value={draft.theme.font}
                onChange={(e) =>
                  change((d) => {
                    d.theme.font = e.target.value as Draft['theme']['font'];
                  })
                }
              >
                <option>serif</option>
                <option>sans</option>
              </select>
            </label>
            <h3>Homepage sections</h3>
            {draft.theme.sections.map((s, n) => (
              <div key={s.name} className="section-row">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={s.visible}
                    onChange={(e) =>
                      change((d) => {
                        d.theme.sections[n].visible = e.target.checked;
                      })
                    }
                  />
                  {s.name}
                </label>
                <button
                  disabled={n === 0}
                  onClick={() => change((d) => reorder(d.theme.sections, n, -1))}
                >
                  Move up
                </button>
                <button
                  disabled={n === draft.theme.sections.length - 1}
                  onClick={() => change((d) => reorder(d.theme.sections, n, 1))}
                >
                  Move down
                </button>
              </div>
            ))}
          </section>
        )}
        {tab === 'Preview' && (
          <section>
            <h2>Private preview · saved draft</h2>
            {dirty && <p className="notice">Save changes to include them in this preview.</p>}
            <div className="editor-tabs">
              {[
                ['Mobile', '390px'],
                ['Tablet', '768px'],
                ['Desktop', '100%'],
              ].map(([name, width]) => (
                <button
                  key={name}
                  aria-pressed={viewport === width}
                  onClick={() => setViewport(width)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="preview-frame" style={{ width: viewport, maxWidth: '100%' }}>
              <RestaurantSite
                data={{ draft: data.draft, assets: data.assets }}
                slug="preview"
                restaurantId={restaurantId}
              />
            </div>
          </section>
        )}
        {tab === 'Publish' && (
          <section className="panel">
            <h2>Ready to welcome the world?</h2>
            <p>
              {dirty
                ? 'Save your changes before publishing.'
                : data.publication?.draft_version === data.version
                  ? 'Your saved draft matches the current publication.'
                  : 'You have unpublished saved changes.'}
            </p>
            <h3>Publishing readiness</h3>
            {data.issues.length ? (
              <ul>
                {data.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <p>All required profile, hours, imagery and menu details are saved.</p>
            )}
            <button
              disabled={busy || dirty || !!data.issues.length}
              onClick={() => publish('publish')}
            >
              Publish saved draft
            </button>
            <button
              disabled={busy || !data.publication || dirty}
              onClick={() => {
                if (
                  window.confirm('Unpublish your website? Visitors will lose access immediately.')
                )
                  publish('unpublish');
              }}
            >
              Unpublish website
            </button>
            <h3>Publication history</h3>
            {data.history.map((h) => (
              <p key={h.id}>
                Revision {h.draft_version} · {new Date(h.created_at).toLocaleString()}
              </p>
            ))}
          </section>
        )}
      </main>
      <footer>ZAYQORA · BY VIRELEO · Phase 2: menu browsing and restaurant websites</footer>
    </div>
  );
}
function AvailabilityEditor({
  itemId,
  base,
  onMessage,
}: {
  itemId: string;
  base: string;
  onMessage: (message: string) => void;
}) {
  const [value, setValue] = useState<Availability>({
    soldOut: false,
    enabled: true,
    serviceModes: ['dine_in'],
    hours: null,
  });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api<Availability>(`${base}/menu/items/${itemId}/availability`)
      .then((v) => {
        setValue(v);
        setLoaded(true);
      })
      .catch(() => {});
  }, [base, itemId]);
  return (
    <fieldset>
      <legend>Operational availability · immediate</legend>
      {!loaded && <p>Save this item first to enable availability controls.</p>}
      <label className="check-row">
        <input
          type="checkbox"
          checked={value.soldOut}
          onChange={(e) => setValue({ ...value, soldOut: e.target.checked })}
        />
        Sold out
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => setValue({ ...value, enabled: e.target.checked })}
        />
        Enabled for browsing availability
      </label>
      {(['dine_in', 'takeaway', 'delivery'] as const).map((mode) => (
        <label key={mode} className="check-row">
          <input
            type="checkbox"
            checked={value.serviceModes.includes(mode)}
            onChange={(e) =>
              setValue({
                ...value,
                serviceModes: e.target.checked
                  ? [...value.serviceModes, mode]
                  : value.serviceModes.filter((m) => m !== mode),
              })
            }
          />
          {mode.replace('_', ' ')}
        </label>
      ))}
      <label className="check-row">
        <input
          type="checkbox"
          checked={!!value.hours}
          onChange={(e) =>
            setValue({
              ...value,
              hours: e.target.checked
                ? { week: Array.from({ length: 7 }, () => []), exceptions: [] }
                : null,
            })
          }
        />
        Restrict to a weekly schedule
      </label>
      {value.hours && (
        <HoursEditor value={value.hours} onChange={(hours) => setValue({ ...value, hours })} />
      )}
      <button
        disabled={!loaded}
        onClick={async () => {
          try {
            await api(`${base}/menu/items/${itemId}/availability`, {
              method: 'PATCH',
              body: JSON.stringify(value),
            });
            onMessage('Operational availability updated immediately');
          } catch (e) {
            onMessage((e as Error).message);
          }
        }}
      >
        Apply availability now
      </button>
    </fieldset>
  );
}
