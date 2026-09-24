import type { Paise } from '@cog/contracts';
import { roundToPaise } from '@cog/money';

/**
 * Quantity takeoff — measuring quantities off a drawing.
 *
 * **Mixed port and replacement.**
 *
 * The measurement arithmetic is ported: `takeoff.js:321` rounds an order
 * quantity with `Math.round(qty * 100) / 100`, two decimals on a float. Here
 * quantities are scaled integers, which is the same intent without the float.
 *
 * The rate derivation is **not** ported. `takeoff.js:337` reads
 * `it.clientRate || Math.round((it.costRate || 100) * 1.25)` — three separate
 * inventions in one line:
 *
 *   **TAKE-01** A missing client rate becomes **cost × 1.25**. A 25% markup
 *   with no stated basis, unrelated to the 4-factor rate engine that the rest
 *   of the system uses to price work. Two pricing models, silently.
 *   **TAKE-02** A missing *cost* rate becomes **100** — a bare number, standing
 *   in for "we do not know what this costs", which then gets marked up and
 *   quoted.
 *   **TAKE-03** `||` means an explicit zero cost also falls through to 100.
 *
 * A quantity surveyor's takeoff feeds a quotation. Inventing the price of work
 * nobody has costed is the defect; the markup being 1.25 is incidental.
 */

/** Quantity in millionths of a unit, matching BOQ and procurement. */
const QUANTITY_SCALE = 1_000_000n;

export class TakeoffError extends Error {
  override readonly name = 'TakeoffError';
}

export interface TakeoffItem {
  readonly id: string;
  readonly description: string;
  readonly uom: string;
  /** Measured off the drawing. Millionths of a unit. */
  readonly measuredQuantity: bigint;
  /**
   * Wastage, in basis points of the measured quantity.
   *
   * Real in this trade — tiles are cut, sheets are trimmed — and explicit here
   * rather than folded into the measurement, so the ordered quantity can be
   * explained to a client.
   */
  readonly wastageBp: number;
  /**
   * What it costs, per unit. **Optional and never invented.**
   *
   * Absent means nobody has costed this item. The legacy substitutes 100.
   */
  readonly costRate?: Paise | undefined;
  /** What we charge, per unit. Absent means unpriced — it is not derived. */
  readonly clientRate?: Paise | undefined;
}

/**
 * The quantity to order: measured plus wastage.
 *
 * Ported from `takeoff.js:321` in intent, exactly rather than through a float.
 */
export function orderQuantity(item: TakeoffItem): bigint {
  if (item.measuredQuantity < 0n) {
    throw new TakeoffError(`item ${item.id} has a negative measured quantity`);
  }
  if (!Number.isInteger(item.wastageBp) || item.wastageBp < 0) {
    throw new TakeoffError(`item ${item.id} has an invalid wastage`);
  }
  // measured × (1 + wastage), exact.
  return item.measuredQuantity + (item.measuredQuantity * BigInt(item.wastageBp)) / 10_000n;
}

export interface TakeoffLineValue {
  readonly orderQuantity: bigint;
  readonly cost: Paise | null;
  readonly value: Paise | null;
}

/**
 * Cost and value for one item.
 *
 * **Fixes TAKE-01…03.** An absent rate yields `null`, not a guess. A takeoff
 * with unpriced items is a takeoff with unpriced items, and the screen should
 * say so rather than showing a number derived from 100 × 1.25.
 */
export function lineValue(item: TakeoffItem): TakeoffLineValue {
  const qty = orderQuantity(item);
  return {
    orderQuantity: qty,
    cost: item.costRate === undefined ? null : roundToPaise(item.costRate * qty, QUANTITY_SCALE),
    value:
      item.clientRate === undefined ? null : roundToPaise(item.clientRate * qty, QUANTITY_SCALE),
  };
}

export interface TakeoffSummary {
  readonly itemCount: number;
  readonly unpricedItems: readonly string[];
  readonly uncostedItems: readonly string[];
  /** Null unless EVERY item is priced. */
  readonly value: Paise | null;
  /** Null unless EVERY item is costed. */
  readonly cost: Paise | null;
}

/**
 * Summarise a takeoff sheet.
 *
 * Names the items that are missing a rate rather than quietly excluding them
 * from a total. A total computed over the priced subset looks complete and is
 * not, which is how an under-priced quotation goes out.
 */
export function summarise(items: readonly TakeoffItem[]): TakeoffSummary {
  const values = items.map((i) => ({ item: i, ...lineValue(i) }));

  const unpriced = values.filter((v) => v.value === null).map((v) => v.item.id);
  const uncosted = values.filter((v) => v.cost === null).map((v) => v.item.id);

  const total = (pick: (v: (typeof values)[number]) => Paise | null): Paise | null =>
    values.some((v) => pick(v) === null)
      ? null
      : (values.reduce((acc, v) => acc + (pick(v) as bigint), 0n) as Paise);

  return {
    itemCount: items.length,
    unpricedItems: unpriced,
    uncostedItems: uncosted,
    value: items.length === 0 ? null : total((v) => v.value),
    cost: items.length === 0 ? null : total((v) => v.cost),
  };
}

/** Whether this sheet may be exported to a BOQ. */
export function assertExportable(items: readonly TakeoffItem[]): void {
  if (items.length === 0) throw new TakeoffError('an empty takeoff cannot be exported');
  const summary = summarise(items);
  if (summary.unpricedItems.length > 0) {
    // The legacy exports regardless, inventing a rate for anything missing one.
    throw new TakeoffError(
      `cannot export: ${summary.unpricedItems.length} item(s) have no client rate (${summary.unpricedItems.join(', ')})`,
    );
  }
}
