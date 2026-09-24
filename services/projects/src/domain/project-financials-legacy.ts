/**
 * The legacy project financial rollup, ported **verbatim** — defects included.
 *
 * COMMIT 1 of the two-commit protocol (ADR-0014 decision 5). Nothing here is
 * fixed. It exists so that the corrected version in `project-financials.ts` can
 * be compared against measured behaviour rather than remembered behaviour, and
 * so that when a ported figure differs from the legacy figure it is answerable
 * which of the two changed.
 *
 * **Not exported from the package index**, deliberately — same as
 * `manpower-legacy.ts`, `approval-legacy.ts` and `rate-analysis-legacy.ts`.
 * Nothing in the running system may call it.
 *
 * Sources, all verified by reading the frozen tree at
 * `legacy-frozen-2026-09-03`:
 *
 * | Behaviour | Site |
 * |---|---|
 * | rollup from purchase orders | `app/lib/api/projects.js:118-120` |
 * | pendingOutflow | `app/lib/api/projects.js:127` |
 * | override arithmetic | `app/lib/api/projects.js:185-191` |
 * | health bands | `components/views/projects/ProjectsSidebar.js:6-14` |
 *
 * Every number below is a **float**, because the legacy columns are `REAL` and
 * the code does raw JavaScript arithmetic on them. That is the defect ADR-0012
 * calls the most serious in the system, and reproducing it is the point of this
 * file.
 */

/** `money()` as the legacy defines it — `Number(value) || 0`. Never throws. */
function num(value: unknown): number {
  return Number(value) || 0;
}

export interface LegacyPurchaseOrder {
  readonly project: string | null;
  readonly po_value: unknown;
}

export interface LegacyOverride {
  readonly project: string;
  readonly project_value?: unknown;
  readonly bcs?: unknown;
  readonly inflow?: unknown;
  readonly invoice_value?: unknown;
  readonly tds?: unknown;
}

export interface LegacyProjectRow {
  project: string;
  name: string;
  projectValue: number;
  inflow: number;
  pendingInflow: number;
  invoiceValue: number;
  bcs: number;
  plannedGM: number;
  plannedGMPct: number;
  poIssued: number;
  actualGM: number;
  actualGMPct: number;
  pendingOutflow: number;
  balanceAvailable: number;
  outflow: number;
  tds: number;
}

function blank(name: string): LegacyProjectRow {
  return {
    project: name,
    name,
    projectValue: 0,
    inflow: 0,
    pendingInflow: 0,
    invoiceValue: 0,
    bcs: 0,
    plannedGM: 0,
    plannedGMPct: 0,
    poIssued: 0,
    actualGM: 0,
    actualGMPct: 0,
    pendingOutflow: 0,
    balanceAvailable: 0,
    outflow: 0,
    tds: 0,
  };
}

/**
 * `getProjectDetails`, ported verbatim from `app/lib/api/projects.js:83-192`.
 *
 * Keyed by the project NAME string, because that is what the legacy has: there
 * is no projects table (TOPOLOGY defect 1).
 */
export function legacyProjectDetails(
  pos: readonly LegacyPurchaseOrder[],
  outflowByProject: Readonly<Record<string, unknown>>,
  overrides: readonly LegacyOverride[],
): LegacyProjectRow[] {
  const map = new Map<string, LegacyProjectRow>();

  for (const po of pos) {
    const name = po.project;
    if (name === null || name === undefined || name === '') continue;
    if (!map.has(name)) map.set(name, blank(name));
    const row = map.get(name) as LegacyProjectRow;
    const val = num(po.po_value);
    // `projects.js:118-120` — THE SAME VALUE is added to both fields.
    row.poIssued += val;
    row.projectValue += val;
  }

  for (const [name, row] of map) {
    const projectOutflow = num(outflowByProject[name]);
    row.outflow = projectOutflow;
    row.pendingOutflow = Math.max(0, row.poIssued - projectOutflow);
  }

  for (const override of overrides) {
    const name = override.project;
    if (name === null || name === undefined || name === '') continue;
    if (!map.has(name)) map.set(name, blank(name));
    const row = map.get(name) as LegacyProjectRow;

    // `projects.js:169-174`. Note `Number(row.project_value) || existing`:
    // an override of exactly 0 falls through to the computed value, because
    // `0 || x` is `x`.
    const projectValue = num(override.project_value) || row.projectValue;
    const bcs = num(override.bcs);
    const inflow = num(override.inflow);
    const invoiceValue = num(override.invoice_value);
    const tds = num(override.tds);
    const outflow = num(row.outflow);

    row.projectValue = projectValue;
    row.bcs = bcs;
    row.inflow = inflow;
    row.invoiceValue = invoiceValue;
    row.tds = tds;
    row.pendingInflow = Math.max(0, projectValue - inflow);
    row.plannedGM = projectValue - bcs;
    row.plannedGMPct = projectValue ? (projectValue - bcs) / projectValue : 0;
    row.actualGM = inflow - outflow - tds;
    row.actualGMPct = inflow ? (inflow - outflow - tds) / inflow : 0;
    row.balanceAvailable = inflow - outflow - tds;
  }

  return [...map.values()];
}

export type LegacyHealthLabel = 'No Budget' | 'Over Budget' | 'At Risk' | 'On Track';

/**
 * `getHealth`, ported verbatim from
 * `components/views/projects/ProjectsSidebar.js:6-14`.
 *
 * Computed **in the browser** in the legacy. It is here, server-side, because
 * the port moves the authority (ADR-0014): a health band shown to a director is
 * a derived figure, and a derived figure computed in a browser is one the
 * server cannot stand behind.
 */
export function legacyHealth(row: {
  readonly poIssued: unknown;
  readonly projectValue: unknown;
}): LegacyHealthLabel {
  const poIssued = num(row.poIssued);
  const pv = num(row.projectValue);
  if (!pv) return 'No Budget';
  const ratio = poIssued / pv;
  if (ratio > 1) return 'Over Budget';
  if (ratio > 0.85) return 'At Risk';
  return 'On Track';
}
