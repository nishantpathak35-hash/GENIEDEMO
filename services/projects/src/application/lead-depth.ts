import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './boq-writes.js';

/**
 * What a lead accumulates while somebody works it: its contacts, its timeline,
 * and the next date anybody has committed to.
 *
 * Separate from `leads.ts` because the lead record and the work done against it
 * change for different reasons — a lead is edited, a timeline is only ever
 * appended to, and the two want different privileges. `app_runtime` holds
 * `SELECT, INSERT` on `lead_activities` and nothing else, so "correct the
 * history" is not an operation this service could perform even by mistake.
 */

const FK_VIOLATION = '23503';

export class LeadContactNotFound extends Error {
  override readonly name = 'LeadContactNotFound';
}

export class LeadActivityRefused extends Error {
  override readonly name = 'LeadActivityRefused';
}

// ─────────────────────────────────────────────────────────────── contacts ──

export interface LeadContact {
  readonly id: string;
  readonly leadId: string;
  readonly name: string;
  /** Job title at the client. Not an authorisation role — see 0061. */
  readonly designation: string;
  readonly phone: string;
  readonly email: string;
  readonly isPrimary: boolean;
}

export interface LeadContactInput {
  readonly name: string;
  readonly designation?: string | undefined;
  readonly phone?: string | undefined;
  readonly email?: string | undefined;
  readonly isPrimary?: boolean | undefined;
}

export async function listLeadContacts(
  tx: TxLike,
  leadId: string,
): Promise<readonly LeadContact[]> {
  const rows = await tx.query<{
    id: string;
    lead_id: string;
    name: string;
    designation: string;
    phone: string;
    email: string;
    is_primary: boolean;
  }>(
    `SELECT id, lead_id, name, designation, phone, email, is_primary
       FROM projects.lead_contacts
      WHERE lead_id = $1
      ORDER BY is_primary DESC, name`,
    [leadId],
  );
  return rows.map((r) => ({
    id: r.id,
    leadId: r.lead_id,
    name: r.name,
    designation: r.designation,
    phone: r.phone,
    email: r.email,
    isPrimary: r.is_primary,
  }));
}

/**
 * Add somebody at the client.
 *
 * **Making one primary demotes the other, in the same transaction.** The
 * partial unique index permits one primary per lead, so a second would fail the
 * constraint rather than silently become the answer — and a constraint
 * violation is not the experience wanted for "make this the main contact".
 */
export async function addLeadContact(
  tx: TxLike,
  ctx: TenantContext,
  leadId: string,
  input: LeadContactInput,
): Promise<{ id: string }> {
  if (input.name.trim() === '') throw new LeadActivityRefused('A contact needs a name.');

  if (input.isPrimary === true) {
    await tx.query(
      `UPDATE projects.lead_contacts SET is_primary = false, updated_at = now()
        WHERE lead_id = $1 AND is_primary`,
      [leadId],
    );
  }

  try {
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO projects.lead_contacts
         (tenant_id, id, lead_id, name, designation, phone, email, is_primary)
       VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        ctx.tenantId,
        leadId,
        input.name.trim(),
        input.designation ?? '',
        input.phone ?? '',
        input.email ?? '',
        input.isPrimary ?? false,
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new LeadContactNotFound('the contact was not added');
    return { id };
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === FK_VIOLATION) {
      throw new LeadContactNotFound(`no such lead: ${leadId}`);
    }
    throw error;
  }
}

export async function removeLeadContact(tx: TxLike, contactId: string): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `DELETE FROM projects.lead_contacts WHERE id = $1 RETURNING id`,
    [contactId],
  );
  if (rows[0] === undefined) throw new LeadContactNotFound(`no such contact: ${contactId}`);
}

// ─────────────────────────────────────────────────────────────── timeline ──

export interface LeadActivity {
  readonly id: string;
  readonly leadId: string;
  readonly kind: string;
  readonly summary: string;
  readonly detail: string;
  readonly occurredOn: string;
  readonly recordedBy: string;
}

export interface LeadActivityInput {
  readonly kind: string;
  readonly summary: string;
  readonly detail?: string | undefined;
  readonly occurredOn: string;
  /** Optional. Setting it is a commitment; clearing it is `null`. */
  readonly nextFollowupOn?: string | null | undefined;
  /** What kind of step the next one is; kept only alongside a date. */
  readonly nextFollowupKind?: 'call' | 'meeting' | 'email' | 'site_visit' | 'note' | undefined;
}

export async function listLeadActivities(
  tx: TxLike,
  leadId: string,
): Promise<readonly LeadActivity[]> {
  const rows = await tx.query<{
    id: string;
    lead_id: string;
    kind: string;
    summary: string;
    detail: string;
    occurred_on: string;
    recorded_by: string;
  }>(
    `SELECT id, lead_id, kind, summary, detail,
            occurred_on::text AS occurred_on, recorded_by
       FROM projects.lead_activities
      -- This record's own entries, AND those of every record merged into it.
      --
      -- A merge does not move activities: the table is append-only by grant,
      -- and a logged call happened against the record it was logged on.
      -- Reading across the merge is how the history stays complete without
      -- any row being rewritten to say it happened somewhere else.
      WHERE lead_id = $1
         OR lead_id IN (SELECT id FROM projects.leads WHERE merged_into_id = $1)
      ORDER BY occurred_on DESC, created_at DESC`,
    [leadId],
  );
  return rows.map((r) => ({
    id: r.id,
    leadId: r.lead_id,
    kind: r.kind,
    summary: r.summary,
    detail: r.detail,
    occurredOn: r.occurred_on,
    recordedBy: r.recorded_by,
  }));
}

/**
 * Record something that happened, and optionally the next thing that will.
 *
 * Both in one transaction, because they are one act: logging a call and saying
 * when the next one is are the same sentence, and a system that makes them two
 * saves gets the second one skipped.
 *
 * `occurredOn` is when it HAPPENED, not when it was typed. A site visit
 * recorded three days later still belongs on the day it happened, and a
 * timeline ordered by entry time would put it in the wrong place.
 */
export async function recordLeadActivity(
  tx: TxLike,
  ctx: TenantContext,
  leadId: string,
  input: LeadActivityInput,
): Promise<{ id: string }> {
  if (input.summary.trim() === '') throw new LeadActivityRefused('An activity needs a summary.');

  try {
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO projects.lead_activities
         (tenant_id, id, lead_id, kind, summary, detail, occurred_on, recorded_by)
       VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6::date, $7)
       RETURNING id`,
      [
        ctx.tenantId,
        leadId,
        input.kind,
        input.summary.trim(),
        input.detail ?? '',
        input.occurredOn,
        ctx.principal.id,
      ],
    );

    if (input.nextFollowupOn !== undefined) {
      // `updated_at` moves but `version` does NOT. The optimistic lock on a
      // lead guards its commercial fields; logging a call must not invalidate
      // an edit somebody has open, or nobody will log calls.
      await tx.query(
        `UPDATE projects.leads
            SET next_followup_on = $2::date, next_followup_kind = $3, updated_at = now()
          WHERE id = $1`,
        // A kind without a date is a plan for no day, and 0086 refuses it.
        [leadId, input.nextFollowupOn, input.nextFollowupOn === null ? null : (input.nextFollowupKind ?? null)],
      );
    }

    const id = rows[0]?.id;
    if (id === undefined) throw new LeadActivityRefused('the activity was not recorded');
    return { id };
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === FK_VIOLATION) {
      throw new LeadContactNotFound(`no such lead: ${leadId}`);
    }
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────── losing ──

const CLOSED_LOST = ['unqualified', 'rejected'];

/**
 * Close a lead as lost, with a reason.
 *
 * **The reason is required, and that is the whole feature.** It is the only
 * field in a CRM that changes what the company does next — "lost on price" and
 * "lost because we never followed up" call for opposite responses. A database
 * constraint requires it too, so a row written any other way fails rather than
 * accumulating reasonless losses.
 *
 * The stage change is also written to the timeline, so a review sees the loss
 * in sequence with the calls that led to it rather than as a status that
 * changed at some unrecorded moment.
 */
export async function markLeadLost(
  tx: TxLike,
  ctx: TenantContext,
  leadId: string,
  input: { stage: string; reason: string; expectedVersion: number },
): Promise<void> {
  if (!CLOSED_LOST.includes(input.stage)) {
    throw new LeadActivityRefused(
      `a lost lead is 'unqualified' or 'rejected', not '${input.stage}'`,
    );
  }
  if (input.reason.trim() === '') {
    throw new LeadActivityRefused('A reason is required. A lost lead with no reason teaches nothing.');
  }

  const rows = await tx.query<{ id: string }>(
    `UPDATE projects.leads
        SET stage = $2, lost_reason = $3, next_followup_on = NULL, next_followup_kind = NULL,
            closed_on = (now() AT TIME ZONE 'Asia/Kolkata')::date,
            version = version + 1, updated_at = now()
      WHERE id = $1 AND version = $4
      RETURNING id`,
    [leadId, input.stage, input.reason.trim(), input.expectedVersion],
  );
  if (rows[0] === undefined) {
    throw new LeadActivityRefused(
      'this lead was modified by someone else. Reload and try again.',
    );
  }

  await tx.query(
    `INSERT INTO projects.lead_activities
       (tenant_id, id, lead_id, kind, summary, detail, occurred_on, recorded_by)
     VALUES ($1, gen_random_uuid(), $2, 'lost', $3, $4, CURRENT_DATE, $5)`,
    [ctx.tenantId, leadId, `Lost — ${input.stage}`, input.reason.trim(), ctx.principal.id],
  );
}

// ───────────────────────────────────────────────────────── possible copies ──

/**
 * Other leads that share this client name.
 *
 * **This is a WARNING and it decides nothing.** It matches on an exact,
 * case-insensitive client name — not a `LIKE '%…%'`, which is the legacy's
 * central defect: identity by fuzzy string. The result is shown to a person who
 * looks at both and forms a view. Nothing links, merges or blocks on it.
 *
 * Merging is not built. It moves records between leads and deletes one, and
 * reaching that from a fuzzy match is how two unrelated clients become one.
 */
export async function possibleDuplicates(
  tx: TxLike,
  clientName: string,
  excludeLeadId?: string,
): Promise<ReadonlyArray<{ id: string; clientName: string; stage: string }>> {
  const rows = await tx.query<{ id: string; client_name: string; stage: string }>(
    `SELECT id, client_name, stage
       FROM projects.leads
      WHERE lower(trim(client_name)) = lower(trim($1))
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      ORDER BY created_at
      LIMIT 20`,
    [clientName, excludeLeadId ?? null],
  );
  return rows.map((r) => ({ id: r.id, clientName: r.client_name, stage: r.stage }));
}
