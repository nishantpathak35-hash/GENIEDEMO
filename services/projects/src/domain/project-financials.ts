import type { Paise } from '@cog/contracts';
import { ZERO, add, isZero, mulRatio, ratio, roundToPaise, sub, sum } from '@cog/money';

/**
 * The corrected project financial rollup.
 *
 * COMMIT 2 of the two-commit protocol. `project-financials-legacy.ts` records
 * what the old system does; this fixes it, and each fix names the defect row it
 * closes so a changed figure is attributable to a decision rather than to "the
 * rewrite" (ADR-0014 decision 5).
 *
 * | Defect | Fix |
 * |---|---|
 * | **PROJ-01** committed spend and contract value fed by the same number | They are separate inputs with separate meanings. `committed` is the sum of purchase orders; `contractValue` is what the client signed and has no default |
 * | **PROJ-02** an override of exactly zero silently ignored | `contractValue` is `Paise \| null`. Zero is a value; absent is `null` |
 * | **PROJ-03** the project name as the key | Not addressed here — this module takes an id. The key is fixed in migration `0010` |
 * | **PROJ-05** float arithmetic, unfloored balance | Branded `Paise` (`bigint`) throughout; `balance` may be negative and says so |
 * | **PROJ-06** health band computed in the browser | Computed here, server-side (ADR-0014) |
 *
 * **No multiplication or division of money happens in this file.** Percentages
 * are deliberately absent: `plannedGMPct` and `actualGMPct` are ratios of money
 * to money, and dividing money exactly is `ratioOf` in `packages/money`, which
 * returns a `Ratio` rather than a float. A percentage rendered for display is a
 * presentation concern and is not part of this rollup — the legacy's
 * `(projectValue - bcs) / projectValue` is a float that then gets `toFixed`ed
 * in a browser, which is two defects wearing one line.
 */

export interface ProjectFinancialsInput {
  /** Sum of issued purchase orders. What we have committed to spend. */
  readonly committed: Paise;
  /** What the client signed. `null` when nobody has entered it — never a guess. */
  readonly contractValue: Paise | null;
  /** Budgeted cost of sale. */
  readonly bcs: Paise | null;
  /** Received from the client. */
  readonly inflow: Paise;
  /** Paid to vendors. */
  readonly outflow: Paise;
  /** Tax deducted. */
  readonly tds: Paise;
}

export interface ProjectFinancials {
  readonly committed: Paise;
  readonly contractValue: Paise | null;
  readonly bcs: Paise | null;
  readonly inflow: Paise;
  readonly outflow: Paise;
  readonly tds: Paise;
  /** `null` when no contract value has been entered — not zero, and not the committed spend. */
  readonly pendingInflow: Paise | null;
  readonly pendingOutflow: Paise;
  /** `null` when either input is missing. A margin against an unknown budget is not a margin. */
  readonly plannedMargin: Paise | null;
  readonly actualMargin: Paise;
  /**
   * `inflow - outflow - tds`. **May be negative, and is not floored.**
   *
   * The legacy floors `pendingInflow` and `pendingOutflow` with `Math.max(0, …)`
   * but not this one, so the same quantity is guarded in one place and not
   * another. Flooring here would hide the case that matters: more has gone out
   * than has come in.
   */
  readonly balance: Paise;
}

export function projectFinancials(input: ProjectFinancialsInput): ProjectFinancials {
  const pendingInflow =
    input.contractValue === null ? null : floorAtZero(sub(input.contractValue, input.inflow));

  const plannedMargin =
    input.contractValue === null || input.bcs === null
      ? null
      : sub(input.contractValue, input.bcs);

  const actualMargin = sub(sub(input.inflow, input.outflow), input.tds);

  return {
    committed: input.committed,
    contractValue: input.contractValue,
    bcs: input.bcs,
    inflow: input.inflow,
    outflow: input.outflow,
    tds: input.tds,
    pendingInflow,
    pendingOutflow: floorAtZero(sub(input.committed, input.outflow)),
    plannedMargin,
    actualMargin,
    balance: actualMargin,
  };
}

/** Kept explicit, so the two places the legacy floors are visibly deliberate. */
function floorAtZero(value: Paise): Paise {
  return value < 0n ? ZERO : value;
}

/**
 * Health bands.
 *
 * **PROJ-01.** The legacy compares committed spend against a "project value"
 * fed by the same sum, so the ratio is exactly 1 and every project without a
 * hand-entered budget reads "At Risk" forever. Here the comparison is against
 * the **contract value**, which is a different number with a different meaning,
 * and when nobody has entered one the answer is `no-budget` rather than a band
 * derived from comparing a number with itself.
 *
 * **The threshold is NOT a constant, and that follows from PROJ-01.** Because
 * the legacy ratio was pinned at 1.0, its 85% band never fired from either
 * side — so 85 is a number somebody typed, never one that was observed
 * working. Porting it as a constant would turn an untested value into an
 * apparently settled one.
 *
 * It is therefore per-tenant configuration (`projects.health_thresholds`) with
 * a documented default, and the default is **provisional** until a human with
 * authority over the business confirms it (PO-18). No statute governs it, so it
 * carries no `HUMAN(CA-)` marker — but it is a figure a director acts on, which
 * is why it does not get to live in a component either.
 */
export type ProjectHealth = 'no-budget' | 'on-track' | 'at-risk' | 'over-budget';

/**
 * The default used when a tenant has configured nothing.
 *
 * Inherited from `ProjectsSidebar.js:12`. Kept only so a fresh tenant has a
 * band at all; `provisional: true` travels with every answer computed from it,
 * so a screen can say the threshold was inherited rather than agreed.
 */
export const DEFAULT_AT_RISK_PCT = 85;

export interface HealthThreshold {
  readonly atRiskPct: number;
  /** True when this came from the default rather than from a confirmed row. */
  readonly provisional: boolean;
}

export const DEFAULT_HEALTH_THRESHOLD: HealthThreshold = {
  atRiskPct: DEFAULT_AT_RISK_PCT,
  provisional: true,
};

export class HealthThresholdError extends Error {
  override readonly name = 'HealthThresholdError';
}

/** Build a threshold from a stored row, refusing a value outside 1..100. */
export function healthThreshold(atRiskPct: number, confirmed: boolean): HealthThreshold {
  if (!Number.isInteger(atRiskPct) || atRiskPct <= 0 || atRiskPct > 100) {
    throw new HealthThresholdError(
      `at-risk threshold must be a whole percent in 1..100; got ${atRiskPct}`,
    );
  }
  return { atRiskPct, provisional: !confirmed };
}

export function projectHealth(
  financials: ProjectFinancials,
  threshold: HealthThreshold = DEFAULT_HEALTH_THRESHOLD,
): ProjectHealth {
  const budget = financials.contractValue;
  if (budget === null || isZero(budget) || budget < 0n) return 'no-budget';

  const committed = financials.committed;
  if (committed > budget) return 'over-budget';

  // The threshold is computed by `packages/money`, which is the only module
  // permitted to multiply money (ADR-0012) — and the boundary is named, because
  // it is impossible to multiply money here without naming one.
  //
  // `roundToPaise` is the right boundary precisely because this is NOT
  // statutory: it is a display band, so it takes the commercial convention
  // rather than Sec 170 or Sec 288B. The band edge can therefore move by one
  // paise, which is immaterial to a traffic light and is stated rather than
  // hidden.
  const atRisk = mulRatio(budget, ratio(BigInt(threshold.atRiskPct), 100n), roundToPaise);
  if (committed > atRisk) return 'at-risk';
  return 'on-track';
}

/** Total committed spend across a project's purchase orders. Exact, order-independent. */
export function committedSpend(purchaseOrderValues: readonly Paise[]): Paise {
  return sum(purchaseOrderValues);
}

/** Re-exported so a caller adding two figures does not reach for `+`. */
export { add, sub };
