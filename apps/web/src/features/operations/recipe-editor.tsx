'use client';
import { useState, useRef } from 'react';
export function RecipeEditor({
  catalog,
  inventory,
  save,
}: {
  catalog: any;
  inventory: any;
  save: (input: any, key: string) => Promise<unknown>;
}) {
  const [itemId, setItemId] = useState(''),
    [rows, setRows] = useState([{ ingredientId: '', quantity: 1000 }]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const requestKey = useRef('');
  const item = catalog?.items.find((i: any) => i.id === itemId);
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const values = new FormData(e.currentTarget);
        try {
          requestKey.current = requestKey.current || crypto.randomUUID();
          await save(
            {
              itemId,
              variantId: values.get('variantId') || null,
              optionId: values.get('optionId') || null,
              locationId: values.get('locationId'),
              components: rows,
            },
            requestKey.current
          );
          requestKey.current = '';
          setMessage(
            'New recipe version saved. Accepted orders retain their original requirements.'
          );
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Version a recipe</h2>
      <label>
        Published item
        <select required value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">Choose item</option>
          {catalog?.items.map((i: any) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Variant override
        <select name="variantId">
          <option value="">Base recipe</option>
          {item?.variants.map((v: any) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Modifier ingredient addition
        <select name="optionId">
          <option value="">No modifier</option>
          {item?.modifiers.flatMap((g: any) =>
            g.options.map((o: any) => (
              <option key={o.id} value={o.id}>
                {g.name}: {o.name}
              </option>
            ))
          )}
        </select>
      </label>
      <label>
        Stock location
        <select name="locationId" required>
          <option value="">Choose location</option>
          {inventory.locations.map((l: any) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      {rows.map((r, index) => (
        <fieldset key={index}>
          <legend>Component {index + 1}</legend>
          <label>
            Ingredient
            <select
              required
              value={r.ingredientId}
              onChange={(e) =>
                setRows(
                  rows.map((v, i) => (i === index ? { ...v, ingredientId: e.target.value } : v))
                )
              }
            >
              <option value="">Choose ingredient</option>
              {inventory.ingredients.map((i: any) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
          </label>
          <label>
            Thousandths of canonical unit per ordered item
            <input
              type="number"
              min={1}
              required
              value={r.quantity}
              onChange={(e) =>
                setRows(
                  rows.map((v, i) => (i === index ? { ...v, quantity: Number(e.target.value) } : v))
                )
              }
            />
          </label>
          {rows.length > 1 && (
            <button
              className="button-danger"
              type="button"
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
            >
              Remove component
            </button>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() => setRows([...rows, { ingredientId: '', quantity: 1000 }])}
      >
        Add ingredient component
      </button>
      <button className="button-primary" disabled={busy}>
        Save recipe version
      </button>
      <p
        role="status"
        data-tone={
          message.startsWith('New recipe version saved') ? 'success' : message ? 'error' : undefined
        }
      >
        {message}
      </p>
    </form>
  );
}
