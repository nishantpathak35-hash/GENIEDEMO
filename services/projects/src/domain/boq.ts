import type { Paise } from '@cog/contracts';
import { ZERO, add, roundToPaise, sub, sum } from '@cog/money';

/**
 * Bill of quantities.
 *
 * **Mixed port and replacement**, and the split is deliberate:
 *
 * - The *arithmetic* — `amount = quantity × rate` — is ported faithfully.
 * - The *authority* is not. `boq.js:114` reads
 *   `Number(realPayload.amount) || Math.round(qty * rate * 100) / 100`, so a
 *   client-supplied line amount wins whenever it is truthy. That is the same
 *   hole as `purchase-orders/write.js:55` and rule 3 forbids carrying it: the
 *   server computes every monetary figure. There is no verbatim commit for a
 *   defect that must not exist in any commit.
 *
 * Recorded as **BOQ-01** in `docs/STACK-MIGRATION.md`.
 */

/** Quantity in millionths of a unit, matching `services/procurement`. */
const QUANTITY_SCALE = 1_000_000n;

export interface BoqLine {
  readonly id: string;
  readonly description: string;
  readonly uom: string;
  /** Millionths of a unit. 12.375 sqm is 12_375_000. */
  readonly quantity: bigint;
  /** Price per unit, exclusive of tax. */
  readonly rate: Paise;
  /**
   * What the work costs us, per unit. Optional: it is commercial information
   * a client-facing BOQ does not carry.
   *
   * **Never derived.** `BoqView.js:137` invents a missing cost rate as **78% of
   * the selling rate** — a number with no stated basis that then drives every
   * margin figure on the screen. Absent here means absent (BOQ-02, PO-15).
   */
  readonly costRate?: Paise | undefined;
}

export class BoqError extends Error {
  override readonly name = 'BoqError';
}

/**
 * Line amount = quantity × rate.
 *
 * Ported from `boq.js:69` and `:304`, which both compute
 * `Math.round(qty * rate * 100) / 100` — two-decimal rounding on a float. Here
 * the multiplication is exact and rounds once to paise, which is the same
 * intent without the float.
 */
export function lineAmount(line: BoqLine): Paise {
  if (line.quantity < 0n) throw new BoqError(`line ${line.id} has a negative quantity`);
  return roundToPaise(line.rate * line.quantity, QUANTITY_SCALE);
}

/**
 * Line cost = quantity × cost rate, rounded once to paise — the same boundary
 * as `lineAmount`. The caller has checked the line carries a cost rate; one
 * that does not is refused rather than costed at zero.
 */
export function lineCost(line: BoqLine): Paise {
  if (line.costRate === undefined) throw new BoqError(`line ${line.id} has no cost rate`);
  if (line.quantity < 0n) throw new BoqError(`line ${line.id} has a negative quantity`);
  return roundToPaise(line.costRate * line.quantity, QUANTITY_SCALE);
}

export interface BoqTotals {
  readonly lineCount: number;
  readonly value: Paise;
  /** Present only when EVERY line carries a cost rate. */
  readonly cost: Paise | null;
  readonly margin: Paise | null;
}

/**
 * Totals for a schedule.
 *
 * `cost` and `margin` are `null` unless every line has a cost rate. A partial
 * cost total is worse than none: it looks like a margin figure and is computed
 * over a subset, so it silently overstates profitability by however many lines
 * were missing. The legacy fills the gap with the 78% guess instead, which
 * makes the number look complete.
 */
export function boqTotals(lines: readonly BoqLine[]): BoqTotals {
  const value = sum(lines.map(lineAmount));

  const priced = lines.filter((l) => l.costRate !== undefined);
  if (priced.length !== lines.length || lines.length === 0) {
    return { lineCount: lines.length, value, cost: null, margin: null };
  }

  const cost = sum(
    lines.map((l) => roundToPaise((l.costRate as Paise) * l.quantity, QUANTITY_SCALE)),
  );
  return { lineCount: lines.length, value, cost, margin: sub(value, cost) };
}

/**
 * Import an estimation item as a BOQ line.
 *
 * `boq.js:365-366` does this with **quantity hardcoded to 1** and
 * `amount = final_rate_with_gst`, so a tax-inclusive figure becomes a line rate
 * and a rate becomes a line total. Two concepts collapse into one value and
 * neither can be reasoned about afterwards (RATE-05).
 *
 * Here the quantity is explicit and the rate is pre-tax. Whether a BOQ rate
 * should be tax-inclusive at all is **PO-16** and unanswered — so this takes a
 * pre-tax rate and refuses to guess.
 */
export function fromEstimationItem(input: {
  readonly id: string;
  readonly description: string;
  readonly uom: string;
  readonly quantity: bigint;
  readonly preTaxRate: Paise;
}): BoqLine {
  if (input.quantity <= 0n) {
    throw new BoqError('an imported BOQ line needs a real quantity, not a placeholder of 1');
  }
  return {
    id: input.id,
    description: input.description,
    uom: input.uom,
    quantity: input.quantity,
    rate: input.preTaxRate,
  };
}

/** A schedule's lines must be uniquely identified before it can be versioned. */
export function assertLinesUnique(lines: readonly BoqLine[]): void {
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.id)) throw new BoqError(`duplicate BOQ line id ${line.id}`);
    seen.add(line.id);
  }
}

export { ZERO, add };
