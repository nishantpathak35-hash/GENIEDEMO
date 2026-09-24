import type { PillTone } from '@cog/design-system';

/**
 * The project-area status words, in the customer's language.
 *
 * `docs/design/00-foundations.html` ("Status — the same closed sets, in the
 * customer's words") and `docs/design/13-decisions.html` ("Words — the label
 * map"): a raw enum with its underscores replaced is not a word anyone chose.
 * This is the one place each closed set is spelled out for the projects area,
 * so the list, the shell and Variations read it rather than each inventing
 * their own map.
 */

const PROJECT_STATE_LABEL: Readonly<Record<string, string>> = {
  lead: 'Lead',
  won: 'Won',
  in_progress: 'In progress',
  handed_over: 'Handed over',
  closed: 'Closed',
  lost: 'Lost',
};

const PROJECT_STATE_TONE: Readonly<Record<string, PillTone>> = {
  lead: 'idle',
  won: 'ok',
  in_progress: 'active',
  handed_over: 'ok',
  closed: 'idle',
  lost: 'bad',
};

/** The verb on the button that moves a project INTO a state. */
const PROJECT_MOVE_LABEL: Readonly<Record<string, string>> = {
  won: 'Mark won',
  lost: 'Mark lost',
  in_progress: 'Start on site',
  handed_over: 'Mark handed over',
  closed: 'Close project',
};

export function projectMoveLabel(state: string): string {
  return PROJECT_MOVE_LABEL[state] ?? `Move to ${projectStateLabel(state).toLowerCase()}`;
}

export function projectStateLabel(state: string): string {
  return PROJECT_STATE_LABEL[state] ?? state.replace(/_/g, ' ');
}

export function projectStateTone(state: string): PillTone {
  return PROJECT_STATE_TONE[state] ?? 'idle';
}

/** `projectHealthBand` — the band `projectRollup` computes, never derived here. */
const HEALTH_LABEL: Readonly<Record<string, string>> = {
  'on-track': 'On track',
  'at-risk': 'Watch closely',
  'over-budget': 'Over contract',
  'no-budget': 'Add contract value',
  'not-read': 'Not read',
};

const HEALTH_TONE: Readonly<Record<string, PillTone>> = {
  'on-track': 'ok',
  'at-risk': 'warn',
  'over-budget': 'bad',
  'no-budget': 'idle',
};

export function healthLabel(band: string): string {
  return HEALTH_LABEL[band] ?? band.replace(/-/g, ' ');
}

export function healthTone(band: string): PillTone {
  return HEALTH_TONE[band] ?? 'idle';
}

/** A variation's state — `CO_STATES` in `packages/contracts/src/api/projects.ts`. */
const VARIATION_LABEL: Readonly<Record<string, string>> = {
  draft: 'Draft',
  pending_client: 'Waiting for client',
  client_approved: 'Signed off',
  client_rejected: 'Declined by client',
  withdrawn: 'Withdrawn',
};

const VARIATION_TONE: Readonly<Record<string, PillTone>> = {
  draft: 'idle',
  pending_client: 'waiting',
  client_approved: 'ok',
  client_rejected: 'bad',
  withdrawn: 'bad',
};

export function variationLabel(state: string): string {
  return VARIATION_LABEL[state] ?? state.replace(/_/g, ' ');
}

export function variationTone(state: string): PillTone {
  return VARIATION_TONE[state] ?? 'idle';
}
