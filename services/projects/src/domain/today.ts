import type { HeroCandidate, Paise, TodayHeroResponse } from '@cog/contracts';
import { ZERO, isZero, shareBasisPoints, sub, sum, toWire } from '@cog/money';
import type { HealthThreshold } from './project-financials.js';

/**
 * Today's hero — the one thing that needs the director this morning.
 *
 * **The hero is not a fixed card.** `docs/design/VALUE-MAP.md` records why:
 * the first draft led with "88% of the Arav contract, ordered", a progress
 * bar on a screen whose subtitle promises *the one thing that needs you* —
 * nothing was owed on it, nobody was waiting, no decision followed. The rule
 * that replaced it is an order of urgency, and it lives here so that a screen
 * renders whatever ranked first rather than deciding for itself:
 *
 *   1. approvals blocked on somebody — money is held up and a person can be
 *      rung about it this morning
 *   2. a cash shortfall against this week's payables — ABSENT today: the
 *      model holds no cash position and no dated payables (payment path,
 *      CA-gated)
 *   3. margin at risk — ABSENT today: no cost budget, no actuals
 *   4. a project at or past its contract ceiling — the amber the design
 *      describes; something to watch, but no decision is owed yet
 *   5. ordered so far, all projects — the fallback the design names when
 *      nothing is amber
 *
 * The absent candidates are still listed, with their rank, so a screen and a
 * reviewer can see that the ranking is incomplete rather than merely shorter
 * than the design's. When the payment path lands, 2 and 3 become real
 * candidates at the same rank and nothing else moves.
 *
 * Lives in `projects` rather than `services/host` because it compares and
 * subtracts money: which project is closest to its ceiling is a projects rule
 * (`projectHealth` bands it; this ranks it), and host may not hold a monetary
 * value at all.
 */

/** A project with its committed spend, as host assembled it from both services. */
export interface ProjectCommitmentRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly contractValue: Paise | null;
  readonly committed: Paise;
  readonly orderCount: number;
}

/** What projects knows about a project, as `listProjectBudgets` returns it. */
export interface BudgetLike {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly contractValue: Paise | null;
}

/** What procurement knows, as `committedByProject` returns it. */
export interface CommitmentLike {
  readonly projectId: string | null;
  readonly committed: Paise;
  readonly orderCount: number;
}

/**
 * Join the two services' answers into one row per project.
 *
 * Here, not in host: a project with no orders has committed ZERO, and
 * supplying that default is holding a monetary value, which host may not do.
 */
export function projectCommitmentRows(
  budgets: readonly BudgetLike[],
  commitments: readonly CommitmentLike[],
): ProjectCommitmentRow[] {
  const byProject = new Map(commitments.map((k) => [k.projectId, k]));
  return budgets.map((p) => {
    const commitment = byProject.get(p.id);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      contractValue: p.contractValue,
      committed: commitment?.committed ?? ZERO,
      orderCount: commitment?.orderCount ?? 0,
    };
  });
}

export type CeilingCandidate = Extract<HeroCandidate, { kind: 'contract-ceiling' }>;
export type OrderedSoFar = Extract<HeroCandidate, { kind: 'ordered-so-far' }>;

/**
 * The project closest to — or furthest past — its contract ceiling, if any
 * is at or above the at-risk band. `null` when every project with a contract
 * value is on track: an on-track project is not a thing to watch.
 *
 * `orderedPct` is a whole percent, floored — the same direction `projectHealth`
 * bands in, so a project it calls on-track never reads as at the band here.
 * It is display, not a statutory figure, so no rounding boundary governs it;
 * `shareBasisPoints` is the one division of money, and it is exact.
 */
export function contractCeilingCandidate(
  rows: readonly ProjectCommitmentRow[],
  threshold: HealthThreshold,
): Omit<CeilingCandidate, 'rank'> | null {
  let best: { row: ProjectCommitmentRow; contractValue: Paise; orderedBp: number } | null = null;
  for (const row of rows) {
    const contractValue = row.contractValue;
    if (contractValue === null || isZero(contractValue) || contractValue < 0n) continue;
    const orderedBp = shareBasisPoints(row.committed, contractValue);
    if (best === null || orderedBp > best.orderedBp) best = { row, contractValue, orderedBp };
  }
  if (best === null) return null;
  const orderedPct = Math.floor(best.orderedBp / 100);
  if (orderedPct < threshold.atRiskPct) return null;
  const over = best.row.committed > best.contractValue;
  return {
    kind: 'contract-ceiling',
    projectId: best.row.id,
    code: best.row.code,
    name: best.row.name,
    committed: toWire(best.row.committed),
    contractValue: toWire(best.contractValue),
    orderedPct,
    thresholdPct: threshold.atRiskPct,
    over,
    overBy: over ? toWire(sub(best.row.committed, best.contractValue)) : null,
  };
}

/** Ordered so far, all projects — the fallback hero. */
export function orderedSoFar(rows: readonly ProjectCommitmentRow[]): Omit<OrderedSoFar, 'rank'> {
  return {
    kind: 'ordered-so-far',
    total: toWire(rows.length === 0 ? ZERO : sum(rows.map((r) => r.committed))),
    orderCount: rows.reduce((n, r) => n + r.orderCount, 0),
    projectCount: rows.filter((r) => r.orderCount > 0).length,
  };
}

export interface TodayInputs {
  /** `null` when nothing is waiting. */
  readonly blocked: Omit<Extract<HeroCandidate, { kind: 'blocked-approvals' }>, 'rank'> | null;
  readonly ceiling: Omit<CeilingCandidate, 'rank'> | null;
  readonly ordered: Omit<OrderedSoFar, 'rank'>;
}

/** What the model cannot say yet, stated in the ranking where it would sit. */
export const ABSENT_CANDIDATES: ReadonlyArray<Omit<Extract<HeroCandidate, { kind: 'absent' }>, 'rank'>> = [
  {
    kind: 'absent',
    name: 'cash-shortfall',
    why: 'What is due is known; cash in hand is not recorded anywhere, so the two cannot be set against each other.',
    // HUMAN(ARCH-CASH): where a cash position comes from is a product decision,
    // not an inference, and no cash-book is built in its place (§5):
    //   (a) the Tally connector reads the bank and cash ledger balances on each
    //       sync and reports them with an as-of time; or
    //   (b) a person records one "cash in hand as of today" figure, with its date.
    missing: [
      'a cash position — HUMAN(ARCH-CASH): (a) balances read from Tally on each sync, with an as-of time, or (b) one "cash in hand as of today" figure with its date',
    ],
  },
];

/**
 * Rank the candidates and name the hero.
 *
 * The order is the list in the doc comment above. Ranks are assigned to every
 * candidate that is present or absent, in that order; the hero is the first
 * candidate that is not absent. `ordered` is always present, so there is
 * always a hero.
 */
export function rankToday(inputs: TodayInputs): TodayHeroResponse {
  const ordered: Array<Omit<HeroCandidate, 'rank'>> = [];
  if (inputs.blocked !== null && inputs.blocked.count > 0) ordered.push(inputs.blocked);
  ordered.push(...ABSENT_CANDIDATES);
  if (inputs.ceiling !== null) ordered.push(inputs.ceiling);
  ordered.push(inputs.ordered);

  const candidates = ordered.map((c, index) => ({ ...c, rank: index + 1 }) as HeroCandidate);
  const hero = candidates.find((c) => c.kind !== 'absent');
  // `ordered` is unconditional, so this cannot be undefined; the throw is what
  // keeps the type honest without a cast.
  if (hero === undefined) throw new Error('rankToday: no present candidate');
  return { hero, candidates };
}
