'use client';
import { useEffect, useRef, useState } from 'react';
import { configurationPrice, formatMoney, isOpen, type Draft, type Item } from '@zayqora/contracts';
import { api } from '../../lib/api-client';
export type SiteData = {
  draft: Draft;
  revision?: string;
  open?: boolean;
  assets: { id: string; alt: string }[];
  availability?: Record<
    string,
    { soldOut: boolean; enabled: boolean; scheduled: boolean; serviceModes: string[] }
  >;
};
export function RestaurantSite({
  data,
  slug,
  page = 'home',
  restaurantId,
}: {
  data: SiteData;
  slug: string;
  page?: string;
  restaurantId?: string;
}) {
  const [live, setLive] = useState(data);
  useEffect(() => {
    setLive(data);
  }, [data]);
  useEffect(() => {
    if (restaurantId) return;
    const timer = window.setInterval(() => {
      api<SiteData>(`/public/restaurants/${slug}`)
        .then((next) => {
          if (next.revision !== data.revision) {
            window.location.reload();
            return;
          }
          setLive(next);
        })
        .catch(() => window.location.reload());
    }, 15000);
    return () => window.clearInterval(timer);
  }, [slug, restaurantId, data.revision]);
  const { draft: d } = live;
  const s = d.settings,
    t = d.theme;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<Item | null>(null);
  const [variant, setVariant] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [result, setResult] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const visibleItems = d.items.filter(
    (i) => i.state === 'active' && d.categories.some((c) => c.id === i.categoryId && c.active)
  );
  const enabled = (name: string) => t.sections.some((s) => s.name === name && s.visible);
  const base = `/r/${slug}`;
  const imageUrl = (id: string) =>
    restaurantId
      ? `/api/v1/restaurants/${restaurantId}/media/${id}`
      : `/api/v1/public/restaurants/${slug}/media/${id}`;
  function image(id: string | null, className = '') {
    if (!id) return null;
    return (
      <img
        className={className}
        src={imageUrl(id)}
        alt={data.assets.find((a) => a.id === id)?.alt || ''}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.hidden = true;
        }}
      />
    );
  }
  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  function card(item: Item) {
    const a = live.availability?.[item.id];
    const unavailable = a?.soldOut || a?.enabled === false || a?.scheduled === false;
    return (
      <article className="dish-card" key={item.id}>
        {image(item.image)}
        <div>
          <h3>{item.name}</h3>
          <p>{item.description}</p>
          <strong>{formatMoney(item.price, s.currency)}</strong>
          <p className="fine-print">
            {a?.soldOut
              ? 'Sold out'
              : unavailable
                ? 'Currently unavailable'
                : 'Available on the menu'}
          </p>
          <button
            onClick={(e) => {
              trigger.current = e.currentTarget;
              setSelected(item);
              setVariant('');
              setOptions([]);
              setResult('');
            }}
          >
            View dish
          </button>
        </div>
      </article>
    );
  }
  const menu = (
    <section id="menu">
      <p className="eyebrow">MADE WITH CARE</p>
      <h2>Our menu</h2>
      <label>
        Search dishes
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find something delicious"
        />
      </label>
      <nav className="category-nav" aria-label="Menu categories">
        <button aria-pressed={!category} onClick={() => setCategory('')}>
          All dishes
        </button>
        {d.categories
          .filter((c) => c.active)
          .sort((a, b) => a.order - b.order)
          .map((c) => (
            <button key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
              {c.name}
            </button>
          ))}
      </nav>
      <div className="dish-grid">
        {visibleItems
          .filter(
            (i) =>
              (!category || i.categoryId === category) &&
              `${i.name} ${i.description}`.toLowerCase().includes(search.toLowerCase())
          )
          .map(card)}
      </div>
      {!visibleItems.some(
        (i) =>
          (!category || i.categoryId === category) &&
          `${i.name} ${i.description}`.toLowerCase().includes(search.toLowerCase())
      ) && <p>No matching dishes. Try another search or category.</p>}
    </section>
  );
  const hours = (
    <section id="hours">
      <p className="eyebrow">COME FIND US</p>
      <h2>Hours & location</h2>
      <p>{s.address}</p>
      <p>
        {(live.open ?? isOpen(s.hours, s.timezone))
          ? 'Restaurant open'
          : 'Restaurant closed — you can still browse our menu'}
      </p>
      <p className="fine-print">
        All hours in {s.timezone}. Overnight hours belong to the starting day.
      </p>
      <dl>
        {s.hours.week.map((intervals, day) => (
          <div key={day}>
            <dt>
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}
            </dt>
            <dd>
              {intervals.length
                ? intervals
                    .map(
                      (i) =>
                        `${String(Math.floor(i.start / 60)).padStart(2, '0')}:${String(i.start % 60).padStart(2, '0')}–${String(Math.floor(i.end / 60)).padStart(2, '0')}:${String(i.end % 60).padStart(2, '0')}${i.end < i.start ? ' (+1 day)' : ''}`
                    )
                    .join(', ')
                : 'Closed'}
            </dd>
          </div>
        ))}
      </dl>
      {s.hours.exceptions.map((e) => (
        <p key={e.date}>
          {e.date}: {e.label}{' '}
          {e.intervals.length
            ? e.intervals
                .map(
                  (i) =>
                    `${Math.floor(i.start / 60)}:${String(i.start % 60).padStart(2, '0')}–${Math.floor(i.end / 60)}:${String(i.end % 60).padStart(2, '0')}`
                )
                .join(', ')
            : 'Closed'}
        </p>
      ))}
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`}
        target="_blank"
        rel="noreferrer"
      >
        Get directions ↗
      </a>
    </section>
  );
  const about = t.story ? (
    <section id="about">
      <p className="eyebrow">OUR STORY</p>
      <h2>A place at our table.</h2>
      <p className="story-copy">{t.story}</p>
    </section>
  ) : null;
  const gallery = t.gallery.length ? (
    <section id="gallery">
      <h2>A taste of the atmosphere</h2>
      <div className="gallery-grid">
        {t.gallery.map((id) => (
          <div key={id}>{image(id)}</div>
        ))}
      </div>
    </section>
  ) : null;
  const contact = (
    <section id="contact">
      <h2>Say hello.</h2>
      <p>{s.address}</p>
      <a href={`tel:${s.phone.replace(/[^+\d]/g, '')}`}>{s.phone}</a>
      <br />
      <a href={`mailto:${s.email}`}>{s.email}</a>
    </section>
  );
  const sections: Record<string, React.ReactNode> = {
    hero: (
      <section className="restaurant-hero">
        {image(s.cover, 'hero-photo')}
        <div>
          <p className="eyebrow">
            {s.category} · {s.name}
          </p>
          <h1>{t.title}</h1>
          <p>{t.description || s.description}</p>
          <a className="site-primary" href={restaurantId ? '#menu' : `${base}/menu`}>
            View Menu ↗
          </a>
        </div>
      </section>
    ),
    featured: visibleItems.some((i) => i.featured) ? (
      <section>
        <p className="eyebrow">THE HOUSE FAVORITES</p>
        <h2>Something to remember.</h2>
        <div className="dish-grid">{visibleItems.filter((i) => i.featured).map(card)}</div>
      </section>
    ) : null,
    menu,
    about,
    gallery,
    hours,
    contact,
  };
  return (
    <div className={`restaurant-site theme-${t.color} font-${t.font}`}>
      <header className="restaurant-header">
        <a href={restaurantId ? '#' : base} className="restaurant-brand">
          {image(s.logo)}
          {s.name}
        </a>
        <nav aria-label="Restaurant navigation">
          <a href={restaurantId ? '#menu' : `${base}/menu`}>Menu</a>
          {enabled('about') && t.story && (
            <a href={restaurantId ? '#about' : `${base}/about`}>Our story</a>
          )}
          {enabled('gallery') && t.gallery.length > 0 && (
            <a href={restaurantId ? '#gallery' : `${base}/gallery`}>Gallery</a>
          )}
          {enabled('contact') && (
            <a href={restaurantId ? '#contact' : `${base}/contact`}>Contact</a>
          )}
        </nav>
      </header>
      <main>
        {page === 'home' ? (
          t.sections.filter((s) => s.visible).map((s) => <div key={s.name}>{sections[s.name]}</div>)
        ) : page === 'menu' ? (
          menu
        ) : page === 'about' && enabled('about') ? (
          about
        ) : page === 'gallery' && enabled('gallery') ? (
          gallery
        ) : page === 'contact' && enabled('contact') ? (
          <>
            {hours}
            {contact}
          </>
        ) : (
          <p>This page is unavailable.</p>
        )}
      </main>
      <footer>
        <strong>{s.name}</strong>
        <p>{s.description}</p>
        <p>{s.serviceModes.map((m) => m.replace('_', ' ')).join(' · ')}</p>
        {t.policy && <p>{t.policy}</p>}
        <small>Powered by ZAYQORA · Menu browsing only</small>
      </footer>
      <dialog
        ref={dialog}
        onCancel={() => {
          setSelected(null);
          trigger.current?.focus();
        }}
        aria-labelledby="dish-title"
        onClose={() => {
          setSelected(null);
          trigger.current?.focus();
        }}
      >
        {selected && (
          <>
            <button
              className="dialog-close"
              onClick={() => dialog.current?.close()}
              aria-label="Close dish details"
            >
              ✕
            </button>
            {image(selected.image)}
            <h2 id="dish-title">{selected.name}</h2>
            <p>{selected.description}</p>
            {selected.dietary && <p>Dietary labels: {selected.dietary}</p>}
            {selected.allergens && <p>Allergens: {selected.allergens}</p>}
            <p className="fine-print">
              Dietary and allergen information is supplied by the restaurant. Please contact them
              about your needs.
            </p>
            {selected.variants.length > 0 && (
              <label>
                Choose a variant
                <select
                  aria-label="Choose a variant"
                  value={variant}
                  onChange={(e) => {
                    setVariant(e.target.value);
                    setResult('');
                  }}
                >
                  <option value="">Select a portion</option>
                  {selected.variants.map((v) => (
                    <option value={v.id} key={v.id}>
                      {v.name} — {formatMoney(v.price, s.currency)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selected.modifiers.map((g) => (
              <fieldset key={g.id}>
                <legend>
                  {g.name} · choose {g.min}–{g.max}
                </legend>
                {g.options.map((o) => (
                  <label className="check-row" key={o.id}>
                    <input
                      type="checkbox"
                      disabled={!o.available}
                      checked={options.includes(o.id)}
                      onChange={(e) => {
                        setOptions(
                          e.target.checked
                            ? [...options, o.id]
                            : options.filter((id) => id !== o.id)
                        );
                        setResult('');
                      }}
                    />
                    {o.name} (+{formatMoney(o.price, s.currency)}){!o.available && ' · Unavailable'}
                  </label>
                ))}
              </fieldset>
            ))}
            <p>
              {(() => {
                try {
                  return `Indicative menu price: ${formatMoney(configurationPrice(selected, variant || undefined, options), s.currency)}`;
                } catch (e) {
                  return (e as Error).message;
                }
              })()}
            </p>
            <button
              onClick={async () => {
                try {
                  if (restaurantId) {
                    setResult(
                      `Preview price: ${formatMoney(configurationPrice(selected, variant || undefined, options), s.currency)}`
                    );
                    return;
                  }
                  const r = await api<{ price: number; currency: string; label: string }>(
                    `/public/restaurants/${slug}/menu/configuration`,
                    {
                      method: 'POST',
                      body: JSON.stringify({
                        revision: data.revision,
                        itemId: selected.id,
                        variantId: variant || undefined,
                        options,
                      }),
                    }
                  );
                  setResult(`${formatMoney(r.price, r.currency)} · ${r.label}`);
                } catch (e) {
                  setResult((e as Error).message);
                }
              }}
            >
              Validate menu pricing
            </button>
            <p role="status">{result}</p>
            <p className="fine-print">
              Menu pricing only. Ordering, checkout and reservations are not available here.
            </p>
          </>
        )}
      </dialog>
    </div>
  );
}
