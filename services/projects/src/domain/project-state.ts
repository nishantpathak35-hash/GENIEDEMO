/**
 * A project's state, and the moves between states that mean something.
 *
 * `projects.projects.state` was written once, by the column default, and no
 * route moved it: every project stayed `lead`, the Projects tabs filtered a
 * set of one value and "N in progress" was always zero (DATA-08 in
 * `docs/BACKLOG.md`). This is the rule the route enforces.
 *
 * The moves are the ones a fit-out contractor makes, in order: a lead is won
 * or lost; a won project starts on site; a site is handed over; a handed-over
 * project is closed once its defects period ends. A project can be closed
 * from site without a handover record — a job that stops — and it can be
 * lost after it was won, because a signed client walks away sometimes. Once
 * closed or lost it stays there: reopening a job is a new project, not a
 * state, because everything that hangs off the old one (orders, bills, the
 * handover record) was true of the job that ended.
 *
 * Two dates follow the state and are stamped by the route, never by a
 * caller: `started_on` on the move to `in_progress`, `handed_over_on` on the
 * move to `handed_over`. They are the answer to "since when" on the Projects
 * list and are set once, on the day it happened.
 */

export type ProjectState = 'lead' | 'won' | 'in_progress' | 'handed_over' | 'closed' | 'lost';

export const PROJECT_STATES: readonly ProjectState[] = [
  'lead',
  'won',
  'in_progress',
  'handed_over',
  'closed',
  'lost',
];

const NEXT: Readonly<Record<ProjectState, readonly ProjectState[]>> = {
  lead: ['won', 'lost'],
  won: ['in_progress', 'lost'],
  in_progress: ['handed_over', 'closed'],
  handed_over: ['closed'],
  closed: [],
  lost: [],
};

/** The states a project in `from` may move to, in the order a screen offers them. */
export function nextStates(from: ProjectState): readonly ProjectState[] {
  return NEXT[from];
}

export function canMove(from: ProjectState, to: ProjectState): boolean {
  return NEXT[from].includes(to);
}

/** Which date column, if any, the move stamps. */
export function dateStampedBy(to: ProjectState): 'started_on' | 'handed_over_on' | null {
  if (to === 'in_progress') return 'started_on';
  if (to === 'handed_over') return 'handed_over_on';
  return null;
}
