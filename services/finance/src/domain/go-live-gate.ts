/**
 * The go-live gate: no statutory output from a provisional row, unless this
 * process was told, explicitly, to produce drafts.
 *
 * ADR-0014 as amended on 2026-09-15 moved the CA gate from the build to the
 * output. The money path is built and runs on provisional values; what a CA's
 * name, membership number, firm and date stand between is a figure that
 * leaves the building — deducted from a vendor, deposited, filed, posted to the
 * books or printed on an invoice — while the rule behind it is unverified.
 *
 * So every output below passes the rows it relied on through
 * `assertStatutoryOutputAllowed`, and one provisional row refuses the whole
 * output, by name, listing every row and its CA question.
 *
 * **It fails closed** (the owner, 2026-09-15). A provisional row produces a
 * draft only in a process started with `STATUTORY_OUTPUTS=draft` — exactly
 * that. Unset, empty, or any other value refuses, and `NODE_ENV` plays no part:
 * a deployment nobody configured refuses, rather than a deployment nobody
 * labelled production computing live figures from unverified rows. The local
 * stack sets `draft` in docker-compose.yml. The value is read once at boot and
 * passed in, never read here, so a test says which world it is in without
 * changing the process's environment.
 */

export const STATUTORY_OUTPUTS = [
  'tds_deduction',
  'challan',
  'form_26q',
  'tally_voucher',
  'tax_invoice',
] as const;
export type StatutoryOutput = (typeof STATUTORY_OUTPUTS)[number];

const OUTPUT_NAMES: Readonly<Record<StatutoryOutput, string>> = Object.freeze({
  tds_deduction: 'TDS deducted on a payment',
  challan: 'a TDS challan',
  form_26q: '26Q content',
  tally_voucher: 'a Tally voucher',
  tax_invoice: 'a tax invoice',
});

export interface Environment {
  /** Produce statutory outputs from provisional rows, marked as drafts. Only with `STATUTORY_OUTPUTS=draft`. */
  readonly draftStatutoryOutputs: boolean;
}

/** Read once, at boot, from `STATUTORY_OUTPUTS`. Exactly `draft` produces drafts; anything else refuses. */
export function environmentFrom(statutoryOutputs: string | undefined): Environment {
  return { draftStatutoryOutputs: statutoryOutputs === 'draft' };
}

/** Any row with provenance — a rate or a threshold. */
export interface ProvenancedRow {
  readonly key: string;
  readonly status: string;
  readonly questionRef?: string | null | undefined;
}

export interface RefusedRow {
  readonly key: string;
  readonly questionRef: string | null;
}

export class ProvisionalOutputRefused extends Error {
  override readonly name = 'ProvisionalOutputRefused';
  readonly code = 'PROVISIONAL_OUTPUT_REFUSED' as const;

  constructor(
    readonly output: StatutoryOutput,
    readonly rows: readonly RefusedRow[],
  ) {
    super(
      `Refused: ${OUTPUT_NAMES[output]} would rely on ` +
        `${rows.length === 1 ? 'a provisional value' : `${String(rows.length)} provisional values`} — ` +
        `${rows.map((r) => (r.questionRef === null ? r.key : `${r.key} (${r.questionRef})`)).join(', ')}. ` +
        'This process produces drafts from provisional values only with STATUTORY_OUTPUTS=draft, and ' +
        "a chartered accountant's name, membership number, firm and date promote them.",
    );
  }
}

/**
 * Allow the output, or refuse it.
 *
 * Returns whether the output is provisional, so the caller can store and show
 * that. **Anything that is not exactly `verified` counts as provisional** — a
 * misspelt or unexpected status must not be the thing that lets an unverified
 * figure through.
 */
export function assertStatutoryOutputAllowed(
  output: StatutoryOutput,
  rowsUsed: readonly ProvenancedRow[],
  environment: Environment,
): { readonly provisional: boolean } {
  const provisional = rowsUsed.filter((row) => row.status !== 'verified');
  if (provisional.length > 0 && !environment.draftStatutoryOutputs) {
    throw new ProvisionalOutputRefused(
      output,
      provisional.map((row) => ({ key: row.key, questionRef: row.questionRef ?? null })),
    );
  }
  return { provisional: provisional.length > 0 };
}
