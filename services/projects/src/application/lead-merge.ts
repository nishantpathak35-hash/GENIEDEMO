import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './project-team.js';

/**
 * Folding one opportunity into another.
 *
 * The legacy does this at `crm.js:1417` and gets most of it right — it repoints
 * children, fills gaps rather than overwriting, and does not delete. Two things
 * are wrong with it and both are here on purpose:
 *
 *   1. **It marks the losing record `Lost`** (`crm.js:1523`) with a fabricated
 *      `lost_reason`. Every pipeline figure then counts a tidied duplicate as
 *      an opportunity the company lost. A merge is not an outcome.
 *
 *   2. **Nothing records what moved.** After five bare UPDATEs a repointed
 *      contact is indistinguishable from one that was always on the surviving
 *      record, so the merge cannot be undone even in principle and "what did
 *      the other record hold" has no answer.
 *
 * Everything below happens in the caller's transaction. A half-applied merge —
 * children moved, snapshot not written — is the state that makes the rest of
 * this pointless.
 */

export class LeadMergeRefused extends Error {
  override readonly name = 'LeadMergeRefused';
}

/** The lead columns a merge can carry across. Kept in one place deliberately. */
const FILLABLE = [
  'contact_name',
  'phone',
  'email',
  'project_type',
  'source',
  'city',
  'consultant',
  'notes',
] as const;

interface LeadRow extends Record<string, unknown> {
  readonly id: string;
  readonly stage: string;
  readonly merged_into_id: string | null;
  readonly converted_project_id: string | null;
  readonly estimated_value: string;
  readonly probability_pct: number;
  readonly expected_close: string | null;
  readonly owner_id: string | null;
  readonly client_name: string;
  readonly contact_name: string;
  readonly phone: string;
  readonly email: string;
  readonly project_type: string;
  readonly source: string;
  readonly city: string;
  readonly consultant: string;
  readonly notes: string;
}

const LEAD_COLUMNS = `id, stage, merged_into_id, converted_project_id,
  estimated_value::text AS estimated_value, probability_pct,
  expected_close::text AS expected_close, owner_id, client_name, contact_name,
  phone, email, project_type, source, city, consultant, notes`;

async function readLead(tx: TxLike, id: string): Promise<LeadRow | undefined> {
  // No `WHERE tenant_id` — RLS applies it, so another tenant's id simply does
  // not match and the caller gets "no such opportunity" rather than a refusal
  // that confirms it exists somewhere.
  const rows = await tx.query<LeadRow>(
    `SELECT ${LEAD_COLUMNS} FROM projects.leads WHERE id = $1`,
    [id],
  );
  return rows[0];
}

export interface MergeResult {
  readonly mergeId: string;
  readonly repointed: number;
  readonly filled: readonly string[];
}

/**
 * Merge `secondaryId` into `primaryId`.
 *
 * **Gaps are filled; nothing is overwritten.** A value already on the surviving
 * record wins, always. The alternative — letting the losing record's value take
 * precedence — means a merge silently changes a figure somebody quoted from,
 * and there is no way to tell afterwards that it happened. The fields that were
 * filled are returned and recorded, so the change is visible where it was made.
 *
 * `estimated_value` is **never** carried across and never summed. The legacy's
 * project merge adds financial figures together (`projects.js:351`), which is
 * the right arithmetic only if the two records describe different work — and a
 * merge is the assertion that they describe the SAME work. Two records of one
 * ₹40,00,000 job are not an ₹80,00,000 job. If the surviving record's value is
 * wrong, somebody edits it, and the edit is a lead write with a version check
 * behind it.
 */
export async function mergeLeads(
  tx: TxLike,
  ctx: TenantContext,
  primaryId: string,
  secondaryId: string,
): Promise<MergeResult> {
  if (primaryId === secondaryId) {
    throw new LeadMergeRefused('An opportunity cannot be merged into itself.');
  }

  const primary = await readLead(tx, primaryId);
  const secondary = await readLead(tx, secondaryId);
  if (primary === undefined) throw new LeadMergeRefused('no such opportunity');
  if (secondary === undefined) throw new LeadMergeRefused('no such opportunity');

  if (primary.merged_into_id !== null) {
    throw new LeadMergeRefused(
      'That opportunity has already been merged into another one. Merge into the surviving record instead.',
    );
  }
  if (secondary.merged_into_id !== null) {
    throw new LeadMergeRefused('That opportunity has already been merged away.');
  }

  // **Both converted is refused, and the reason is not tidiness.** Each has
  // become a project with its own purchase orders, its own BOQ and its own
  // client. Folding the records together says the two projects are one job,
  // which is a claim about work already in progress that a CRM screen is not
  // the place to make.
  if (primary.converted_project_id !== null && secondary.converted_project_id !== null) {
    throw new LeadMergeRefused(
      'Both opportunities have already become projects. Merging them would say two live projects are one job.',
    );
  }

  // Snapshots BEFORE anything moves. Taken from the rows already read, so what
  // is recorded is exactly what the decisions above were made against.
  const primaryBefore = snapshotOf(primary);
  const losingBefore = snapshotOf(secondary);

  // 1. ONE PRIMARY CONTACT, DECIDED BEFORE ANYTHING MOVES.
  //
  // `lead_contacts_one_primary_idx` is a PARTIAL UNIQUE INDEX on
  // (tenant_id, lead_id) WHERE is_primary, so if both records have a primary
  // contact then repointing first raises a unique violation and the merge
  // fails with a message about an index. The legacy resolves this AFTER
  // moving the rows (`crm.js:1448`), which works only because SQLite has no
  // such constraint — the same code here would refuse every merge between
  // two records that each have a named contact, which is most of them.
  //
  // The surviving record's own choice wins. If it has no primary contact, the
  // incoming one keeps the flag: that is a gap being filled, not a decision
  // being overridden.
  const primaryHasPrimaryContact = await tx.query<{ id: string }>(
    `SELECT id FROM projects.lead_contacts WHERE lead_id = $1 AND is_primary LIMIT 1`,
    [primaryId],
  );
  const demoted: string[] = [];
  if (primaryHasPrimaryContact.length > 0) {
    const rows = await tx.query<{ id: string }>(
      `UPDATE projects.lead_contacts SET is_primary = false, updated_at = now()
        WHERE lead_id = $1 AND is_primary
       RETURNING id`,
      [secondaryId],
    );
    for (const row of rows) demoted.push(row.id);
  }

  // 2. Repoint the children, recording which rows moved.
  //
  // `RETURNING id` is the whole difference from the legacy's bare UPDATE. A
  // contact that arrived in a merge is otherwise indistinguishable from one
  // that was always there, which is what makes the legacy merge unanswerable.
  //
  // **ONLY CONTACTS MOVE. THE TIMELINE DOES NOT, AND CANNOT.**
  //
  // `lead_activities` is append-only by grant — `app_runtime` holds SELECT
  // and INSERT on it and nothing else (migration 0060). The first version of
  // this function repointed activities the way the legacy does
  // (`crm.js:1441`) and Postgres refused it, which is the constraint doing
  // exactly its job: a logged call happened against the record it was logged
  // on, and moving it would rewrite what somebody wrote down.
  //
  // The timeline is not lost. `listLeadActivities` reads the surviving
  // record's own entries AND those of every record merged into it, so the
  // history is complete on the screen without any row being altered.
  const repointed: { table: string; id: string; demoted?: true }[] = [];
  for (const table of ['lead_contacts'] as const) {
    const moved = await tx.query<{ id: string }>(
      `UPDATE projects.${table} SET lead_id = $1 WHERE lead_id = $2 RETURNING id`,
      [primaryId, secondaryId],
    );
    for (const row of moved) {
      // A demoted contact is flagged in the record, because losing the
      // primary flag is a change to the row and putting the merge back means
      // knowing which ones were changed.
      repointed.push(
        demoted.includes(row.id)
          ? { table, id: row.id, demoted: true }
          : { table, id: row.id },
      );
    }
  }

  // 3. Fill the surviving record's gaps. Nothing is overwritten.
  const filled: string[] = [];
  const sets: string[] = [];
  const values: unknown[] = [primaryId];
  for (const column of FILLABLE) {
    const mine = primary[column];
    const theirs = secondary[column];
    if (mine === '' && theirs !== '') {
      values.push(theirs);
      sets.push(`${column} = $${String(values.length)}`);
      filled.push(column);
    }
  }
  // A conversion carries across, because a lead that became a project and a
  // duplicate of it are the same job — and the project is the evidence.
  if (primary.converted_project_id === null && secondary.converted_project_id !== null) {
    values.push(secondary.converted_project_id);
    sets.push(`converted_project_id = $${String(values.length)}`);
    filled.push('converted_project_id');
  }
  if (sets.length > 0) {
    await tx.query(
      `UPDATE projects.leads
          SET ${sets.join(', ')}, updated_at = now(), version = version + 1
        WHERE id = $1`,
      values,
    );
  }

  // 4. Mark the losing record merged. **Not lost.**
  await tx.query(
    `UPDATE projects.leads
        SET stage = 'merged',
            merged_into_id = $2,
            updated_at = now(),
            version = version + 1
      WHERE id = $1`,
    [secondaryId, primaryId],
  );

  // 5. The record of it, in the same transaction. A merge whose evidence is
  // written separately is a merge whose evidence can be missing.
  const merge = await tx.query<{ id: string }>(
    `INSERT INTO projects.lead_merges
       (tenant_id, primary_id, secondary_id, losing_before, primary_before, repointed, merged_by)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)
     RETURNING id`,
    [
      ctx.tenantId,
      primaryId,
      secondaryId,
      JSON.stringify(losingBefore),
      JSON.stringify(primaryBefore),
      JSON.stringify(repointed),
      ctx.principal.id,
    ],
  );
  const mergeId = merge[0]?.id;
  if (mergeId === undefined) throw new LeadMergeRefused('That merge was not recorded.');

  // 6. And on the timeline, where somebody will actually see it. The activity
  // is a convenience; the row above is the record.
  await tx.query(
    `INSERT INTO projects.lead_activities
       (tenant_id, lead_id, kind, summary, detail, occurred_on, recorded_by)
     VALUES ($1, $2, 'stage_change', $3, $4, current_date, $5)`,
    [
      ctx.tenantId,
      primaryId,
      `Merged in ${secondary.client_name}`,
      filled.length === 0
        ? 'Nothing on this record was changed. Contacts and history moved across.'
        : `Filled from the other record: ${filled.join(', ')}.`,
      ctx.principal.id,
    ],
  );

  return { mergeId, repointed: repointed.length, filled };
}

export interface LeadMergeRecord {
  readonly id: string;
  readonly primaryId: string;
  readonly secondaryId: string;
  readonly mergedAt: string;
  readonly mergedBy: string | null;
  readonly losingBefore: Record<string, unknown>;
  readonly primaryBefore: Record<string, unknown>;
  readonly repointed: readonly { readonly table: string; readonly id: string }[];
}

/**
 * What was merged into this record, and what those records held.
 *
 * The question a client asks six months later — "you had two enquiries from us,
 * what happened to the first one" — and the one the legacy cannot answer at all.
 */
export async function listLeadMerges(
  tx: TxLike,
  primaryId: string,
): Promise<readonly LeadMergeRecord[]> {
  const rows = await tx.query<{
    id: string;
    primary_id: string;
    secondary_id: string;
    merged_at: string;
    merged_by: string | null;
    losing_before: Record<string, unknown>;
    primary_before: Record<string, unknown>;
    repointed: { table: string; id: string }[];
  }>(
    `SELECT id, primary_id, secondary_id, merged_at::text AS merged_at, merged_by,
            losing_before, primary_before, repointed
       FROM projects.lead_merges
      WHERE primary_id = $1
      ORDER BY merged_at DESC`,
    [primaryId],
  );
  return rows.map((r) => ({
    id: r.id,
    primaryId: r.primary_id,
    secondaryId: r.secondary_id,
    mergedAt: r.merged_at,
    mergedBy: r.merged_by,
    losingBefore: r.losing_before,
    primaryBefore: r.primary_before,
    repointed: r.repointed,
  }));
}

function snapshotOf(row: LeadRow): Record<string, unknown> {
  // Every field the record carried, including the ones a merge never touches.
  // A snapshot that only holds the fields this version of the code happens to
  // move is a snapshot that stops being complete the next time a column is
  // added.
  const { ...fields } = row;
  return fields;
}
