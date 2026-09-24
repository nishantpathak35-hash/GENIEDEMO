import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './approval-subject.js';
import {
  financialYear,
  formatSeriesNumber,
  isFyFormat,
  statutoryNumberProblem,
  type FyFormat,
  type SeriesFormat,
} from '../domain/number-format.js';

/**
 * Which documents this system numbers.
 *
 * One, today. Change orders and vendors take a value the caller supplies, so
 * they have no series here — a settings row for a document nothing
 * allocates is a control that appears to take effect and does not. Migration
 * 0066 keeps the CHECK on `module_type` in step with this list.
 */
export const NUMBERED_MODULES = ['purchase_order', 'payment_voucher', 'tax_invoice'] as const;
export type NumberedModule = (typeof NUMBERED_MODULES)[number];

/**
 * The documents whose numbers are statutory: allocated with no gaps (the CA
 * call, CA-09) and held to CGST Rule 46(b)'s limits (statute text, CA-17).
 */
export const STATUTORY_MODULES = ['payment_voucher', 'tax_invoice'] as const;

function isStatutory(moduleType: NumberedModule): boolean {
  return (STATUTORY_MODULES as readonly string[]).includes(moduleType);
}

/**
 * Allocating a purchase-order number.
 *
 * **The allocation happens inside the transaction that inserts the order**, so
 * two concurrent creates take the counter row's lock in turn and cannot be
 * handed the same number. The legacy shows the number in the form instead
 * (`POsView.js:301` calls `getNextPONumber`, which is
 * `NumberSeriesService.peekNextNumber` — a peek that does not increment), so
 * two users opening the modal together both see `PO-0042` and the second one
 * collides on submit. That is PO-24, and it is live.
 *
 * A screen may still preview a number. `previewNumber` exists for that and says
 * in its name that it is not a reservation.
 *
 * Gaps are accepted: a rolled-back insert burns a number. Consecutive serials
 * are a Rule 46 requirement on a tax invoice, which a purchase order is not
 * (migration `0021`, and M1.md:272).
 */

export interface NumberFormat {
  readonly prefix: string;
  readonly separator: string;
  readonly padding: number;
  readonly includeFy: boolean;
  readonly fyFormat: FyFormat;
  readonly resetEachFy: boolean;
  readonly startingNumber: number;
  /** 'provisional' means nobody has confirmed this format for this tenant. */
  readonly status: string;
}

export interface AllocatedNumber {
  readonly number: string;
  readonly sequence: number;
  /** The financial year this number was filed under, spelled the tenant's way. */
  readonly financialYear: string;
  readonly format: NumberFormat;
}

type SeriesRow = {
  last_number: string;
  prefix: string;
  separator: string;
  padding: number;
  include_fy: boolean;
  fy_format: string;
  reset_each_fy: boolean;
  starting_number: string;
  series_fy: string | null;
  status: string;
};

const COLUMNS = `last_number::text, prefix, separator, padding, include_fy,
                 fy_format, reset_each_fy, starting_number::text, series_fy, status`;

/**
 * The row a tenant behaves as if it had before anybody configured anything.
 *
 * `include_fy` false, matching the live rows migration 0021 left: turning the
 * year on changes what a document is called, and doing that to an existing
 * tenant during a deployment is not a default, it is a rename.
 */
const DEFAULTS: SeriesRow = {
  last_number: '0',
  prefix: 'PO',
  separator: '-',
  padding: 4,
  include_fy: false,
  fy_format: 'YYYY-YY',
  reset_each_fy: false,
  starting_number: '0',
  series_fy: null,
  status: 'provisional',
};

/**
 * A statutory series has the year in the number and restarts its counter each
 * financial year — the CA's answer to CA-09 (CA answers document, reviewed by
 * the CA; CA details to follow; provisional): "The counter shall restart for
 * each financial year", and each series is "unique within the relevant
 * financial year", within Rule 46(b)'s limits (CA-17). Provisional until
 * somebody saves the format, and a format a tenant has saved is its own.
 */
const STATUTORY_DEFAULTS: Readonly<Record<'payment_voucher' | 'tax_invoice', SeriesRow>> = {
  payment_voucher: { ...DEFAULTS, prefix: 'PV', separator: '/', include_fy: true, reset_each_fy: true },
  tax_invoice: { ...DEFAULTS, prefix: 'INV', separator: '/', include_fy: true, reset_each_fy: true },
};

function defaultsFor(moduleType: NumberedModule): SeriesRow {
  return moduleType === 'purchase_order' ? DEFAULTS : STATUTORY_DEFAULTS[moduleType];
}

/**
 * Take the next number.
 *
 * The insert-then-update pair is deliberate. A tenant with no counter row must
 * not fall through to 1 — which would silently restart a series — and must not
 * fault. `ON CONFLICT DO NOTHING` makes first use create the row and every
 * later use a no-op, and the `UPDATE ... RETURNING` that follows is what takes
 * the lock and produces the value.
 *
 * `tenant_id` is stamped explicitly rather than defaulted from
 * `tenancy.current_tenant_id()`: a forgotten stamp must fail NOT NULL and a
 * wrong one must fail the RLS WITH CHECK (M1/D3).
 */
export async function allocateNumber(
  tx: TxLike,
  ctx: TenantContext,
  moduleType: NumberedModule = 'purchase_order',
  at: Date = new Date(),
): Promise<AllocatedNumber> {
  const defaults = defaultsFor(moduleType);
  await tx.query(
    `INSERT INTO procurement.number_series (tenant_id, module_type, prefix, separator, include_fy, reset_each_fy)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, module_type) DO NOTHING`,
    [ctx.tenantId, moduleType, defaults.prefix, defaults.separator, defaults.include_fy, defaults.reset_each_fy],
  );

  // The financial year is computed HERE and passed into the statement below, so
  // the year the counter is stamped with and the year printed on the document
  // are one value rather than two reads of a clock either side of a midnight.
  //
  // Which format to compute it in is the row's, so the row is read first,
  // unlocked, purely to learn the format. A format changed between these two
  // statements affects how the year is spelled, never which number is issued.
  const configured = await tx.query<{ fy_format: string }>(
    `SELECT fy_format FROM procurement.number_series
      WHERE tenant_id = $1 AND module_type = $2`,
    [ctx.tenantId, moduleType],
  );
  const fy = financialYear(fyFormatOf(configured[0]?.fy_format), at);

  const rows = await tx.query<SeriesRow>(
    `UPDATE procurement.number_series
        SET last_number = CASE
              WHEN reset_each_fy AND series_fy IS DISTINCT FROM $3
              THEN starting_number + 1
              ELSE last_number + 1
            END,
            series_fy   = $3,
            updated_at  = now()
      WHERE tenant_id = $1 AND module_type = $2
     RETURNING ${COLUMNS}`,
    [ctx.tenantId, moduleType, fy],
  );

  const row = rows[0];
  if (row === undefined) {
    // The insert above ran in this same transaction, so the row exists unless
    // RLS refused it — which means the context is not this tenant's, and
    // continuing would allocate against somebody else's series.
    throw new Error('could not allocate a document number for this tenant');
  }

  // last_number is now the number this caller was handed.
  const allocated = toAllocated(row, Number(row.last_number), fy);
  if (isStatutory(moduleType)) {
    const problem = statutoryNumberProblem(allocated.number);
    // Thrown inside the document's own transaction, so the counter moved above
    // rolls back with it and no number is lost.
    if (problem !== null) throw new NumberSeriesError(problem);
  }
  return allocated;
}

/**
 * What the next number would be, without taking it.
 *
 * For a form that wants to show something before the user commits. It is a
 * **suggestion**: nothing is reserved, and the number actually stored is the one
 * `allocateNumber` produces at submit. Named so that a caller cannot mistake it
 * for a reservation, which is precisely the mistake `getNextPONumber` invites.
 */
export async function previewNumber(
  tx: TxLike,
  ctx: TenantContext,
  moduleType: NumberedModule = 'purchase_order',
  at: Date = new Date(),
): Promise<AllocatedNumber> {
  const rows = await tx.query<SeriesRow>(
    `SELECT ${COLUMNS}
       FROM procurement.number_series
      WHERE tenant_id = $1 AND module_type = $2`,
    [ctx.tenantId, moduleType],
  );

  const row = rows[0] ?? defaultsFor(moduleType);
  const fy = financialYear(fyFormatOf(row.fy_format), at);
  // Nothing is taken, so the next number is one past the last one issued —
  // unless the counter is about to restart, in which case it is one past where
  // the series begins. A preview that ignores the reset shows the wrong number
  // on exactly the day somebody is reading it most carefully.
  return toAllocated(row, nextOf(row, fy), fy);
}

/** Every series this tenant has, including one it has never written a row for. */
export async function listSeries(
  tx: TxLike,
  ctx: TenantContext,
  at: Date = new Date(),
): Promise<readonly (AllocatedNumber & { moduleType: NumberedModule })[]> {
  const rows = await tx.query<SeriesRow & { module_type: string }>(
    `SELECT module_type, ${COLUMNS}
       FROM procurement.number_series
      WHERE tenant_id = $1`,
    [ctx.tenantId],
  );
  const byModule = new Map(rows.map((r) => [r.module_type, r]));

  // Driven by the catalogue rather than by the rows, so a tenant that has never
  // raised a purchase order still sees the series it is going to use.
  return NUMBERED_MODULES.map((moduleType) => {
    const row = byModule.get(moduleType) ?? defaultsFor(moduleType);
    const fy = financialYear(fyFormatOf(row.fy_format), at);
    return { moduleType, ...toAllocated(row, nextOf(row, fy), fy) };
  });
}

export class NumberSeriesError extends Error {
  override readonly name = 'NumberSeriesError';
}

export interface SeriesFormatInput {
  readonly prefix: string;
  readonly separator: string;
  readonly padding: number;
  readonly includeFy: boolean;
  readonly fyFormat: FyFormat;
  readonly resetEachFy: boolean;
  readonly startingNumber: number;
}

/**
 * Change the FORMAT of a series. Never the counter.
 *
 * **`last_number` is not in this statement and no route can reach it.** The
 * legacy settings tab renders it as an editable field
 * (`SettingsNumberSeriesTab.js`), and lowering it re-issues numbers already
 * printed on orders somebody has sent to a vendor. There is nothing to validate
 * here because there is nothing to write: the counter moves in one direction,
 * from `allocateNumber`, which is the only statement that touches it.
 *
 * Saving CONFIRMS the format, the way saving a role's grants confirms them.
 * Migration 0021 ships every series `provisional` because its prefix was read
 * off legacy documents rather than chosen by anybody.
 */
export async function saveSeriesFormat(
  tx: TxLike,
  ctx: TenantContext,
  moduleType: NumberedModule,
  input: SeriesFormatInput,
  savedBy: string,
): Promise<void> {
  // Refused here as well as by the CHECK, so the message says what to do rather
  // than naming a constraint. Restarting a counter without the year in the
  // number issues the same string twice, a year apart, on two real documents.
  if (input.resetEachFy && !input.includeFy) {
    throw new NumberSeriesError(
      'A series can only restart each year if the year appears in the number.',
    );
  }

  // A statutory number's limits are checked on the format as saved, at the
  // first number it would issue this year; allocation checks every number again.
  if (isStatutory(moduleType)) {
    const first = formatSeriesNumber(input, input.startingNumber + 1, financialYear(input.fyFormat));
    const problem = statutoryNumberProblem(first);
    if (problem !== null) throw new NumberSeriesError(problem);
  }

  await tx.query(
    `INSERT INTO procurement.number_series
       (tenant_id, module_type, prefix, separator, padding, include_fy, fy_format,
        reset_each_fy, starting_number, status, set_by, set_on, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed', $10, now(), now())
     ON CONFLICT (tenant_id, module_type) DO UPDATE
        SET prefix          = EXCLUDED.prefix,
            separator       = EXCLUDED.separator,
            padding         = EXCLUDED.padding,
            include_fy      = EXCLUDED.include_fy,
            fy_format       = EXCLUDED.fy_format,
            reset_each_fy   = EXCLUDED.reset_each_fy,
            starting_number = EXCLUDED.starting_number,
            status          = 'confirmed',
            set_by          = EXCLUDED.set_by,
            set_on          = now(),
            updated_at      = now()`,
    [
      ctx.tenantId,
      moduleType,
      input.prefix,
      input.separator,
      input.padding,
      input.includeFy,
      input.fyFormat,
      input.resetEachFy,
      input.startingNumber,
      savedBy,
    ],
  );
}

function nextOf(row: SeriesRow, fy: string): number {
  const restarting = row.reset_each_fy && row.series_fy !== fy;
  return restarting ? Number(row.starting_number) + 1 : Number(row.last_number) + 1;
}

function fyFormatOf(value: string | undefined): FyFormat {
  return value !== undefined && isFyFormat(value) ? value : 'YYYY-YY';
}

function toAllocated(row: SeriesRow, sequence: number, fy: string): AllocatedNumber {
  const shape: SeriesFormat = {
    prefix: row.prefix,
    separator: row.separator,
    padding: row.padding,
    includeFy: row.include_fy,
    fyFormat: fyFormatOf(row.fy_format),
  };
  return {
    number: formatSeriesNumber(shape, sequence, fy),
    sequence,
    financialYear: fy,
    format: {
      ...shape,
      resetEachFy: row.reset_each_fy,
      startingNumber: Number(row.starting_number),
      status: row.status,
    },
  };
}
