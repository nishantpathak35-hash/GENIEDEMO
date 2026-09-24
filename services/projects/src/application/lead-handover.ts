import { randomUUID } from 'node:crypto';
import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './project-team.js';
import { convertLead } from './leads.js';

/**
 * Handing a won opportunity to the people who will build it.
 *
 * Three things happen and they are one statement: the project is created, the
 * opportunity is marked won against it, and what was confirmed at that moment is
 * recorded. Any two of the three without the third is a state somebody has to
 * clean up by hand — a project with no provenance, an opportunity marked won
 * against nothing, or a checklist for a job that does not exist.
 *
 * The legacy collects the same three confirmations in `CrmHandoverModal.js` and
 * stores none of them.
 *
 * The project is created `won`, not `lead`: the opportunity was won, which is
 * the whole reason a project now exists. It moves to `in_progress` when work
 * starts, through the state route (`domain/project-state.ts`).
 */

export class HandoverRefused extends Error {
  override readonly name = 'HandoverRefused';
}

export interface HandoverInput {
  /** The project's own code. Supplied, never invented. */
  readonly code: string;
  readonly name: string;
  /**
   * The contract value in wire paise, or absent.
   *
   * **Absent, not zero, when it is not settled.** Zero is a contract worth
   * nothing, which is a different statement from a contract whose value is
   * still being agreed — and a project that opens showing ₹0.00 is one somebody
   * reads as a mistake in the software rather than a gap in the paperwork.
   */
  readonly originalValue?: string | undefined;
  readonly scopeConfirmed: boolean;
  readonly commercialsConfirmed: boolean;
  readonly loiReceived: boolean;
  readonly loiDate?: string | undefined;
  readonly notes?: string | undefined;
  readonly expectedVersion: number;
}

export interface HandoverResult {
  readonly projectId: string;
  readonly handoverId: string;
}

export async function handOverLead(
  tx: TxLike,
  ctx: TenantContext,
  leadId: string,
  input: HandoverInput,
): Promise<HandoverResult> {
  // Refused here as well as by the CHECK constraint, so the message says what
  // is missing rather than naming a constraint. The constraint is what makes
  // the refusal true for a caller added later.
  if (!input.scopeConfirmed || !input.commercialsConfirmed) {
    throw new HandoverRefused(
      'A job cannot be handed over until the scope and the commercials are both confirmed.',
    );
  }
  if (input.loiReceived && (input.loiDate === undefined || input.loiDate === '')) {
    throw new HandoverRefused('Say what date the letter of intent is dated.');
  }
  if (!input.loiReceived && input.loiDate !== undefined && input.loiDate !== '') {
    throw new HandoverRefused(
      'There is a date for a letter of intent that is marked as not received.',
    );
  }

  const projectId = randomUUID();

  // `tenant_id` is stamped from the context as a bind parameter, never as a
  // column default and never read from session state inside the statement
  // (M1/D3): a forgotten stamp must fail NOT NULL and a wrong one must fail the
  // RLS WITH CHECK.
  try {
    await tx.query(
      `INSERT INTO projects.projects
         (tenant_id, id, code, name, client_name, original_value, state)
       SELECT $1, $2, $3, $4, l.client_name, $5, 'won'
         FROM projects.leads l
        WHERE l.id = $6`,
      [ctx.tenantId, projectId, input.code, input.name, input.originalValue ?? null, leadId],
    );
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') throw new HandoverRefused('A project already uses that code.');
    throw error;
  }

  // The client's name comes from the opportunity rather than from the request.
  // If the lead does not exist the SELECT matched nothing, no project was
  // written, and this is where that is discovered.
  const created = await tx.query<{ id: string }>(
    `SELECT id FROM projects.projects WHERE id = $1`,
    [projectId],
  );
  if (created[0] === undefined) throw new HandoverRefused('no such opportunity');

  // Marks it won, checks the version, and refuses a lead already converted or
  // at a stage that cannot be converted. Reused rather than reimplemented: two
  // functions that decide whether a lead may be converted is one of them being
  // wrong later.
  await convertLead(tx, leadId, projectId, input.expectedVersion);

  const handover = await tx.query<{ id: string }>(
    `INSERT INTO projects.lead_handovers
       (tenant_id, lead_id, project_id, scope_confirmed, commercials_confirmed,
        loi_received, loi_date, notes, handed_by)
     VALUES ($1, $2, $3, true, true, $4, $5::date, $6, $7)
     RETURNING id`,
    [
      ctx.tenantId,
      leadId,
      projectId,
      input.loiReceived,
      input.loiReceived ? (input.loiDate ?? null) : null,
      input.notes ?? '',
      ctx.principal.id,
    ],
  );
  const handoverId = handover[0]?.id;
  if (handoverId === undefined) throw new HandoverRefused('That handover was not recorded.');

  return { projectId, handoverId };
}

export interface HandoverRecord {
  readonly id: string;
  readonly leadId: string;
  readonly projectId: string;
  readonly loiReceived: boolean;
  readonly loiDate: string | null;
  readonly notes: string;
  readonly handedBy: string | null;
  readonly handedAt: string;
}

/** What was confirmed when this project was handed over, if it was. */
export async function handoverForProject(
  tx: TxLike,
  projectId: string,
): Promise<HandoverRecord | null> {
  const rows = await tx.query<{
    id: string;
    lead_id: string;
    project_id: string;
    loi_received: boolean;
    loi_date: string | null;
    notes: string;
    handed_by: string | null;
    handed_at: string;
  }>(
    `SELECT id, lead_id, project_id, loi_received, loi_date::text AS loi_date,
            notes, handed_by, handed_at::text AS handed_at
       FROM projects.lead_handovers
      WHERE project_id = $1`,
    [projectId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    leadId: row.lead_id,
    projectId: row.project_id,
    loiReceived: row.loi_received,
    loiDate: row.loi_date,
    notes: row.notes,
    handedBy: row.handed_by,
    handedAt: row.handed_at,
  };
}
