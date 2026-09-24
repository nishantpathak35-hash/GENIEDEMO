import { randomUUID } from 'node:crypto';
import type { Paise, TenantContext } from '@cog/contracts';
import { fromWire } from '@cog/money';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import type { PipelineLine } from '../domain/pipeline.js';
import type { TxLike } from './boq-writes.js';

/**
 * Leads.
 *
 * **A replacement.** Every legacy write carries something ADR-0014 forbids.
 *
 * | Legacy | Why it is not ported |
 * |---|---|
 * | `estimated_value REAL` (`migrations.js:415`), multiplied by a probability in the browser (`CrmView.js:53`) | `bigint` paise, and the weighted figure is computed here |
 * | Four different stage→probability ladders (CRM-01) | The probability is stored as entered and never derived. Inventing a fifth ladder would be worse than storing what somebody typed |
 * | `id = 'OPP-' + Math.floor(100 + Math.random() * 900)` (`crm.js:57`) against a `TEXT PRIMARY KEY` — 900 values | uuid |
 * | `assigned_to` is `payload.owner \|\| session?.name \|\| 'Sales Team'` (`:78`) — a display name or a literal | A principal id with a composite FK |
 * | `expected_close` defaults to the literal `'15 Dec 2026'` (`:81`) | NULL. A date nobody chose is not a date |
 * | `convertLeadToProject` creates a project with `code = 'PRJ-' + Math.floor(2000 + Math.random() * 8000)` (`:179`) | The project code is supplied, and the conversion records which project the lead became |
 *
 * **The weighted pipeline is computed here, not in a browser.** `CrmView.js:53`
 * does `value * (probability / 100)` on a float and `:157` divides by 10,000,000
 * to show crores. That is money arithmetic in a client, twice over.
 */

const FK_VIOLATION = '23503';

export class LeadNotFound extends Error {
  override readonly name = 'LeadNotFound';
}

export class LeadStaleWrite extends Error {
  override readonly name = 'LeadStaleWrite';
}

export class LeadReferentNotFound extends Error {
  override readonly name = 'LeadReferentNotFound';
}

export class LeadNotConvertible extends Error {
  override readonly name = 'LeadNotConvertible';
}

export interface LeadInput {
  readonly clientName: string;
  readonly contactName?: string | undefined;
  readonly phone?: string | undefined;
  readonly email?: string | undefined;
  readonly stage: string;
  readonly estimatedValue: string;
  readonly probabilityPct: number;
  readonly projectType?: string | undefined;
  readonly source?: string | undefined;
  readonly city?: string | undefined;
  readonly consultant?: string | undefined;
  readonly ownerId?: string | undefined;
  readonly expectedClose?: string | undefined;
  readonly notes?: string | undefined;
}

export interface UpdateLeadInput extends LeadInput {
  readonly expectedVersion: number;
}

export type NextStepKind = 'call' | 'meeting' | 'email' | 'site_visit' | 'note';

export interface Lead {
  readonly id: string;
  readonly clientName: string;
  readonly contactName: string;
  readonly phone: string;
  readonly email: string;
  readonly stage: string;
  readonly estimatedValue: Paise;
  readonly probabilityPct: number;
  readonly projectType: string;
  readonly source: string;
  readonly city: string;
  readonly consultant: string;
  readonly ownerId: string | null;
  readonly expectedClose: string | null;
  readonly nextFollowupOn: string | null;
  readonly nextFollowupKind: NextStepKind | null;
  readonly closedOn: string | null;
  readonly lostReason: string;
  readonly notes: string;
  readonly convertedProjectId: string | null;
  readonly version: number;
}

/** Stages that are still in play. Won, unqualified and rejected are decided. */
const OPEN_STAGES = ['lead', 'qualified', 'proposal_shared', 'negotiation'] as const;

const COLUMNS = `id, client_name, contact_name, phone, email, stage,
                 estimated_value::text AS estimated_value, probability_pct,
                 project_type, source, city, consultant, owner_id,
                 expected_close::text AS expected_close, notes,
                 next_followup_on::text AS next_followup_on, next_followup_kind,
                 closed_on::text AS closed_on, lost_reason,
                 converted_project_id, version`;

type Row = {
  id: string;
  client_name: string;
  contact_name: string;
  phone: string;
  email: string;
  stage: string;
  estimated_value: string;
  probability_pct: number;
  project_type: string;
  source: string;
  city: string;
  consultant: string;
  owner_id: string | null;
  expected_close: string | null;
  next_followup_on: string | null;
  next_followup_kind: NextStepKind | null;
  closed_on: string | null;
  lost_reason: string;
  notes: string;
  converted_project_id: string | null;
  version: number;
};

function toLead(r: Row): Lead {
  return {
    id: r.id,
    clientName: r.client_name,
    contactName: r.contact_name,
    phone: r.phone,
    email: r.email,
    stage: r.stage,
    estimatedValue: fromWire(r.estimated_value),
    probabilityPct: r.probability_pct,
    projectType: r.project_type,
    source: r.source,
    city: r.city,
    consultant: r.consultant,
    ownerId: r.owner_id,
    expectedClose: r.expected_close,
    nextFollowupOn: r.next_followup_on,
    nextFollowupKind: r.next_followup_kind,
    closedOn: r.closed_on,
    lostReason: r.lost_reason,
    notes: r.notes,
    convertedProjectId: r.converted_project_id,
    version: r.version,
  };
}

export type LeadSortKey = 'value' | 'created';

/** `value` sorts on `estimated_value`, `created` on `created_at` — both `NOT NULL`, so neither needs a `COALESCE`. */
const LEAD_SORT_COLUMN: Record<
  LeadSortKey,
  { readonly column: string; readonly keyType: 'numeric' | 'timestamptz' }
> = {
  value: { column: 'estimated_value', keyType: 'numeric' },
  created: { column: 'created_at', keyType: 'timestamptz' },
};

export interface LeadListFilter {
  readonly stage?: string | undefined;
  readonly q?: string | undefined;
}

export interface LeadListSort {
  readonly key: LeadSortKey;
  readonly desc: boolean;
}

export interface LeadListPage {
  readonly items: readonly Lead[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly count: number;
}

/**
 * The pipeline, windowed.
 *
 * The sort column is read back aliased `sort_key`, whichever column it is —
 * `estimated_value` for `value`, `created_at` for `created` — so the cursor
 * never has to carry which sort produced it, only the value and the id.
 */
export async function listLeads(
  tx: TxLike,
  page: PageQuery,
  sort: LeadListSort,
  filter: LeadListFilter,
): Promise<LeadListPage> {
  const { column, keyType } = LEAD_SORT_COLUMN[sort.key];
  const params: unknown[] = [
    filter.stage ?? null,
    filter.q === undefined || filter.q === '' ? null : `%${filter.q}%`,
  ];
  const where = `($1::text IS NULL OR stage = $1)
             AND ($2::text IS NULL OR client_name ILIKE $2 OR contact_name ILIKE $2)`;
  const k = keyset(page, column, 'id', keyType, sort.desc, params.length + 1);
  const rows = await tx.query<Row & { sort_key: string }>(
    `SELECT ${COLUMNS}, ${column}::text AS sort_key
       FROM projects.leads
      WHERE ${where}
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${params.length + k.params.length + 1}`,
    [...params, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM projects.leads WHERE ${where}`,
    params,
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.sort_key, id: r.id }));
  return {
    items: paged.items.map(toLead),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

/**
 * Every lead's value, probability and stage, under the same stage filter as
 * the list — three narrow columns, no `LIMIT`. `pipelineTotals` aggregates
 * over the tenant's WHOLE pipeline, not a screen, and a tenant's lead count
 * bounds what this reads.
 */
export async function listLeadTotalsInput(tx: TxLike, stage?: string): Promise<PipelineLine[]> {
  const rows = await tx.query<{ estimated_value: string; probability_pct: number; stage: string }>(
    `SELECT estimated_value::text AS estimated_value, probability_pct, stage
       FROM projects.leads
      WHERE ($1::text IS NULL OR stage = $1)`,
    [stage ?? null],
  );
  return rows.map((r) => ({
    value: fromWire(r.estimated_value),
    probabilityPct: r.probability_pct,
    stage: r.stage,
  }));
}

/**
 * The two sales facts a pipeline cannot answer from its stages alone: what
 * was won this quarter (by `closed_on`, 0086) and when the next site visit
 * is. Over every lead, never a window. Leads closed before 0086 carry no
 * date and are not in the quarter — stated on the contract, not guessed.
 */
export async function salesMoments(tx: TxLike): Promise<{
  wonThisQuarter: { since: string; count: number; value: Paise };
  nextSiteVisit: { leadId: string; clientName: string; on: string } | null;
}> {
  const [won] = await tx.query<{ since: string; n: number; value: string }>(
    `WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS d)
     SELECT date_trunc('quarter', today.d)::date::text AS since,
            count(l.id)::int AS n,
            COALESCE(SUM(l.estimated_value), 0)::text AS value
       FROM today
       LEFT JOIN projects.leads l
         ON l.stage = 'won'
        AND l.closed_on >= date_trunc('quarter', today.d)::date
        AND l.closed_on <= today.d
      GROUP BY today.d`,
  );
  const visits = await tx.query<{ id: string; client_name: string; next_on: string }>(
    `SELECT id, client_name, next_followup_on::text AS next_on
       FROM projects.leads
      WHERE next_followup_kind = 'site_visit'
        AND next_followup_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND stage IN ('lead', 'qualified', 'proposal_shared', 'negotiation')
      ORDER BY next_followup_on, id
      LIMIT 1`,
  );
  const visit = visits[0];
  return {
    wonThisQuarter: {
      since: won?.since ?? '',
      count: won?.n ?? 0,
      value: fromWire(won?.value ?? '0'),
    },
    nextSiteVisit:
      visit === undefined ? null : { leadId: visit.id, clientName: visit.client_name, on: visit.next_on },
  };
}

export async function getLead(tx: TxLike, id: string): Promise<Lead> {
  const rows = await tx.query<Row>(`SELECT ${COLUMNS} FROM projects.leads WHERE id = $1`, [id]);
  const row = rows[0];
  if (row === undefined) throw new LeadNotFound(`no such lead: ${id}`);
  return toLead(row);
}

export async function createLead(
  tx: TxLike,
  ctx: TenantContext,
  input: LeadInput,
): Promise<Lead> {
  const id = randomUUID();
  try {
    await tx.query(
      `INSERT INTO projects.leads
         (tenant_id, id, client_name, contact_name, phone, email, stage,
          estimated_value, probability_pct, project_type, source, city,
          consultant, owner_id, expected_close, notes, closed_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               CASE WHEN $7::text IN ('won', 'unqualified', 'rejected') THEN (now() AT TIME ZONE 'Asia/Kolkata')::date END)`,
      [
        ctx.tenantId,
        id,
        input.clientName,
        input.contactName ?? '',
        input.phone ?? '',
        input.email ?? '',
        input.stage,
        fromWire(input.estimatedValue),
        input.probabilityPct,
        input.projectType ?? '',
        input.source ?? '',
        input.city ?? '',
        input.consultant ?? '',
        input.ownerId ?? null,
        // NULL, not the legacy's literal '15 Dec 2026'.
        input.expectedClose ?? null,
        input.notes ?? '',
      ],
    );
  } catch (error) {
    throw asReferentError(error);
  }
  return getLead(tx, id);
}

export async function updateLead(
  tx: TxLike,
  id: string,
  input: UpdateLeadInput,
): Promise<Lead> {
  const current = await tx.query<{ version: number }>(
    `SELECT version FROM projects.leads WHERE id = $1`,
    [id],
  );
  const found = current[0];
  if (found === undefined) throw new LeadNotFound(`no such lead: ${id}`);
  if (found.version !== input.expectedVersion) {
    throw new LeadStaleWrite(
      `this lead was modified by someone else (expected version ${input.expectedVersion}, found ${found.version})`,
    );
  }

  let rows: Row[];
  try {
    rows = await tx.query<Row>(
      `UPDATE projects.leads
          SET client_name = $2, contact_name = $3, phone = $4, email = $5,
              stage = $6, estimated_value = $7, probability_pct = $8,
              project_type = $9, source = $10, city = $11, consultant = $12,
              owner_id = $13, expected_close = $14, notes = $15,
              -- Stamped on the move INTO a closed stage, kept while it stays
              -- there, cleared when the lead reopens. Every SET expression
              -- reads the row as it was, so \`stage\` here is the old stage.
              closed_on = CASE
                WHEN $6::text NOT IN ('won', 'unqualified', 'rejected') THEN NULL
                WHEN stage = $6::text THEN closed_on
                ELSE (now() AT TIME ZONE 'Asia/Kolkata')::date
              END,
              version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $16
      RETURNING ${COLUMNS}`,
      [
        id,
        input.clientName,
        input.contactName ?? '',
        input.phone ?? '',
        input.email ?? '',
        input.stage,
        fromWire(input.estimatedValue),
        input.probabilityPct,
        input.projectType ?? '',
        input.source ?? '',
        input.city ?? '',
        input.consultant ?? '',
        input.ownerId ?? null,
        input.expectedClose ?? null,
        input.notes ?? '',
        input.expectedVersion,
      ],
    );
  } catch (error) {
    throw asReferentError(error);
  }

  const row = rows[0];
  if (row === undefined) {
    throw new LeadStaleWrite(
      'this lead was modified by someone else while the change was being saved',
    );
  }
  return toLead(row);
}

export async function deleteLead(tx: TxLike, id: string): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `DELETE FROM projects.leads WHERE id = $1 RETURNING id`,
    [id],
  );
  if (rows[0] === undefined) throw new LeadNotFound(`no such lead: ${id}`);
}

/**
 * Mark a lead won, against the project it became.
 *
 * **The project is created by the caller first, and its id is passed in.** The
 * legacy does it the other way — `convertLeadToProject` (`crm.js:165`) invents a
 * project code with `Math.random()` and creates the project itself, so a lead
 * conversion is also a project creation with a random primary key and no
 * opportunity to name it.
 *
 * The lead is not deleted and its stage is set to `won` in the same statement,
 * which the `leads_converted_check` constraint requires: only a won lead may
 * name a project.
 */
export async function convertLead(
  tx: TxLike,
  id: string,
  projectId: string,
  expectedVersion: number,
): Promise<Lead> {
  const lead = await getLead(tx, id);
  if (lead.version !== expectedVersion) {
    throw new LeadStaleWrite(
      `this lead was modified by someone else (expected version ${expectedVersion}, found ${lead.version})`,
    );
  }
  if (lead.convertedProjectId !== null) {
    throw new LeadNotConvertible('this lead has already been converted');
  }
  if (!OPEN_STAGES.includes(lead.stage as (typeof OPEN_STAGES)[number])) {
    throw new LeadNotConvertible(`a lead at stage ${lead.stage} cannot be converted`);
  }

  let rows: Row[];
  try {
    rows = await tx.query<Row>(
      `UPDATE projects.leads
          SET stage = 'won', converted_project_id = $2,
              closed_on = (now() AT TIME ZONE 'Asia/Kolkata')::date,
              version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $3
      RETURNING ${COLUMNS}`,
      [id, projectId, expectedVersion],
    );
  } catch (error) {
    throw asReferentError(error);
  }
  const row = rows[0];
  if (row === undefined) {
    throw new LeadStaleWrite('this lead was modified by someone else while it was being converted');
  }
  return toLead(row);
}

function asReferentError(error: unknown): unknown {
  if ((error as { code?: unknown } | null)?.code === FK_VIOLATION) {
    return new LeadReferentNotFound(
      'that owner or project does not exist in this organisation',
    );
  }
  return error;
}
