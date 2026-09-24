import type { TenantContext } from '@cog/contracts';
import { toWire } from '@cog/money';
import {
  CATALOGUE_EFFECTIVE_FROM,
  PROVISIONAL_RATES,
  PROVISIONAL_THRESHOLDS,
} from '../domain/statutory-catalogue.js';

/**
 * The tax-rate table, as a surface a person can look at.
 *
 * **This module reads and writes rates, and payments, challans, 26Q content,
 * Tally vouchers and tax invoices compute with them.** Every row is
 * provisional, so those outputs are refused unless the process produces drafts
 * (`STATUTORY_OUTPUTS=draft`), and a draft says so (ADR-0014, addendums;
 * `domain/go-live-gate.ts`).
 *
 * **Every row written here is `provisional`, and there is no route that writes
 * `verified`.** Promotion is a human act with a name, a date and a statute
 * behind it — `finance.tax_rates` has a CHECK constraint that refuses a
 * verified row without all three, and this file never supplies them. CA-01
 * through CA-08 are open; a settings screen configuring a rate is not a
 * chartered accountant verifying one, and the whole point of the status column
 * is that those two things stay distinguishable.
 *
 * The table ships empty. A tenant's statutory values arrive from
 * `domain/statutory-catalogue.ts` through `loadProvisionalCatalogue`, each
 * naming its source and its CA question — never from the legacy, whose own two
 * rate tables disagree and neither filters on its effective dates (CA-05).
 */

export interface TxLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

export class TaxRateError extends Error {
  override readonly name = 'TaxRateError';
}

export interface TaxRateRow {
  readonly id: string;
  readonly key: string;
  readonly payeeClass: string | null;
  readonly rateBp: number;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: 'provisional' | 'verified';
  readonly statute: string | null;
  readonly verifiedBy: string | null;
  readonly verifiedOn: string | null;
  readonly questionRef: string | null;
  /** Relayed from a CA call, statute text, or entered by a person. Not evidence. */
  readonly source: string | null;
}

export async function listTaxRates(tx: TxLike): Promise<readonly TaxRateRow[]> {
  const rows = await tx.query<{
    id: string;
    key: string;
    payee_class: string | null;
    rate_bp: number;
    effective_from: string;
    effective_to: string | null;
    status: string;
    statute: string | null;
    verified_by: string | null;
    verified_on: string | null;
    question_ref: string | null;
    source: string | null;
  }>(
    `SELECT id, key, payee_class, rate_bp,
            effective_from::text AS effective_from,
            effective_to::text   AS effective_to,
            status, statute, verified_by,
            verified_on::text    AS verified_on,
            question_ref, source
       FROM finance.tax_rates
      ORDER BY key, effective_from DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    payeeClass: r.payee_class,
    rateBp: r.rate_bp,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    status: r.status as 'provisional' | 'verified',
    statute: r.statute,
    verifiedBy: r.verified_by,
    verifiedOn: r.verified_on,
    questionRef: r.question_ref,
    source: r.source,
  }));
}

export interface RecordTaxRateInput {
  readonly key: string;
  readonly payeeClass?: string | undefined;
  readonly rateBp: number;
  readonly effectiveFrom: string;
  readonly questionRef?: string | undefined;
}

/**
 * Record a rate somebody intends to apply.
 *
 * `status` is hard-coded to `'provisional'` and no parameter can change it.
 * That is the entire security property of this function: the only way a rate
 * becomes `verified` is a human writing the statute, the name and the date, and
 * that path deliberately does not exist over HTTP.
 *
 * An effective date is REQUIRED, with no default. A rate without one is
 * incomplete — a voucher raised in FY2024-25 must compute under FY2024-25 rules
 * forever, and the legacy's rate tables carry the columns and never filter on
 * them (CA-05).
 */
export async function recordTaxRate(
  tx: TxLike,
  ctx: TenantContext,
  input: RecordTaxRateInput,
): Promise<{ id: string }> {
  if (input.key.trim() === '') throw new TaxRateError('A rate needs a key.');
  if (!Number.isInteger(input.rateBp) || input.rateBp < 0) {
    throw new TaxRateError('A rate is a whole number of basis points, and not negative.');
  }

  const rows = await tx.query<{ id: string }>(
    `INSERT INTO finance.tax_rates
       (tenant_id, id, key, payee_class, rate_bp, effective_from, status, question_ref, source)
     VALUES ($1, gen_random_uuid(), $2, $3, $4, $5::date, 'provisional', $6,
             'entered by a person in Settings › Tax')
     RETURNING id`,
    [
      ctx.tenantId,
      input.key.trim(),
      input.payeeClass ?? null,
      input.rateBp,
      input.effectiveFrom,
      input.questionRef ?? null,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new TaxRateError('the rate was not recorded');
  return { id };
}

export interface TdsThresholdRow {
  readonly id: string;
  readonly section: string;
  readonly kind: 'single_payment' | 'annual_aggregate' | 'monthly' | 'annual_excess';
  /** Paise, as the canonical wire string. */
  readonly amount: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: 'provisional' | 'verified';
  readonly statute: string | null;
  readonly source: string | null;
  readonly verifiedBy: string | null;
  readonly verifiedOn: string | null;
  readonly questionRef: string | null;
}

export async function listTdsThresholds(tx: TxLike): Promise<readonly TdsThresholdRow[]> {
  const rows = await tx.query<{
    id: string;
    section: string;
    kind: string;
    amount: string;
    effective_from: string;
    effective_to: string | null;
    status: string;
    statute: string | null;
    source: string | null;
    verified_by: string | null;
    verified_on: string | null;
    question_ref: string | null;
  }>(
    `SELECT id, section, kind, amount::text AS amount,
            effective_from::text AS effective_from,
            effective_to::text   AS effective_to,
            status, statute, source, verified_by,
            verified_on::text    AS verified_on,
            question_ref
       FROM finance.tds_thresholds
      ORDER BY section, kind, effective_from DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    section: r.section,
    kind: r.kind as TdsThresholdRow['kind'],
    amount: r.amount,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    status: r.status as 'provisional' | 'verified',
    statute: r.statute,
    source: r.source,
    verifiedBy: r.verified_by,
    verifiedOn: r.verified_on,
    questionRef: r.question_ref,
  }));
}

/**
 * Write the provisional catalogue's values this tenant does not have yet.
 *
 * Every row goes in as `provisional`, with its statute, its source and its CA
 * question, and with `verified_by` and `verified_on` empty — there is no
 * parameter that could say otherwise. A value the tenant already has for the
 * same key, payee class (or section and kind) and effective date is left
 * exactly as it is, so running this twice adds nothing and a row somebody has
 * since promoted is never overwritten by its provisional original. The check
 * names the tenant itself rather than leaning on RLS alone: run through a
 * connection that bypasses the policies, it would otherwise see another
 * organisation's row and skip this one's.
 */
export async function loadProvisionalCatalogue(
  tx: TxLike,
  ctx: TenantContext,
): Promise<{ ratesAdded: number; thresholdsAdded: number }> {
  let ratesAdded = 0;
  for (const rate of PROVISIONAL_RATES) {
    const added = await tx.query<{ id: string }>(
      `INSERT INTO finance.tax_rates
         (tenant_id, id, key, payee_class, rate_bp, effective_from, status, statute, source, question_ref)
       SELECT $1, gen_random_uuid(), $2::text, $3::text, $4, $5::date, 'provisional', $6, $7, $8
        WHERE NOT EXISTS (
          SELECT 1 FROM finance.tax_rates
           WHERE tenant_id = $1 AND key = $2::text
             AND payee_class IS NOT DISTINCT FROM $3::text
             AND effective_from = $5::date)
       RETURNING id`,
      [
        ctx.tenantId,
        rate.key,
        rate.payeeClass,
        rate.rate,
        CATALOGUE_EFFECTIVE_FROM,
        rate.statute,
        rate.source,
        rate.questionRef,
      ],
    );
    ratesAdded += added.length;
  }

  let thresholdsAdded = 0;
  for (const threshold of PROVISIONAL_THRESHOLDS) {
    const added = await tx.query<{ id: string }>(
      `INSERT INTO finance.tds_thresholds
         (tenant_id, id, section, kind, amount, effective_from, status, statute, source, question_ref)
       SELECT $1, gen_random_uuid(), $2::text, $3::text, $4::bigint, $5::date, 'provisional', $6, $7, $8
        WHERE NOT EXISTS (
          SELECT 1 FROM finance.tds_thresholds
           WHERE tenant_id = $1 AND section = $2::text AND kind = $3::text AND effective_from = $5::date)
       RETURNING id`,
      [
        ctx.tenantId,
        threshold.section,
        threshold.kind,
        toWire(threshold.amount),
        CATALOGUE_EFFECTIVE_FROM,
        threshold.statute,
        threshold.source,
        threshold.questionRef,
      ],
    );
    thresholdsAdded += added.length;
  }

  return { ratesAdded, thresholdsAdded };
}
