import type { PoolClient } from 'pg';
import { ConflictError, ValidationError } from '../../shared/errors/app-error.js';
import { q } from './operations.repository.js';
import { args, audit, enabled, found, type Context } from './access.service.js';
export async function adjustStock(c: PoolClient, a: Context, input: any) {
  await enabled(c, a, 'inventory');
  const previous = (await q(c, 'stockPrevious', [...args(a), input.key]))[0];
  if (previous) {
    if (
      previous.ingredient_id !== input.ingredientId ||
      previous.location_id !== input.locationId ||
      previous.kind !== input.kind ||
      previous.reason !== input.reason ||
      Number(previous.quantity) !==
        input.quantity * (input.unit === 'kg' || input.unit === 'l' ? 1000 : 1)
    )
      throw new ConflictError('Stock operation key reused');
    return previous;
  }
  const ingredient = found((await q(c, 'ingredientGet', [...args(a), input.ingredientId]))[0]);
  const factor =
    input.unit === ingredient.unit
      ? 1
      : input.unit === 'kg' && ingredient.unit === 'g'
        ? 1000
        : input.unit === 'l' && ingredient.unit === 'ml'
          ? 1000
          : 0;
  if (!factor) throw new ValidationError('Incompatible unit dimension');
  const quantity = input.quantity * factor;
  if (!Number.isSafeInteger(quantity) || quantity === 0 || Math.abs(quantity) > 1000000000000)
    throw new ValidationError('Quantity exceeds exact supported range');
  if (['RECEIPT', 'OPENING'].includes(input.kind) && quantity < 0)
    throw new ValidationError('Receipt quantity must be positive');
  if (input.kind === 'WASTE' && quantity > 0) throw new ValidationError('Waste must reduce stock');
  await q(c, 'balanceEnsure', [...args(a), input.ingredientId, input.locationId]);
  const b = (await q(c, 'balance', [...args(a), input.ingredientId, input.locationId]))[0];
  if (!Number.isSafeInteger(Number(b.quantity) + quantity))
    throw new ValidationError('Stock balance exceeds exact supported range');
  if (Number(b.quantity) + quantity < Number(b.reserved))
    throw new ConflictError('Adjustment would consume reserved or unavailable stock');
  const movement = (
    await q(c, 'stockMovement', [
      ...args(a),
      input.ingredientId,
      input.locationId,
      quantity,
      input.kind,
      input.key,
      null,
      input.reason,
      a.userId,
    ])
  )[0];
  await q(c, 'balanceChange', [...args(a), input.ingredientId, input.locationId, quantity, 0]);
  await audit(c, a, 'stock', movement.id, input.kind, input.reason);
  return movement;
}
export async function saveRecipe(c: PoolClient, a: Context, input: any) {
  const { b } = await enabled(c, a, 'inventory');
  const item = b.content.items.find((i: any) => i.id === input.itemId);
  if (
    !item ||
    (input.variantId && !item.variants.some((v: any) => v.id === input.variantId)) ||
    (input.optionId &&
      !item.modifiers.some((g: any) => g.options.some((o: any) => o.id === input.optionId)))
  )
    throw new ValidationError(
      'Recipe must reference a published item and its own variant/modifier'
    );
  await q(c, 'recipeOld', [...args(a), input.itemId, input.variantId, input.optionId]);
  const r = (
    await q(c, 'recipe', [
      ...args(a),
      input.itemId,
      input.variantId,
      input.optionId,
      input.locationId,
    ])
  )[0];
  for (const component of input.components)
    await q(c, 'component', [...args(a), r.id, component.ingredientId, component.quantity]);
  await q(c, 'track', [...args(a), input.itemId]);
  await audit(c, a, 'recipe', r.id, 'VERSIONED', 'Recipe configuration');
  return r;
}
export async function reserveIngredients(c: PoolClient, o: any) {
  const items = await q(c, 'items', [o.restaurant_id, o.id]);
  for (const item of items) {
    const s = item.snapshot;
    if (!(await q(c, 'tracked', [o.restaurant_id, o.branch_id, s.itemId])).length) continue;
    const recipes = await q(c, 'recipes', [o.restaurant_id, o.branch_id, s.itemId]);
    const base =
      recipes.find((r) => r.variant_id === s.variantId && !r.option_id) ??
      recipes.find((r) => !r.variant_id && !r.option_id);
    if (!base) throw new ConflictError(`Missing recipe for tracked item: ${s.name}`);
    const selected = [
      base,
      ...recipes.filter(
        (r) =>
          r.option_id &&
          s.options.includes(r.option_id) &&
          (!r.variant_id || r.variant_id === s.variantId)
      ),
    ];
    for (const recipe of selected) {
      for (const component of await q(c, 'components', [o.restaurant_id, o.branch_id, recipe.id])) {
        const quantity = Number(component.quantity) * s.quantity;
        if (!Number.isSafeInteger(quantity)) throw new ValidationError('Recipe quantity overflow');
        await q(c, 'balanceEnsure', [
          o.restaurant_id,
          o.branch_id,
          component.ingredient_id,
          recipe.location_id,
        ]);
        const b = (
          await q(c, 'balance', [
            o.restaurant_id,
            o.branch_id,
            component.ingredient_id,
            recipe.location_id,
          ])
        )[0];
        const inserted = await q(c, 'stockReserve', [
          o.restaurant_id,
          o.branch_id,
          o.id,
          item.id,
          recipe.id,
          component.ingredient_id,
          recipe.location_id,
          quantity,
        ]);
        if (!inserted.length) continue;
        if (Number(b.quantity) - Number(b.reserved) < quantity)
          throw new ConflictError(`Ingredient shortage for ${s.name}; acceptance blocked`);
        await q(c, 'balanceChange', [
          o.restaurant_id,
          o.branch_id,
          component.ingredient_id,
          recipe.location_id,
          0,
          quantity,
        ]);
      }
    }
  }
}
export async function resolveIngredients(c: PoolClient, o: any, consume: boolean) {
  for (const r of await q(c, 'reservations', [o.restaurant_id, o.id])) {
    const n = Number(r.quantity);
    await q(c, 'balanceChange', [
      o.restaurant_id,
      o.branch_id,
      r.ingredient_id,
      r.location_id,
      consume ? -n : 0,
      -n,
    ]);
    if (consume)
      await q(c, 'stockMovement', [
        o.restaurant_id,
        o.branch_id,
        r.ingredient_id,
        r.location_id,
        -n,
        'CONSUMPTION',
        'consume:' + r.id,
        o.id,
        'Preparation started',
        null,
      ]);
    await q(c, 'reserveState', [r.id, consume ? 'CONSUMED' : 'RELEASED']);
  }
}

export async function preparedWaste(c: PoolClient, a: Context, input: any) {
  const previous = (await q(c, 'wastePrevious', [...args(a), input.key]))[0];
  if (previous) {
    if (
      previous.reservation_id !== input.reservationId ||
      Number(previous.quantity) !== input.quantity
    )
      throw new ConflictError('Waste operation key reused');
    return previous;
  }
  const r = found((await q(c, 'consumedForWaste', [...args(a), input.reservationId]))[0]);
  const recorded = Number((await q(c, 'wasteSum', [r.id]))[0].n);
  if (input.quantity > Number(r.quantity) - recorded)
    throw new ConflictError('Waste exceeds consumed quantity not already reported');
  const result = (
    await q(c, 'wasteRecord', [...args(a), r.id, input.quantity, input.key, input.reason, a.userId])
  )[0];
  await q(c, 'preparedWaste', [
    ...args(a),
    r.ingredient_id,
    r.location_id,
    'waste:' + input.key,
    r.order_id,
    input.reason,
    a.userId,
    input.quantity,
  ]);
  await audit(c, a, 'stock', r.id, 'PREPARED_WASTE', input.reason, { quantity: input.quantity });
  return result;
}
