import type { Paise } from '@cog/contracts';
import { ZERO, mulRatio, ratio, roundToPaise, sum, toWire } from '@cog/money';

/**
 * Pipeline totals.
 *
 * **This exists because `CrmView.js:53` does the arithmetic in a browser, on a
 * float:**
 *
 * ```
 * const weightedPipeline = activePipelineOpps.reduce(
 *   (acc, curr) => acc + (curr.value * ((curr.probability || 0) / 100) || 0), 0);
 * ```
 *
 * Two separate violations in one line — money multiplied by a percentage in a
 * client, and money held as a float — and then `:157` divides by 10,000,000 to
 * render crores, which rounds a second time in a place nobody would look for a
 * rounding decision.
 *
 * Here the weighting goes through `mulRatio` with an explicit boundary, and the
 * client receives a figure it only formats.
 */

export interface PipelineLine {
  /** Estimated value of the opportunity. */
  readonly value: Paise;
  /** Whole percent, 0-100, as stored. Never derived from the stage (CRM-01). */
  readonly probabilityPct: number;
  readonly stage: string;
}

export interface PipelineTotals {
  readonly openCount: number;
  /** Sum of the open opportunities at face value. */
  readonly total: Paise;
  /** Each opportunity weighted by its own probability, then summed. */
  readonly weighted: Paise;
  /**
   * Each opportunity weighted by its STAGE, then summed — the design's one
   * ladder (`docs/design/build/shell.mjs` STAGE_WEIGHT): 10% at lead, 25%
   * qualified, 40% proposal shared, 70% at negotiation. Not a fifth ladder
   * competing with the four the legacy mixed (CRM-01): those disagreed with
   * each other and each pretended to be the lead's own probability; this one
   * is named, shown beside the unweighted figure, and never written back to a
   * lead. `probabilityPct` stays exactly as entered.
   */
  readonly weightedByStage: Paise;
  /** Won as a share of everything decided, in whole percent. Null if nothing is. */
  readonly winRatePct: number | null;
  /**
   * One row per OPEN stage, in ladder order, whether or not anything is in it.
   *
   * Here rather than on a screen because a board column header shows a count
   * and a value, and a screen that summed its own column would be doing money
   * arithmetic in a client — the exact thing this module exists to stop. An
   * empty stage is included: "nothing in negotiation" is a fact worth seeing,
   * and a column that disappears when it empties hides it.
   */
  readonly byStage: ReadonlyArray<{
    readonly stage: string;
    readonly count: number;
    readonly value: Paise;
    readonly weighted: Paise;
  }>;
}

/** In ladder order, because the board renders them in it. */
const OPEN_LADDER = ['lead', 'qualified', 'proposal_shared', 'negotiation'] as const;
/** The design's stage weights, in whole percent. */
export const STAGE_WEIGHT_PCT: Readonly<Record<(typeof OPEN_LADDER)[number], number>> = { lead: 10, qualified: 25, proposal_shared: 40, negotiation: 70 };
const OPEN_STAGES = new Set<string>(OPEN_LADDER);
const DECIDED_STAGES = new Set(['won', 'unqualified', 'rejected']);

/**
 * Weight one opportunity by its probability.
 *
 * `roundToPaise` is the boundary: this is a commercial estimate, not a
 * statutory figure, so no section governs it — and `mulRatio` requires the
 * boundary to be named at the call site rather than defaulted, which is the
 * point of that API.
 *
 * Weighted per line and then summed, rather than summing and applying an
 * average — those differ, and the per-line form is the one the legacy intends.
 */
function weigh(line: PipelineLine): Paise {
  return mulRatio(line.value, ratio(BigInt(line.probabilityPct), 100n), roundToPaise);
}

/** The same, by the stage's weight; a stage outside the ladder weighs nothing. */
function weighByStage(line: PipelineLine): Paise {
  const pct = (STAGE_WEIGHT_PCT as Record<string, number | undefined>)[line.stage];
  return pct === undefined ? ZERO : mulRatio(line.value, ratio(BigInt(pct), 100n), roundToPaise);
}

export function pipelineTotals(lines: readonly PipelineLine[]): PipelineTotals {
  const open = lines.filter((l) => OPEN_STAGES.has(l.stage));
  const decided = lines.filter((l) => DECIDED_STAGES.has(l.stage));
  const won = decided.filter((l) => l.stage === 'won');

  return {
    openCount: open.length,
    total: open.length === 0 ? ZERO : sum(open.map((l) => l.value)),
    weighted: open.length === 0 ? ZERO : sum(open.map(weigh)),
    weightedByStage: open.length === 0 ? ZERO : sum(open.map(weighByStage)),
    // Null rather than zero when nothing has been decided: a win rate of 0%
    // and "no data" are different statements, and a dashboard that shows 0%
    // for an empty pipeline is stating the first while meaning the second.
    winRatePct: decided.length === 0 ? null : Math.round((won.length / decided.length) * 100),
    byStage: OPEN_LADDER.map((stage) => {
      const here = open.filter((l) => l.stage === stage);
      return {
        stage,
        count: here.length,
        value: here.length === 0 ? ZERO : sum(here.map((l) => l.value)),
        weighted: here.length === 0 ? ZERO : sum(here.map(weigh)),
      };
    }),
  };
}

// --------------------------------------------------------- Today's pipeline --

/**
 * What Today asks of the pipeline: the quotes a client is sitting on, the
 * next steps dated this month, the closes expected this month, and the whole
 * open pipeline — unweighted, every one, because a director reading the
 * morning screen wants the size of what is in play, not a forecast.
 */
export interface PipelineLead {
  readonly clientName: string;
  readonly stage: string;
  readonly value: Paise;
  readonly nextFollowupOn: string | null;
  readonly expectedClose: string | null;
}

export interface PipelineSlice {
  readonly count: number;
  readonly total: string;
  /** Client names, at most five, in the order given. */
  readonly names: readonly string[];
}

export interface PipelineSummary {
  readonly month: string;
  readonly quoted: PipelineSlice;
  readonly nextStepThisMonth: PipelineSlice;
  readonly closingThisMonth: PipelineSlice;
  readonly open: PipelineSlice;
}

const NAMES_SHOWN = 5;

function slice(leads: readonly PipelineLead[]): PipelineSlice {
  return {
    count: leads.length,
    total: toWire(leads.length === 0 ? ZERO : sum(leads.map((l) => l.value))),
    names: leads.slice(0, NAMES_SHOWN).map((l) => l.clientName),
  };
}

/** `month` is `YYYY-MM`; a date is in it when it starts with it. Decided leads take no part. */
export function pipelineSummary(leads: readonly PipelineLead[], month: string): PipelineSummary {
  const open = leads.filter((l) => OPEN_STAGES.has(l.stage));
  const inMonth = (day: string | null): boolean => day !== null && day.startsWith(month);
  return {
    month,
    quoted: slice(open.filter((l) => l.stage === 'proposal_shared')),
    nextStepThisMonth: slice(open.filter((l) => inMonth(l.nextFollowupOn))),
    closingThisMonth: slice(open.filter((l) => inMonth(l.expectedClose))),
    open: slice(open),
  };
}
