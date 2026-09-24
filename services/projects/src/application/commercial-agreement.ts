import type { TenantContext } from '@cog/contracts';
import {
  add,
  formatBasisPoints,
  fromWire,
  mulRatio,
  ratio,
  roundToPaise,
  sub,
  toWire,
  ZERO,
} from '@cog/money';
import type { Paise } from '@cog/contracts';
import type { TxLike } from './project-team.js';

/**
 * Workflow 4: the commercial agreement.
 *
 * **Verdict: THIN**, and this is what building a thin workflow honestly looks
 * like. The legacy's version invents four commercial terms with `??` —
 * `deposit_pct ?? 10`, `validity_days ?? 30`, `included_revisions ?? 2`,
 * `included_site_visits ?? 6` — and reads none of them anywhere. None of those
 * four exists here.
 *
 * What is left is the part with a consequence, and it carries one rule the
 * legacy has no equivalent of: **the payment stages must total exactly the
 * contract, before it can be signed.** A schedule totalling 95% never bills the
 * last 5% and looks entirely normal.
 *
 * **All money arithmetic goes through `packages/money`.** The stage amounts are
 * computed at read time from basis points, never stored: a stored amount and a
 * stored share drift apart the moment the contract value changes, and then two
 * screens disagree about what is owed.
 */

export class AgreementRefused extends Error {
  override readonly name = 'AgreementRefused';
}

/** Basis points in the whole. 100% = 10000 bp. */
const WHOLE_BP = 10_000;

export interface AgreementStage {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly trigger: string;
  readonly shareBp: number;
  /**
   * Wire paise, or null when the contract value is not settled.
   *
   * Computed, never stored. The last stage carries the rounding remainder —
   * see `stageAmounts`.
   */
  readonly amountPaise: string | null;
}

export interface CommercialAgreement {
  readonly id: string;
  readonly projectId: string;
  readonly engagementType: string;
  readonly contractValuePaise: string | null;
  readonly status: 'draft' | 'issued' | 'signed';
  readonly signedOn: string | null;
  readonly notes: string;
  readonly stages: readonly AgreementStage[];
  /** Basis points the stages currently account for. 10000 is the whole. */
  readonly allocatedBp: number;
}

/**
 * Split a contract value across shares, exactly.
 *
 * **The last stage takes the remainder**, and that is the whole reason this is
 * a function rather than a `map`. Rounding each share independently produces a
 * set of amounts that does not add up to the contract: 1/3 of ₹1,00,000.01
 * three times, each rounded, is a paisa short. Somebody eventually notices that
 * the stages do not sum to the contract and has no way to tell which one is
 * wrong.
 *
 * The boundary is `roundToPaise`, and it is not a statutory one — a payment
 * schedule is a commercial arrangement between two parties, with no section
 * behind it. `mulRatio` requires a boundary at the call site precisely so that
 * this sentence has to be written.
 */
function stageAmounts(
  contractValue: bigint | null,
  shares: readonly number[],
): readonly (string | null)[] {
  if (contractValue === null) return shares.map(() => null);

  const value = fromWire(contractValue.toString());
  const amounts: Paise[] = [];
  let allocated: Paise = ZERO;

  for (let i = 0; i < shares.length; i += 1) {
    const share = shares[i] ?? 0;
    const last = i === shares.length - 1;
    // The last one is what is left, so the set always adds up.
    const amount = last
      ? sub(value, allocated)
      : mulRatio(value, ratio(BigInt(share), BigInt(WHOLE_BP)), roundToPaise);
    amounts.push(amount);
    // `add`, not `+`. The branded type is what stops a plain bigint being
    // accumulated here, and adding through the module is the only way to keep
    // the brand.
    allocated = add(allocated, amount);
  }

  return amounts.map((a) => toWire(a));
}

export async function getAgreement(
  tx: TxLike,
  projectId: string,
): Promise<CommercialAgreement | null> {
  const rows = await tx.query<{
    id: string;
    project_id: string;
    engagement_type: string;
    contract_value_paise: string | null;
    status: string;
    signed_on: string | null;
    notes: string;
  }>(
    `SELECT id, project_id, engagement_type,
            contract_value_paise::text AS contract_value_paise,
            status, signed_on::text AS signed_on, notes
       FROM projects.commercial_agreements
      WHERE project_id = $1`,
    [projectId],
  );
  const row = rows[0];
  if (row === undefined) return null;

  const stages = await tx.query<{
    id: string;
    position: number;
    name: string;
    trigger: string;
    share_bp: number;
  }>(
    `SELECT id, position, name, trigger, share_bp
       FROM projects.agreement_stages
      WHERE agreement_id = $1
      ORDER BY position`,
    [row.id],
  );

  const amounts = stageAmounts(
    row.contract_value_paise === null ? null : BigInt(row.contract_value_paise),
    stages.map((s) => s.share_bp),
  );

  return {
    id: row.id,
    projectId: row.project_id,
    engagementType: row.engagement_type,
    contractValuePaise: row.contract_value_paise,
    status: row.status as 'draft' | 'issued' | 'signed',
    signedOn: row.signed_on,
    notes: row.notes,
    stages: stages.map((s, i) => ({
      id: s.id,
      position: s.position,
      name: s.name,
      trigger: s.trigger,
      shareBp: s.share_bp,
      amountPaise: amounts[i] ?? null,
    })),
    allocatedBp: stages.reduce((total, s) => total + s.share_bp, 0),
  };
}

export interface AgreementInput {
  readonly engagementType?: string | undefined;
  readonly contractValuePaise?: string | null | undefined;
  readonly notes?: string | undefined;
}

export async function saveAgreement(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  input: AgreementInput,
): Promise<void> {
  const current = await tx.query<{ status: string }>(
    `SELECT status FROM projects.commercial_agreements WHERE project_id = $1`,
    [projectId],
  );
  if (current[0]?.status === 'signed') {
    throw new AgreementRefused(
      'That agreement is signed. Change it with a change order, which goes through approval.',
    );
  }

  await tx.query(
    `INSERT INTO projects.commercial_agreements
       (tenant_id, project_id, engagement_type, contract_value_paise, notes, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, project_id) DO UPDATE
        SET engagement_type      = EXCLUDED.engagement_type,
            contract_value_paise = EXCLUDED.contract_value_paise,
            notes                = EXCLUDED.notes,
            updated_by           = EXCLUDED.updated_by,
            updated_at           = now()`,
    [
      ctx.tenantId,
      projectId,
      input.engagementType ?? '',
      input.contractValuePaise ?? null,
      input.notes ?? '',
      ctx.principal.id,
    ],
  );
}

export interface StageInput {
  readonly name: string;
  readonly trigger?: string | undefined;
  readonly shareBp: number;
}

/**
 * Replace the whole schedule.
 *
 * The set is sent in full rather than one stage at a time, because the rule is
 * about the SET: they have to total the contract. Adding one stage at a time
 * means every intermediate state is invalid, so either the rule is not enforced
 * or the first save is refused.
 */
export async function setStages(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  stages: readonly StageInput[],
): Promise<void> {
  const found = await tx.query<{ id: string; status: string }>(
    `SELECT id, status FROM projects.commercial_agreements WHERE project_id = $1`,
    [projectId],
  );
  const agreement = found[0];
  if (agreement === undefined) throw new AgreementRefused('no such agreement');
  if (agreement.status === 'signed') {
    throw new AgreementRefused('That agreement is signed. Its stages cannot be rewritten.');
  }

  const total = stages.reduce((sum, s) => sum + s.shareBp, 0);
  if (stages.length > 0 && total > WHOLE_BP) {
    throw new AgreementRefused(
      `Those stages come to ${formatBasisPoints(total)} of the contract, which is more than all of it.`,
    );
  }

  await tx.query(`DELETE FROM projects.agreement_stages WHERE agreement_id = $1`, [agreement.id]);
  for (const [index, stage] of stages.entries()) {
    await tx.query(
      `INSERT INTO projects.agreement_stages
         (tenant_id, agreement_id, position, name, trigger, share_bp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [ctx.tenantId, agreement.id, index, stage.name.trim(), stage.trigger ?? '', stage.shareBp],
    );
  }
}

/**
 * Issue it, or record that it was signed.
 *
 * **Signing is where the totalling rule bites.** An unsigned agreement can have
 * a half-written schedule; a signed one cannot, because from that moment
 * somebody bills against it.
 */
export async function setAgreementStatus(
  tx: TxLike,
  projectId: string,
  status: 'issued' | 'signed',
  signedOn: string | null,
): Promise<void> {
  const agreement = await getAgreement(tx, projectId);
  if (agreement === null) throw new AgreementRefused('no such agreement');
  if (agreement.status === 'signed') throw new AgreementRefused('That agreement is already signed.');

  if (status === 'signed') {
    if (agreement.contractValuePaise === null) {
      throw new AgreementRefused('An agreement cannot be signed without a contract value.');
    }
    if (signedOn === null) {
      throw new AgreementRefused('Say what date it was signed.');
    }
    if (agreement.allocatedBp !== WHOLE_BP) {
      throw new AgreementRefused(
        `The payment stages come to ${formatBasisPoints(agreement.allocatedBp)} of the contract. They have to come to 100% before it is signed, or the rest is never billed.`,
      );
    }
  }

  await tx.query(
    `UPDATE projects.commercial_agreements
        SET status = $2, signed_on = $3::date, updated_at = now()
      WHERE project_id = $1`,
    [projectId, status, status === 'signed' ? signedOn : null],
  );
}
