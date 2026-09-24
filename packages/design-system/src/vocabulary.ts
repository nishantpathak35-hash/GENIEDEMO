/**
 * The closed sets a screen renders, and their labels.
 *
 * **In a plain module, with no directive**, and that is load-bearing rather
 * than tidy: a `'use client'` module's non-function exports reach a server
 * component as client-reference proxies, not values. `STAGES.map(...)` in a
 * server component, against a `STAGES` exported from a client file, fails with
 * `STAGES.map is not a function` — at page-data collection during `next build`,
 * which is one of the few app-level mistakes the gate does catch.
 *
 * Every value below matches a `z.enum` in `packages/contracts`. The label is
 * the only thing invented here; the value is the contract's.
 */

export type Options = ReadonlyArray<readonly [string, string]>;

export const LEAD_STAGES: Options = [
  ['lead', 'Lead'],
  ['qualified', 'Qualified'],
  ['proposal_shared', 'Proposal shared'],
  ['negotiation', 'Negotiation'],
  ['won', 'Won'],
  ['unqualified', 'Unqualified'],
  ['rejected', 'Rejected'],
];

export const TASK_PRIORITIES: Options = [
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
  ['urgent', 'Urgent'],
];

export const TASK_STATUSES: Options = [
  ['pending', 'Pending'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];

export const DRAWING_CATEGORIES: Options = [
  ['architectural', 'Architectural'],
  ['structural', 'Structural'],
  ['mep', 'MEP'],
  ['interior', 'Interior'],
  ['other', 'Other'],
];

export const SITE_CONDITIONS: Options = [
  ['bare_shell', 'Bare shell'],
  ['warm_shell', 'Warm shell'],
  ['fitted', 'Fitted'],
  ['occupied', 'Occupied'],
];

/** A label for a value, falling back to the value itself rather than to nothing. */
export function labelOf(options: Options, value: string): string {
  return options.find(([candidate]) => candidate === value)?.[1] ?? value;
}
