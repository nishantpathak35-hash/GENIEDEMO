import { Hono, type Context } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  HTTP_STATUS,
  addBoqLinesInput,
  convertLeadInput,
  mergeLeadsInput,
  handoverLeadInput,
  createChangeOrderInput,
  createLeadInput,
  decideChangeOrderInput,
  createEstimationItemInput,
  createTakeoffSheetInput,
  issueDrawingInput,
  saveTakeoffItemsInput,
  submitChangeOrderInput,
  createProjectInput,
  updateBoqLineInput,
  updateLeadInput,
  addLeadContactInput,
  recordLeadActivityInput,
  markLeadLostInput,
  projectState,
  setProjectStateInput,
  LEAD_STAGES,
} from '@cog/contracts';
import { fromWire, toWire } from '@cog/money';
import { finishPage, keyset, readPage, tenantOf, todayInIndia, txOf } from '@cog/service-kit';
import { canMove, dateStampedBy, nextStates, type ProjectState } from '../domain/project-state.js';
import { BoqError, boqTotals, lineAmount, type BoqLine } from '../domain/boq.js';
import { pipelineTotals } from '../domain/pipeline.js';
import {
  ChangeOrderConflict,
  ChangeOrderError,
  ChangeOrderNotFound,
  createChangeOrder,
  decideChangeOrder,
  derivedContractValue,
  listChangeOrders,
  submitChangeOrder,
  type StoredChangeOrder,
} from '../application/change-orders.js';
import { listProjectBudgets } from '../application/rollup.js';
import { readPipelineSummary, unsignedVariations } from '../application/dashboard.js';
import {
  TakeoffNotFound,
  TakeoffRefused,
  createSheet,
  listSheets,
  saveItems,
  summariseSheet,
} from '../application/takeoff.js';
import {
  EstimationConflict,
  EstimationItemNotFound,
  createEstimationItem,
  deleteEstimationItem,
  listEstimationItems,
  type EstimationItem,
} from '../application/estimation.js';
import {
  DrawingNotFound,
  DrawingRefused,
  issueDrawing,
  listDrawings,
  withdrawDrawing,
} from '../application/drawings.js';
import {
  LeadNotConvertible,
  LeadNotFound,
  LeadReferentNotFound,
  LeadStaleWrite,
  convertLead,
  getLead,
  createLead,
  deleteLead,
  listLeads,
  listLeadTotalsInput,
  salesMoments,
  updateLead,
  type Lead,
  type LeadListSort,
} from '../application/leads.js';
import {
  LeadActivityRefused,
  LeadContactNotFound,
  addLeadContact,
  listLeadActivities,
  listLeadContacts,
  markLeadLost,
  possibleDuplicates,
  recordLeadActivity,
  removeLeadContact,
} from '../application/lead-depth.js';
import { mergeLeads, listLeadMerges, LeadMergeRefused } from '../application/lead-merge.js';
import { handOverLead, HandoverRefused } from '../application/lead-handover.js';
import {
  BoqLineInUse,
  BoqLineNotFound,
  BoqStaleWrite,
  DuplicateBoqLine,
  ProjectNotFound,
  addBoqLines,
  deleteBoqLine,
  updateBoqLine,
  type WrittenLine,
} from '../application/boq-writes.js';
import { ProjectReadOnly, assertProjectOpen } from '../application/project-guard.js';

/**
 * Project and BOQ HTTP surface.
 *
 * Mounted by `services/host` **behind the tenant middleware**, so every handler
 * here already has a `TenantContext` and an open transaction. Nothing in this
 * file reads a tenant id from the request; there is no parameter by which a
 * caller could supply one.
 *
 * **No `WHERE tenant_id` appears in any query below.** The RLS policy applies
 * it. Writing it here as well would mean two places to keep in step, and the
 * one that drifts is the one nothing tests — while the one that matters is
 * enforced by the database whether or not the handler remembers.
 */

// A `type`, not an `interface`: `tx.query<T>` constrains T to
// `Record<string, unknown>`, and an interface has no implicit index signature.
type ProjectRow = {
  id: string;
  code: string;
  name: string;
  client_name: string;
  state: string;
  started_on: string | null;
  handed_over_on: string | null;
  original_value: string | null;
};

type BoqRow = {
  id: string;
  section: string;
  item_no: number;
  description: string;
  uom: string;
  quantity_micros: string;
  rate: string;
  cost_rate: string | null;
  version: number;
};

function toProject(row: ProjectRow): Record<string, unknown> {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    clientName: row.client_name,
    state: row.state,
    startedOn: row.started_on,
    handedOverOn: row.handed_over_on,
    moves: projectState.safeParse(row.state).success ? nextStates(row.state as ProjectState) : [],
    // `bigint` columns arrive from node-postgres as strings, which is exactly
    // the wire form. They are NOT parsed into a JS number anywhere on this
    // path — that is how the legacy's `REAL` columns became wrong.
    originalValue: row.original_value,
  };
}

/** `sort=value:desc` (the default, matching the CRM screen) or `sort=created:asc`. */
function leadListSort(c: Context): LeadListSort | { error: string } {
  const [key = 'value', dir = 'desc'] = (c.req.query('sort') ?? 'value:desc').split(':');
  if (dir !== 'asc' && dir !== 'desc') return { error: 'sort direction must be asc or desc' };
  if (key === 'value') return { key: 'value', desc: dir === 'desc' };
  if (key === 'created') return { key: 'created', desc: dir === 'desc' };
  return { error: 'sort key must be value or created' };
}

export function projectRoutes(): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const tx = txOf(c);
    const page = readPage(c);
    if ('error' in page) return validationFailedRaw(c, 'cursor', page.error);
    const state = c.req.query('state');
    if (state !== undefined && !projectState.safeParse(state).success) {
      return validationFailedRaw(c, 'state', 'not a project state');
    }
    // `q` narrows by code, name or client — a search box, not an identity
    const q = c.req.query('q');
    const like = q === undefined || q.trim() === '' ? null : `%${q.trim()}%`;
    // Newest first, id as the tiebreak; the same predicate counts the whole.
    const k = keyset(page, 'created_at', 'id', 'timestamptz', true, 3);
    const rows = await tx.query<ProjectRow & { created_at: string }>(
      `SELECT id, code, name, client_name, state, started_on::text AS started_on,
              handed_over_on::text AS handed_over_on, original_value::text AS original_value,
              created_at::text AS created_at
         FROM projects.projects
        WHERE ($1::text IS NULL OR state = $1)
          AND ($2::text IS NULL OR code ILIKE $2 OR name ILIKE $2 OR client_name ILIKE $2)
          AND ${k.where}
        ORDER BY ${k.orderBy}
        LIMIT $${3 + k.params.length}`,
      [state ?? null, like, ...k.params, page.limit + 1],
    );
    const [counted] = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM projects.projects
        WHERE ($1::text IS NULL OR state = $1)
          AND ($2::text IS NULL OR code ILIKE $2 OR name ILIKE $2 OR client_name ILIKE $2)`,
      [state ?? null, like],
    );
    const paged = finishPage(rows, page, (r) => ({ key: r.created_at, id: r.id }));
    return c.json({
      items: paged.items.map(toProject),
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: counted?.n ?? 0,
    });
  });

  app.post('/', async (c) => {
    const parsed = createProjectInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    // The id is issued here, never accepted from the caller. A client-supplied
    // primary key is a way to collide with, or overwrite, a row that already
    // exists — and under RLS the failure would be a confusing constraint error
    // rather than a refusal.
    const id = randomUUID();
    // `tenant_id` is stamped EXPLICITLY from the resolved context — never from
    // `tenancy.current_tenant_id()` and never as a column DEFAULT (M1/D3).
    // Reading it from session state inside the INSERT is the same mechanism the
    // rule bans: a forgotten stamp could not then fail NOT NULL, and a wrong
    // one could not fail RLS, so a mismatch between the context the handler
    // believes it is in and the row it writes would go unnoticed. Passing it as
    // a bind parameter means the WITH CHECK policy compares the context against
    // a value the handler actually chose.
    const rows = await txOf(c).query<ProjectRow>(
      `INSERT INTO projects.projects
         (tenant_id, id, code, name, client_name, original_value)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, code, name, client_name, state, started_on::text AS started_on,
              handed_over_on::text AS handed_over_on, original_value::text AS original_value`,
      [
        tenantOf(c).tenantId,
        id,
        parsed.data.code,
        parsed.data.name,
        parsed.data.clientName,
        parsed.data.originalValue ?? null,
      ],
    );

    const row = rows[0];
    if (row === undefined) throw new Error('insert returned no row');
    return c.json(toProject(row), 201);
  });

  // --------------------------------------------------------------- leads ----

  /**
   * The pipeline.
   *
   * **The totals are computed here.** `CrmView.js:53` multiplies a float value
   * by a probability in the browser and `:157` divides by 10,000,000 to render
   * crores — money arithmetic in a client, twice over (CRM-02).
   */
  app.get('/leads', async (c) => {
    const tx = txOf(c);
    const page = readPage(c);
    if ('error' in page) return validationFailedRaw(c, 'cursor', page.error);
    const stage = c.req.query('stage');
    if (stage !== undefined && !LEAD_STAGES.includes(stage as (typeof LEAD_STAGES)[number])) {
      return validationFailedRaw(c, 'stage', 'not a lead stage');
    }
    const sort = leadListSort(c);
    if ('error' in sort) return validationFailedRaw(c, 'sort', sort.error);
    const q = c.req.query('q');

    const paged = await listLeads(tx, page, sort, { stage, q });
    // Totals are the WHOLE pipeline under the stage filter, never the window —
    // `q` narrows what is shown, not what the pipeline is worth.
    const totals = pipelineTotals(await listLeadTotalsInput(tx, stage));
    const moments = await salesMoments(tx);
    return c.json({
      items: paged.items.map(toLeadResponse),
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: paged.count,
      totals: {
        openCount: totals.openCount,
        total: toWire(totals.total),
        weighted: toWire(totals.weighted),
        weightedByStage: toWire(totals.weightedByStage),
        winRatePct: totals.winRatePct,
        byStage: totals.byStage.map((s) => ({
          stage: s.stage,
          count: s.count,
          value: toWire(s.value),
          weighted: toWire(s.weighted),
        })),
        wonThisQuarter: {
          since: moments.wonThisQuarter.since,
          count: moments.wonThisQuarter.count,
          value: toWire(moments.wonThisQuarter.value),
        },
        nextSiteVisit: moments.nextSiteVisit,
      },
    });
  });

  /** The pipeline as Today reads it: quotes awaiting a decision, next steps and expected closes this month, the whole open pipeline. */
  app.get('/leads/pipeline-summary', async (c) => {
    return c.json(await readPipelineSummary(txOf(c), todayInIndia(new Date())));
  });

  app.post('/leads', async (c) => {
    const parsed = createLeadInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(toLeadResponse(await createLead(txOf(c), tenantOf(c), parsed.data)), 201);
  });

  app.patch('/leads/:leadId', async (c) => {
    const id = c.req.param('leadId');
    if (!z.uuid().safeParse(id).success) return leadNotFound(c);
    const parsed = updateLeadInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(toLeadResponse(await updateLead(txOf(c), id, parsed.data)));
  });

  /**
   * Mark a lead won against the project it became.
   *
   * The project is created first and named here. `convertLeadToProject`
   * (`crm.js:165`) creates it itself with a `Math.random()` code (CRM-03), and
   * the lead row survives either way — it is the only record of where the work
   * came from.
   */
  app.post('/leads/:leadId/convert', async (c) => {
    const id = c.req.param('leadId');
    if (!z.uuid().safeParse(id).success) return leadNotFound(c);
    const parsed = convertLeadInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(
      toLeadResponse(
        await convertLead(txOf(c), id, parsed.data.projectId, parsed.data.expectedVersion),
      ),
    );
  });

  /**
   * Fold a duplicate into this one.
   *
   * The id in the PATH is the record that SURVIVES. That direction is not
   * arbitrary: the surviving record is the one whose screen the person is
   * looking at, and a merge that quietly keeps the other one is the mistake
   * this ordering makes impossible to describe.
   */
  app.post('/leads/:leadId/merge', async (c) => {
    const id = c.req.param('leadId');
    if (!z.uuid().safeParse(id).success) return leadNotFound(c);
    const parsed = mergeLeadsInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(await mergeLeads(txOf(c), tenantOf(c), id, parsed.data.secondaryId));
  });

  /**
   * Hand this opportunity to delivery.
   *
   * One transaction. The project, the conversion and the record of what was
   * confirmed either all happen or none of them does.
   */
  app.post('/leads/:leadId/handover', async (c) => {
    const id = c.req.param('leadId');
    if (!z.uuid().safeParse(id).success) return leadNotFound(c);
    const parsed = handoverLeadInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(await handOverLead(txOf(c), tenantOf(c), id, parsed.data), 201);
  });

  app.get('/leads/:leadId/merges', async (c) => {
    const id = c.req.param('leadId');
    if (!z.uuid().safeParse(id).success) return leadNotFound(c);
    return c.json({ items: await listLeadMerges(txOf(c), id) });
  });

  app.delete('/leads/:leadId', async (c) => {
    const id = c.req.param('leadId');
    if (!z.uuid().safeParse(id).success) return leadNotFound(c);
    await deleteLead(txOf(c), id);
    return c.body(null, 204);
  });

  // --- what a lead accumulates -------------------------------------------
  //
  // Every one of these is registered before `/:projectId` for the same reason
  // the lead routes are: Hono matches in registration order, and `leads` is a
  // perfectly good `:projectId` as far as the router is concerned.

  app.get('/leads/:leadId/contacts', async (c) => {
    const id = c.req.param('leadId');
    if (!z.uuid().safeParse(id).success) return leadNotFound(c);
    return c.json({ items: await listLeadContacts(txOf(c), id) });
  });

  app.post('/leads/:leadId/contacts', async (c) => {
    const id = c.req.param('leadId');
    if (!z.uuid().safeParse(id).success) return leadNotFound(c);
    const parsed = addLeadContactInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(await addLeadContact(txOf(c), tenantOf(c), id, parsed.data), 201);
  });

  app.delete('/leads/:leadId/contacts/:contactId', async (c) => {
    const contactId = c.req.param('contactId');
    if (!z.uuid().safeParse(contactId).success) return leadNotFound(c);
    await removeLeadContact(txOf(c), contactId);
    return c.body(null, 204);
  });

  app.get('/leads/:leadId/activities', async (c) => {
    const id = c.req.param('leadId');
    if (!z.uuid().safeParse(id).success) return leadNotFound(c);
    return c.json({ items: await listLeadActivities(txOf(c), id) });
  });

  app.post('/leads/:leadId/activities', async (c) => {
    const id = c.req.param('leadId');
    if (!z.uuid().safeParse(id).success) return leadNotFound(c);
    const parsed = recordLeadActivityInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(await recordLeadActivity(txOf(c), tenantOf(c), id, parsed.data), 201);
  });

  app.post('/leads/:leadId/lost', async (c) => {
    const id = c.req.param('leadId');
    if (!z.uuid().safeParse(id).success) return leadNotFound(c);
    const parsed = markLeadLostInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    await markLeadLost(txOf(c), tenantOf(c), id, parsed.data);
    return c.body(null, 204);
  });

  /**
   * Leads sharing this one's client name.
   *
   * Exact and case-insensitive, never a `LIKE '%…%'`. It is shown to a person
   * who looks at both records; nothing in the system links, merges or blocks on
   * the answer.
   */
  app.get('/leads/:leadId/duplicates', async (c) => {
    const id = c.req.param('leadId');
    if (!z.uuid().safeParse(id).success) return leadNotFound(c);
    const lead = await getLead(txOf(c), id);
    return c.json({ items: await possibleDuplicates(txOf(c), lead.clientName, id) });
  });

  // Registered before `/:projectId`, because Hono matches in registration
  // order and a literal segment must be tried before a parameter that would
  // otherwise swallow it — `/leads` is a valid `:projectId` as far as the
  // router is concerned.
  /** Variations with the client for signature, firm-wide or one project's. */
  app.get('/change-orders/unsigned', async (c) => {
    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success) {
      return validationFailedRaw(c, 'projectId', 'projectId must be a uuid');
    }
    return c.json(await unsignedVariations(txOf(c), { projectId }));
  });

  app.get('/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);

    const rows = await txOf(c).query<ProjectRow>(
      `SELECT id, code, name, client_name, state, started_on::text AS started_on,
              handed_over_on::text AS handed_over_on, original_value::text AS original_value
         FROM projects.projects WHERE id = $1`,
      [projectId],
    );
    const row = rows[0];
    // Another tenant's project is NOT FOUND, not FORBIDDEN. A 403 would confirm
    // the id exists somewhere, which is an existence oracle across tenants;
    // RLS has already made the row invisible, and the response must not undo
    // that by being more specific than the policy.
    if (row === undefined) return notFound(c);
    return c.json(toProject(row));
  });

  /**
   * Move a project to its next state. The rule is `domain/project-state.ts`;
   * this route reads the current state under the row lock, refuses a move the
   * rule does not list with CONFLICT that names both states, and stamps the
   * date the move owns. The stamp is `CURRENT_DATE` in the database's clock,
   * set once: a project handed over twice is not a move that exists.
   */
  app.post('/:projectId/state', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);
    const parsed = setProjectStateInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    const tx = txOf(c);
    const current = await tx.query<{ state: string }>(
      `SELECT state FROM projects.projects WHERE id = $1 FOR UPDATE`,
      [projectId],
    );
    const from = current[0]?.state;
    if (from === undefined) return notFound(c);
    if (!projectState.safeParse(from).success) throw new Error(`project ${projectId} holds state ${from}`);
    const to = parsed.data.state;
    if (!canMove(from as ProjectState, to)) {
      return c.json(
        {
          code: 'CONFLICT' as const,
          message: `A project that is ${from.replace(/_/g, ' ')} cannot be moved to ${to.replace(/_/g, ' ')}.`,
          requestId: requestId(c),
        },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    const stamp = dateStampedBy(to);
    const rows = await tx.query<ProjectRow>(
      `UPDATE projects.projects
          SET state = $2,
              started_on = CASE WHEN $3::text = 'started_on' THEN COALESCE(started_on, CURRENT_DATE) ELSE started_on END,
              handed_over_on = CASE WHEN $3::text = 'handed_over_on' THEN COALESCE(handed_over_on, CURRENT_DATE) ELSE handed_over_on END,
              version = version + 1,
              updated_at = now()
        WHERE id = $1
        RETURNING id, code, name, client_name, state, started_on::text AS started_on,
                  handed_over_on::text AS handed_over_on, original_value::text AS original_value`,
      [projectId, to, stamp],
    );
    const row = rows[0];
    if (row === undefined) return notFound(c);
    return c.json(toProject(row));
  });

  app.get('/:projectId/boq', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);

    const tx = txOf(c);
    const exists = await tx.query<{ id: string }>(
      `SELECT id FROM projects.projects WHERE id = $1`,
      [projectId],
    );
    if (exists[0] === undefined) return notFound(c);

    const rows = await tx.query<BoqRow>(
      `SELECT id, section, item_no, description, uom,
              quantity_micros::text AS quantity_micros,
              rate::text AS rate,
              cost_rate::text AS cost_rate,
              version
         FROM projects.boq_items
        WHERE project_id = $1
        ORDER BY section, item_no`,
      [projectId],
    );

    // Every figure below is computed HERE, by the domain, from the stored
    // quantity and rate. The client receives amounts and totals; it never
    // multiplies. ADR-0014: the server computes every monetary figure.
    const lines: BoqLine[] = rows.map((r) => ({
      id: r.id,
      description: r.description,
      uom: r.uom,
      quantity: BigInt(r.quantity_micros),
      rate: fromWire(r.rate),
      ...(r.cost_rate === null ? {} : { costRate: fromWire(r.cost_rate) }),
    }));

    const totals = boqTotals(lines);

    return c.json({
      projectId,
      items: rows.map((r, i) => ({
        id: r.id,
        section: r.section,
        itemNo: r.item_no,
        description: r.description,
        uom: r.uom,
        quantityMicros: r.quantity_micros,
        rate: r.rate,
        costRate: r.cost_rate,
        amount: toWire(lineAmount(lines[i]!)),
        // The caller sends this back as `expectedVersion` on an edit (BOQ-04).
        version: r.version,
      })),
      totals: {
        lineCount: totals.lineCount,
        value: toWire(totals.value),
        cost: totals.cost === null ? null : toWire(totals.cost),
        margin: totals.margin === null ? null : toWire(totals.margin),
      },
    });
  });

  /**
   * Add lines to a BOQ.
   *
   * The body carries quantities and rates. It carries no amount and no total,
   * and there is no field by which it could — `boq.js:114` takes
   * `Number(realPayload.amount)` when the caller sends one, which is a client
   * asserting a line total that need not equal quantity x rate (BOQ-01).
   */
  app.post('/:projectId/boq', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);

    const parsed = addBoqLinesInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    const written = await addBoqLines(txOf(c), tenantOf(c), projectId, parsed.data.lines);
    return c.json({ projectId, items: written.map(writtenLine) }, 201);
  });

  /** Replace one line. The whole line, not a patch — see BOQ-04 on locking. */
  app.patch('/:projectId/boq/:itemId', async (c) => {
    const projectId = c.req.param('projectId');
    const itemId = c.req.param('itemId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);
    if (!z.uuid().safeParse(itemId).success) return notFound(c);

    const parsed = updateBoqLineInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    const line = await updateBoqLine(txOf(c), projectId, itemId, parsed.data);
    return c.json(writtenLine(line));
  });

  /**
   * Remove one line.
   *
   * 404 when the line is not visible, rather than reporting success for a row
   * it did not touch: `deleteBOQItem` (`boq.js:339`) returns `{ ok: true }`
   * whatever happened, so deleting nothing and deleting another tenant's line
   * are indistinguishable to the caller.
   */
  app.delete('/:projectId/boq/:itemId', async (c) => {
    const projectId = c.req.param('projectId');
    const itemId = c.req.param('itemId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);
    if (!z.uuid().safeParse(itemId).success) return notFound(c);

    await deleteBoqLine(txOf(c), projectId, itemId);
    return c.body(null, 204);
  });

  // -------------------------------------------------------- change orders --

  /**
   * A project's variations, and the contract value they add up to.
   *
   * `original` is what was signed and is never overwritten. That figure does
   * not exist in the legacy: `change-orders.js:82` adds each approved variation
   * straight into `client_boqs.contract_value` (CO-02).
   */
  app.get('/:projectId/change-orders', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);

    const tx = txOf(c);
    const budgets = await listProjectBudgets(tx);
    const project = budgets.find((p) => p.id === projectId);
    if (project === undefined) return notFound(c);

    const items = await listChangeOrders(tx, projectId);
    const contract = await derivedContractValue(tx, projectId, project.contractValue);

    return c.json({
      items: items.map(toChangeOrderResponse),
      contract: {
        original: contract.original === null ? null : toWire(contract.original),
        current: contract.current === null ? null : toWire(contract.current),
        approvedVariations: contract.approvedVariations,
        pendingVariations: contract.pendingVariations,
      },
    });
  });

  app.post('/:projectId/change-orders', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);

    const parsed = createChangeOrderInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    if (parsed.data.projectId !== projectId) {
      return validationFailedRaw(c, 'projectId', 'must match the project in the path');
    }

    const created = await createChangeOrder(txOf(c), tenantOf(c), parsed.data);
    return c.json(toChangeOrderResponse(created), 201);
  });

  /** Send a draft to the client. A zero-value variation is refused. */
  app.post('/:projectId/change-orders/:changeOrderId/submit', async (c) => {
    const changeOrderId = c.req.param('changeOrderId');
    if (!z.uuid().safeParse(changeOrderId).success) return notFound(c);

    const parsed = submitChangeOrderInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    const submitted = await submitChangeOrder(txOf(c), changeOrderId, parsed.data.expectedVersion);
    return c.json(toChangeOrderResponse(submitted));
  });

  /**
   * Record the client's decision. Once.
   *
   * The decision is an explicit closed union with a required signatory, and an
   * already-decided variation has no legal transition — which is what stops the
   * legacy's CO-04, where approving twice adds the money twice.
   */
  app.post('/:projectId/change-orders/:changeOrderId/decide', async (c) => {
    const changeOrderId = c.req.param('changeOrderId');
    if (!z.uuid().safeParse(changeOrderId).success) return notFound(c);

    const parsed = decideChangeOrderInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    const decided = await decideChangeOrder(
      txOf(c),
      changeOrderId,
      parsed.data.decision,
      parsed.data.signedBy,
      parsed.data.expectedVersion,
    );
    return c.json(toChangeOrderResponse(decided));
  });
  // ------------------------------------------------------------ drawings --

  app.get('/:projectId/drawings', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);
    return c.json({ items: await listDrawings(txOf(c), projectId) });
  });

  /**
   * Issue a revision.
   *
   * Any active revision of the same drawing number is superseded in the same
   * transaction. The legacy issues the supersede and the insert loose
   * (`change-orders.js:146`, `:152`), so a failure between them leaves two
   * active revisions or none.
   */
  app.post('/:projectId/drawings', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);

    const parsed = issueDrawingInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    if (parsed.data.projectId !== projectId) {
      return validationFailedRaw(c, 'projectId', 'must match the project in the path');
    }
    return c.json(await issueDrawing(txOf(c), tenantOf(c), parsed.data), 201);
  });

  /** Withdraw a drawing. Not a delete — an issued drawing was on site. */
  app.post('/:projectId/drawings/:drawingId/withdraw', async (c) => {
    const id = c.req.param('drawingId');
    if (!z.uuid().safeParse(id).success) return notFound(c);
    return c.json(await withdrawDrawing(txOf(c), id));
  });
  // --------------------------------------------- estimation and takeoff --

  /**
   * Estimation items.
   *
   * The rate is computed from the four factors and stored. There is no rate
   * field on the request, and the response carries a **pre-tax** rate —
   * whether a BOQ rate carries GST is PO-16 and open.
   */
  app.get('/estimation/items', async (c) => {
    const page = readPage(c);
    if ('error' in page) return validationFailedRaw(c, 'cursor', page.error);
    const trade = c.req.query('trade');
    const paged = await listEstimationItems(txOf(c), page, trade);
    return c.json({
      items: paged.items.map(toEstimationResponse),
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: paged.count,
    });
  });

  app.post('/estimation/items', async (c) => {
    const parsed = createEstimationItemInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    const created = await createEstimationItem(txOf(c), tenantOf(c), parsed.data);
    return c.json(toEstimationResponse(created), 201);
  });

  app.delete('/estimation/items/:itemId', async (c) => {
    const id = c.req.param('itemId');
    if (!z.uuid().safeParse(id).success) return notFound(c);
    await deleteEstimationItem(txOf(c), id);
    return c.body(null, 204);
  });

  // -------------------------------------------------------------- takeoff --

  app.get('/:projectId/takeoff', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);
    return c.json({ items: await listSheets(txOf(c), projectId) });
  });

  app.post('/:projectId/takeoff', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);

    const parsed = createTakeoffSheetInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    if (parsed.data.projectId !== projectId) {
      return validationFailedRaw(c, 'projectId', 'must match the project in the path');
    }
    return c.json(await createSheet(txOf(c), tenantOf(c), parsed.data), 201);
  });

  /**
   * Totals for a sheet.
   *
   * Items missing a rate are **named** rather than excluded — a total over the
   * priced subset looks complete and is not.
   */
  app.get('/:projectId/takeoff/:sheetId/summary', async (c) => {
    const sheetId = c.req.param('sheetId');
    if (!z.uuid().safeParse(sheetId).success) return notFound(c);
    return c.json(toSummaryResponse(await summariseSheet(txOf(c), sheetId)));
  });

  /** Items are saved as a set: the sheet is redrawn, not patched. */
  app.put('/:projectId/takeoff/:sheetId/items', async (c) => {
    const sheetId = c.req.param('sheetId');
    if (!z.uuid().safeParse(sheetId).success) return notFound(c);

    const parsed = saveTakeoffItemsInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    const summary = await saveItems(txOf(c), tenantOf(c), sheetId, parsed.data.items);
    return c.json(toSummaryResponse(summary));
  });
  app.onError((error, c) => {
    if (error instanceof ProjectNotFound || error instanceof BoqLineNotFound) return notFound(c);
    if (error instanceof LeadNotFound || error instanceof LeadContactNotFound) {
      return leadNotFound(c);
    }
    // A merge refusal that names a missing opportunity is a 404, and every
    // other one is a 400. "No such opportunity" and "these two cannot be
    // merged" are different answers and a single status for both would make the
    // second read as a broken id.
    if (error instanceof HandoverRefused) {
      if (error.message === 'no such opportunity') return leadNotFound(c);
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: error.message,
          requestId: c.req.header('x-request-id') ?? 'unknown',
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }
    if (error instanceof LeadMergeRefused) {
      if (error.message === 'no such opportunity') return leadNotFound(c);
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: error.message,
          requestId: c.req.header('x-request-id') ?? 'unknown',
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }
    if (error instanceof LeadActivityRefused) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: error.message,
          requestId: c.req.header('x-request-id') ?? 'unknown',
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }
    if (error instanceof ChangeOrderNotFound || error instanceof DrawingNotFound) {
      return notFound(c);
    }
    if (error instanceof EstimationItemNotFound || error instanceof TakeoffNotFound) {
      return notFound(c);
    }
    if (error instanceof ProjectReadOnly) {
      // a project no longer worked refuses the write and says why; the page shows the same banner
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof EstimationConflict || error instanceof TakeoffRefused) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof DrawingRefused) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof ChangeOrderConflict || error instanceof ChangeOrderError) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (
      error instanceof LeadStaleWrite ||
      error instanceof LeadReferentNotFound ||
      error instanceof LeadNotConvertible
    ) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof BoqStaleWrite || error instanceof BoqLineInUse) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof DuplicateBoqLine) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof BoqError) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    throw error;
  });

  return app;
}

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

function notFound(c: Context): Response {
  return c.json(
    {
      code: 'NOT_FOUND' as const,
      message: 'No such project.',
      requestId: requestId(c),
    },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

function validationFailed(c: Context, error: z.ZodError): Response {
  return c.json(
    {
      code: 'VALIDATION_FAILED' as const,
      message: 'Some of the submitted values are not valid.',
      requestId: requestId(c),
      // Field paths only. Echoing the rejected value back is how a client's
      // contract value ends up in a browser console.
      details: error.issues.map((i) => ({ path: i.path.join('.'), reason: i.message })),
    },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

/** Money leaves as digit-only wire strings, never as numbers. */
function writtenLine(l: WrittenLine): Record<string, unknown> {
  return {
    id: l.id,
    section: l.section,
    itemNo: l.itemNo,
    description: l.description,
    uom: l.uom,
    quantityMicros: l.quantityMicros.toString(),
    rate: toWire(l.rate),
    costRate: l.costRate === null ? null : toWire(l.costRate),
    amount: toWire(l.amount),
    version: l.version,
  };
}

function leadNotFound(c: Context): Response {
  return c.json(
    { code: 'NOT_FOUND' as const, message: 'No such lead.', requestId: requestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

/** Money leaves as a digit-only wire string. */
function toLeadResponse(l: Lead): Record<string, unknown> {
  return {
    id: l.id,
    clientName: l.clientName,
    contactName: l.contactName,
    phone: l.phone,
    email: l.email,
    stage: l.stage,
    estimatedValue: toWire(l.estimatedValue),
    probabilityPct: l.probabilityPct,
    projectType: l.projectType,
    source: l.source,
    city: l.city,
    consultant: l.consultant,
    ownerId: l.ownerId,
    expectedClose: l.expectedClose,
    notes: l.notes,
    nextFollowupOn: l.nextFollowupOn,
    nextFollowupKind: l.nextFollowupKind,
    closedOn: l.closedOn,
    lostReason: l.lostReason,
    convertedProjectId: l.convertedProjectId,
    version: l.version,
  };
}

/** Money leaves as a digit-only wire string. */
function toChangeOrderResponse(co: StoredChangeOrder): Record<string, unknown> {
  return {
    id: co.id,
    projectId: co.projectId,
    number: co.number,
    title: co.title,
    description: co.description,
    costImpact: toWire(co.costImpact),
    state: co.state,
    submittedAt: co.submittedAt === null ? null : co.submittedAt.toISOString(),
    decidedBy: co.decidedBy,
    decidedAt: co.decidedAt === null ? null : co.decidedAt.toISOString(),
    version: co.version,
  };
}

function validationFailedRaw(c: Context, path: string, reason: string): Response {
  return c.json(
    {
      code: 'VALIDATION_FAILED' as const,
      message: 'Some of the submitted values are not valid.',
      requestId: requestId(c),
      details: [{ path, reason }],
    },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

/** Money leaves as digit-only wire strings. */
function toEstimationResponse(i: EstimationItem): Record<string, unknown> {
  return {
    id: i.id,
    itemName: i.itemName,
    trade: i.trade,
    uom: i.uom,
    materialCost: toWire(i.materialCost),
    labourCost: toWire(i.labourCost),
    equipmentCost: toWire(i.equipmentCost),
    overheadBp: i.overheadBp,
    marginBp: i.marginBp,
    benchmark: i.benchmark,
    version: i.version,
    // Recomputed from the stored factors on every read, so the figure shown and
    // the figure used cannot disagree — which is EST-02 turned around.
    analysis: {
      directCost: toWire(i.analysis.directCost),
      overhead: toWire(i.analysis.overhead),
      costWithOverhead: toWire(i.analysis.costWithOverhead),
      margin: toWire(i.analysis.margin),
      baseRate: toWire(i.analysis.baseRate),
    },
  };
}

/** Totals leave as wire strings; the unpriced and uncosted items are named. */
function toSummaryResponse(sum: {
  itemCount: number;
  unpricedItems: readonly string[];
  uncostedItems: readonly string[];
  value: bigint | null;
  cost: bigint | null;
}): Record<string, unknown> {
  return {
    itemCount: sum.itemCount,
    unpricedItems: sum.unpricedItems,
    uncostedItems: sum.uncostedItems,
    value: sum.value === null ? null : sum.value.toString(),
    cost: sum.cost === null ? null : sum.cost.toString(),
  };
}
