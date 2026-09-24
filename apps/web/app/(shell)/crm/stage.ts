import type { PillTone } from '@cog/design-system';

/**
 * The lead-stage vocabulary — `docs/design/05-sales.html` and
 * `13-decisions.html` ("Words — the label map"). Never the raw enum with
 * underscores replaced: `proposal_shared` is a database value, not a sentence
 * a salesperson reads.
 *
 * Kept here rather than in `@cog/design-system`'s `LEAD_STAGES` — that
 * package is shared across four apps and this wording ("New", "Not a fit",
 * "Lost") is the design's for this one screen family. The wire values below
 * still match the same `z.enum` in `packages/contracts`; only the label is
 * invented here.
 */
const STAGE_LABEL: Readonly<Record<string, string>> = {
  lead: 'New',
  qualified: 'Qualified',
  proposal_shared: 'Proposal sent',
  negotiation: 'Negotiating',
  won: 'Won',
  unqualified: 'Not a fit',
  rejected: 'Lost',
};

const STAGE_TONE: Readonly<Record<string, PillTone>> = {
  lead: 'idle',
  qualified: 'active',
  proposal_shared: 'waiting',
  negotiation: 'active',
  won: 'ok',
  unqualified: 'idle',
  rejected: 'bad',
};

/** The word a salesperson reads, for a stage the server stored. Never the raw enum. */
export function leadStageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage;
}

export function leadStageTone(stage: string): PillTone {
  return STAGE_TONE[stage] ?? 'idle';
}

export const LEAD_STAGE_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['lead', 'New'],
  ['qualified', 'Qualified'],
  ['proposal_shared', 'Proposal sent'],
  ['negotiation', 'Negotiating'],
  ['won', 'Won'],
  ['unqualified', 'Not a fit'],
  ['rejected', 'Lost'],
];
