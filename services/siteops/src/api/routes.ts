import { Hono, type Context } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  HTTP_STATUS,
  createRecceInput,
  raiseSiteIssueInput,
  resolveSiteIssueInput,
  reconcileImprestInput,
  recordMeasurementInput,
  requestImprestInput,
  sanctionImprestInput,
} from '@cog/contracts';
import { toWire } from '@cog/money';
import { finishPage, keyset, readPage, tenantOf, txOf } from '@cog/service-kit';
import { ManpowerError, headcount } from '../domain/manpower.js';
import { WprError, aggregateWeek, assertIssuable, type DailyReport } from '../domain/wpr.js';
import {
  SiteIssueNotFound,
  SiteIssueRefused,
  listSiteIssues,
  raiseSiteIssue,
  resolveSiteIssue,
} from '../application/site-issues.js';
import {
  RecceNotFound,
  RecceRefused,
  createRecce,
  getRecce,
  listRecces,
} from '../application/recce.js';
import {
  ImprestConflict,
  ImprestNotFound,
  MeasurementRefused,
  listImprest,
  listMeasurements,
  reconcileImprest,
  recordMeasurement,
  requestImprest,
  sanctionImprest,
  type Imprest,
} from '../application/site-controls.js';

/**
 * Site operations HTTP surface — daily reports and the weekly aggregate.
 *
 * Mounted by `services/host` behind the tenant middleware. No query carries a
 * `WHERE tenant_id`; the RLS policy applies it.
 *
 * The weekly endpoint is the one that matters. What a weekly report has to get
 * right is not arithmetic but **which days are missing**: a week that silently
 * averages five submitted days as though there were six reads as a slow week,
 * and that figure supports a progress claim to a client. So the aggregate names
 * the missing dates, states its denominator, and refuses to be issued while
 * gaps exist.
 */

type ReportRow = {
  id: string;
  project_id: string;
  report_date: string;
  submitted: boolean;
  notes: string;
  head_count: number | null;
};

type ManpowerRow = {
  daily_report_id: string;
  floor: string;
  trade: string;
  head_count: number;
};

const manpowerInput = z.object({
  floor: z.string().min(1).max(80),
  trade: z.string().min(1).max(80),
  /** Whole and non-negative. `headcount()` refuses anything else (DPR-01). */
  headCount: z.number().int().min(0),
});

const createReportInput = z.object({
  projectId: z.uuid(),
  reportDate: z.iso.date(),
  notes: z.string().max(4000).optional(),
  manpower: z.array(manpowerInput).max(500).optional(),
});

/** Group the manpower rows into the `Floor[]` shape the domain aggregates over. */
function floorsOf(rows: readonly ManpowerRow[], reportId: string) {
  const byFloor = new Map<string, Array<{ trade: string; count: number }>>();
  for (const r of rows) {
    if (r.daily_report_id !== reportId) continue;
    const list = byFloor.get(r.floor) ?? [];
    list.push({ trade: r.trade, count: r.head_count });
    byFloor.set(r.floor, list);
  }
  return [...byFloor.entries()].map(([name, manpower]) => ({ name, manpower }));
}

export function siteopsRoutes(): Hono {
  const app = new Hono();

  app.get('/daily-reports', async (c) => {
    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success) {
      return validationFailed(c, 'projectId must be a uuid');
    }

    const page = readPage(c);
    if ('error' in page) return validationFailed(c, page.error);
    // `date` narrows to one day (a screen asking "who filed today"); `sort`
    // flips the day order. Latest day first by default; two sites reporting
    // the same day tiebreak on id.
    const date = c.req.query('date');
    if (date !== undefined && !z.iso.date().safeParse(date).success) {
      return validationFailed(c, 'date must be an ISO date');
    }
    const sort = c.req.query('sort') ?? 'desc';
    if (sort !== 'asc' && sort !== 'desc') return validationFailed(c, 'sort must be asc or desc');
    const k = keyset(page, 'report_date', 'id', 'date', sort === 'desc', 3);
    const rows = await txOf(c).query<ReportRow>(
      `SELECT id, project_id, report_date::text AS report_date, submitted, notes,
              (SELECT SUM(m.head_count)::int FROM siteops.daily_manpower m
                WHERE m.tenant_id = daily_reports.tenant_id AND m.daily_report_id = daily_reports.id)
                AS head_count
         FROM siteops.daily_reports
        WHERE ($1::uuid IS NULL OR project_id = $1)
          AND ($2::date IS NULL OR report_date = $2)
          AND ${k.where}
        ORDER BY ${k.orderBy}
        LIMIT $${3 + k.params.length}`,
      [projectId ?? null, date ?? null, ...k.params, page.limit + 1],
    );
    const [counted] = await txOf(c).query<{ n: number }>(
      `SELECT count(*)::int AS n FROM siteops.daily_reports
        WHERE ($1::uuid IS NULL OR project_id = $1) AND ($2::date IS NULL OR report_date = $2)`,
      [projectId ?? null, date ?? null],
    );
    const paged = finishPage(rows, page, (r) => ({ key: r.report_date, id: r.id }));

    return c.json({
      items: paged.items.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        reportDate: r.report_date,
        submitted: r.submitted,
        notes: r.notes,
        headCount: r.head_count,
      })),
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: counted?.n ?? 0,
    });
  });

  app.post('/daily-reports', async (c) => {
    const parsed = createReportInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailedFrom(c, parsed.error);

    const ctx = tenantOf(c);
    const tx = txOf(c);
    const id = randomUUID();

    // `tenant_id` is stamped explicitly from the resolved context, never read
    // from session state inside the statement (M1/D3).
    const rows = await tx.query<ReportRow>(
      `INSERT INTO siteops.daily_reports
         (tenant_id, id, project_id, report_date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, project_id, report_date::text AS report_date, submitted, notes,
                 NULL::int AS head_count`,
      [
        ctx.tenantId,
        id,
        parsed.data.projectId,
        parsed.data.reportDate,
        parsed.data.notes ?? '',
        ctx.principal.id,
      ],
    );

    for (const entry of parsed.data.manpower ?? []) {
      // Through `headcount`, which raises on anything that is not a whole
      // non-negative number rather than coercing it. The legacy runs the same
      // value through `parseInt` and accepts a prefix of free text.
      await tx.query(
        `INSERT INTO siteops.daily_manpower
           (tenant_id, id, daily_report_id, floor, trade, head_count)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ctx.tenantId, randomUUID(), id, entry.floor, entry.trade, headcount(entry.headCount)],
      );
    }

    const row = rows[0];
    if (row === undefined) throw new Error('insert returned no row');
    return c.json(
      {
        id: row.id,
        projectId: row.project_id,
        reportDate: row.report_date,
        submitted: row.submitted,
        notes: row.notes,
        // Summed from what was just written, not re-read: the rows are this
        // request's own, and a report with none recorded has no head count.
        headCount:
          (parsed.data.manpower ?? []).length === 0
            ? null
            : (parsed.data.manpower ?? []).reduce((people, entry) => people + entry.headCount, 0),
      },
      201,
    );
  });

  /**
   * The weekly aggregate for a project.
   *
   * Every figure is computed here from the stored daily rows. The response
   * carries `missingDates` and `reportedDays` explicitly, because a weekly
   * average whose denominator is not stated is a number that cannot be checked.
   */
  app.get('/weekly/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return validationFailed(c, 'projectId must be a uuid');

    const weekStart = c.req.query('weekStart') ?? '';
    if (!z.iso.date().safeParse(weekStart).success) {
      return validationFailed(c, 'weekStart must be a date, as YYYY-MM-DD');
    }

    const tx = txOf(c);
    const reports = await tx.query<ReportRow>(
      `SELECT id, project_id, report_date::text AS report_date, submitted, notes
         FROM siteops.daily_reports
        WHERE project_id = $1
          AND report_date >= $2::date
          AND report_date <  $2::date + 7
        ORDER BY report_date`,
      [projectId, weekStart],
    );
    const manpower = await tx.query<ManpowerRow>(
      `SELECT m.daily_report_id, m.floor, m.trade, m.head_count
         FROM siteops.daily_manpower m
         JOIN siteops.daily_reports r
           ON r.tenant_id = m.tenant_id AND r.id = m.daily_report_id
        WHERE r.project_id = $1
          AND r.report_date >= $2::date
          AND r.report_date <  $2::date + 7`,
      [projectId, weekStart],
    );

    const daily: DailyReport[] = reports.map((r) => ({
      date: r.report_date,
      floors: floorsOf(manpower, r.id),
      submitted: r.submitted,
    }));

    // The seven dates the week is EXPECTED to contain. The aggregate is built
    // against this list rather than against whatever rows exist, which is what
    // makes "which day is missing" answerable at all.
    const expected = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(`${weekStart}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });

    const aggregate = aggregateWeek(expected, daily);

    // Issuability is the domain's rule, not a re-derivation of it here. It
    // refuses a week with zero reported days as well as one with gaps.
    let issuable = true;
    try {
      assertIssuable(aggregate);
    } catch {
      issuable = false;
    }

    return c.json({
      projectId,
      weekStart: aggregate.weekStart,
      weekEnd: aggregate.weekEnd,
      reportedDays: aggregate.reportedDays,
      missingDates: aggregate.missingDates,
      personDays: aggregate.personDays,
      personDaysByTrade: Object.fromEntries(aggregate.personDaysByTrade),
      averageOverReportedDays: aggregate.averageOverReportedDays,
      // Whether it may be sent to a client at all. Refused while gaps exist,
      // because a progress claim built on a silently short week is the failure
      // this endpoint is shaped to prevent.
      issuable,
    });
  });

  // --------------------------------------------------------- site controls --

  /** Imprest requests for a project. */
  app.get('/imprest/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFoundImprest(c);
    const page = readPage(c);
    if ('error' in page) return validationFailed(c, page.error);
    const paged = await listImprest(txOf(c), projectId, page);
    return c.json({ ...paged, items: paged.items.map(toImprestResponse) });
  });

  app.post('/imprest', async (c) => {
    const parsed = requestImprestInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailedFrom(c, parsed.error);
    const created = await requestImprest(txOf(c), tenantOf(c), parsed.data);
    return c.json(toImprestResponse(created), 201);
  });

  /**
   * Sanction, possibly for less than was asked.
   *
   * The sanctioner is recorded separately from the requester. Today the same
   * principal may be both — the legacy has no gate at all (IMP-02) — but a
   * separation-of-duties rule needs two columns to read, and a single
   * `approved_by` would make it unwritable.
   */
  app.post('/imprest/:imprestId/sanction', async (c) => {
    const id = c.req.param('imprestId');
    if (!z.uuid().safeParse(id).success) return notFoundImprest(c);
    const parsed = sanctionImprestInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailedFrom(c, parsed.error);

    const updated = await sanctionImprest(
      txOf(c),
      tenantOf(c),
      id,
      parsed.data.amountSanctioned,
      parsed.data.expectedVersion,
    );
    return c.json(toImprestResponse(updated));
  });

  /**
   * Reconcile against what was actually spent.
   *
   * The amount is required and cannot exceed the sanction — a CHECK constraint
   * as well as a branch. `reconcileSiteImprest` (`site-controls.js:72`) marks it
   * reconciled and compares nothing at all (IMP-01).
   */
  app.post('/imprest/:imprestId/reconcile', async (c) => {
    const id = c.req.param('imprestId');
    if (!z.uuid().safeParse(id).success) return notFoundImprest(c);
    const parsed = reconcileImprestInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailedFrom(c, parsed.error);

    const updated = await reconcileImprest(
      txOf(c),
      tenantOf(c),
      id,
      parsed.data.amountReconciled,
      parsed.data.expectedVersion,
    );
    return c.json(toImprestResponse(updated));
  });

  /** Joint measurement records. Append-only — there is no edit and no delete. */
  app.get('/measurements/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFoundImprest(c);
    const page = readPage(c);
    if ('error' in page) return validationFailed(c, page.error);
    return c.json(await listMeasurements(txOf(c), projectId, page));
  });

  app.post('/measurements', async (c) => {
    const parsed = recordMeasurementInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailedFrom(c, parsed.error);
    return c.json(await recordMeasurement(txOf(c), tenantOf(c), parsed.data), 201);
  });

  // ---------------------------------------------------------------- recce --

  /** Site surveys for a project. */
  app.get('/recces/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFoundImprest(c);
    const page = readPage(c);
    if ('error' in page) return validationFailed(c, page.error);
    return c.json(await listRecces(txOf(c), projectId, page));
  });

  app.get('/recce/:recceId', async (c) => {
    const id = c.req.param('recceId');
    if (!z.uuid().safeParse(id).success) return notFoundImprest(c);
    return c.json(await getRecce(txOf(c), id));
  });

  /**
   * Record a survey.
   *
   * Areas arrive as whole units plus millionths and are stored as integers.
   * `conductedBy` is the authenticated principal, not a name from the body.
   */
  app.post('/recces', async (c) => {
    const parsed = createRecceInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailedFrom(c, parsed.error);
    return c.json(await createRecce(txOf(c), tenantOf(c), parsed.data), 201);
  });
  // ------------------------------------------------------------ site issues --

  // `/today` is served by the host (`services/host/src/api/today.ts`): since
  // the grid it names every site, and which projects are sites is projects'
  // to say, which this router may not ask.

  app.get('/issues', async (c) => {
    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success) {
      return validationFailed(c, 'projectId must be a uuid');
    }
    const status = c.req.query('status') ?? 'open';
    if (status !== 'open' && status !== 'resolved' && status !== 'all') {
      return validationFailed(c, 'status must be open, resolved or all');
    }
    const page = readPage(c);
    if ('error' in page) return validationFailed(c, page.error);
    return c.json(
      await listSiteIssues(txOf(c), page, {
        ...(projectId === undefined ? {} : { projectId }),
        status,
      }),
    );
  });

  app.post('/issues', async (c) => {
    const parsed = raiseSiteIssueInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailedFrom(c, parsed.error);
    return c.json(await raiseSiteIssue(txOf(c), tenantOf(c), parsed.data), 201);
  });

  app.post('/issues/:issueId/resolve', async (c) => {
    const issueId = c.req.param('issueId');
    if (!z.uuid().safeParse(issueId).success) return notFoundImprest(c);
    const parsed = resolveSiteIssueInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return validationFailedFrom(c, parsed.error);
    await resolveSiteIssue(txOf(c), tenantOf(c), issueId, parsed.data);
    return c.body(null, 204);
  });

  app.onError((error, c) => {
    if (error instanceof SiteIssueNotFound) return notFoundImprest(c);
    if (error instanceof SiteIssueRefused) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof ImprestNotFound || error instanceof RecceNotFound) {
      return notFoundImprest(c);
    }
    if (error instanceof RecceRefused) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof ImprestConflict || error instanceof MeasurementRefused) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof ManpowerError || error instanceof WprError) {
      return c.json(
        { code: 'VALIDATION_FAILED' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }
    throw error;
  });

  return app;
}

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

function validationFailed(c: Context, message: string): Response {
  return c.json(
    { code: 'VALIDATION_FAILED' as const, message, requestId: requestId(c) },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

function validationFailedFrom(c: Context, error: z.ZodError): Response {
  return c.json(
    {
      code: 'VALIDATION_FAILED' as const,
      message: 'Some of the submitted values are not valid.',
      requestId: requestId(c),
      details: error.issues.map((i) => ({ path: i.path.join('.'), reason: i.message })),
    },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

function notFoundImprest(c: Context): Response {
  return c.json(
    { code: 'NOT_FOUND' as const, message: 'No such record.', requestId: requestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

/** Money leaves as digit-only wire strings. */
function toImprestResponse(i: Imprest): Record<string, unknown> {
  return {
    id: i.id,
    projectId: i.projectId,
    purpose: i.purpose,
    amountRequested: toWire(i.amountRequested),
    amountSanctioned: i.amountSanctioned === null ? null : toWire(i.amountSanctioned),
    amountReconciled: i.amountReconciled === null ? null : toWire(i.amountReconciled),
    status: i.status,
    requestedBy: i.requestedBy,
    sanctionedBy: i.sanctionedBy,
    reconciledBy: i.reconciledBy,
    version: i.version,
  };
}
