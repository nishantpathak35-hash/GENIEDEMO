import type { TenantContext } from '@cog/contracts';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import type { TxLike } from './site-controls.js';

/**
 * Site issues — what is wrong on site, raised on the day it is noticed and
 * resolved by whoever fixed it (migration 0085).
 *
 * A report said what was done and who was there; a thing that stopped work
 * went into its notes, where nothing could count it. An issue is its own row
 * so it stays open across the reports that follow, and "open site issues" is
 * a count of rows rather than a phrase somebody has to find.
 */

export type SiteIssueSeverity = 'minor' | 'major' | 'blocking';

export interface SiteIssue {
  readonly id: string;
  readonly projectId: string;
  readonly dailyReportId: string | null;
  readonly title: string;
  readonly severity: SiteIssueSeverity;
  readonly raisedOn: string;
  readonly resolvedOn: string | null;
  readonly resolution: string;
}

export class SiteIssueNotFound extends Error {
  override readonly name = 'SiteIssueNotFound';
}

export class SiteIssueRefused extends Error {
  override readonly name = 'SiteIssueRefused';
}

type Row = {
  id: string;
  project_id: string;
  daily_report_id: string | null;
  title: string;
  severity: SiteIssueSeverity;
  raised_on: string;
  resolved_on: string | null;
  resolution: string;
};

const COLUMNS = `id, project_id, daily_report_id, title, severity,
                 raised_on::text AS raised_on, resolved_on::text AS resolved_on, resolution`;

function toIssue(r: Row): SiteIssue {
  return {
    id: r.id,
    projectId: r.project_id,
    dailyReportId: r.daily_report_id,
    title: r.title,
    severity: r.severity,
    raisedOn: r.raised_on,
    resolvedOn: r.resolved_on,
    resolution: r.resolution,
  };
}

/**
 * Issues, newest raised first. `status` is `open` by default because that is
 * the question a site screen asks; `resolved` and `all` exist for the record.
 */
export async function listSiteIssues(
  tx: TxLike,
  page: PageQuery,
  filter: { readonly projectId?: string; readonly status: 'open' | 'resolved' | 'all' },
): Promise<{ items: SiteIssue[]; nextCursor: string | null; prevCursor: string | null; count: number }> {
  const where = `($1::uuid IS NULL OR project_id = $1)
     AND ($2::text = 'all' OR ($2::text = 'open') = (resolved_on IS NULL))`;
  const params = [filter.projectId ?? null, filter.status];
  // The raised day, then the moment it was written, as one sortable text key:
  // two issues raised the same day still order by which came first.
  const key = `(raised_on::text || created_at::text)`;
  const k = keyset(page, key, 'id', 'text', true, 3);
  const rows = await tx.query<Row & { sort_key: string }>(
    `SELECT ${COLUMNS}, ${key} AS sort_key
       FROM siteops.site_issues
      WHERE ${where}
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${3 + k.params.length}`,
    [...params, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM siteops.site_issues WHERE ${where}`,
    params,
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.sort_key, id: r.id }));
  return {
    items: paged.items.map(toIssue),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

/**
 * Raise an issue against a project, optionally from the report of the day.
 * The project and the report are checked by the composite foreign keys, so
 * another tenant's project fails the insert rather than planting a row in it.
 */
export async function raiseSiteIssue(
  tx: TxLike,
  ctx: TenantContext,
  input: {
    readonly projectId: string;
    readonly title: string;
    readonly severity: SiteIssueSeverity;
    readonly raisedOn?: string | undefined;
    readonly dailyReportId?: string | undefined;
  },
): Promise<{ id: string }> {
  try {
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO siteops.site_issues
         (tenant_id, project_id, daily_report_id, title, severity, raised_on, raised_by)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7)
       RETURNING id`,
      [
        ctx.tenantId,
        input.projectId,
        input.dailyReportId ?? null,
        input.title,
        input.severity,
        input.raisedOn ?? null,
        ctx.principal.id,
      ],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('insert returned no row');
    return row;
  } catch (error) {
    // 23503: the project or the report is not this tenant's, or does not exist.
    if ((error as { code?: unknown } | null)?.code === '23503') {
      throw new SiteIssueNotFound('No such project or report.');
    }
    throw error;
  }
}

/** Resolve an open issue. A resolved one is refused rather than re-stamped. */
export async function resolveSiteIssue(
  tx: TxLike,
  ctx: TenantContext,
  issueId: string,
  input: { readonly resolution: string },
): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `UPDATE siteops.site_issues
        SET resolved_on = GREATEST(CURRENT_DATE, raised_on),
            resolved_by = $2,
            resolution = $3,
            updated_at = now()
      WHERE id = $1 AND resolved_on IS NULL
      RETURNING id`,
    [issueId, ctx.principal.id, input.resolution],
  );
  if (rows[0] !== undefined) return;
  const exists = await tx.query<{ id: string }>(`SELECT id FROM siteops.site_issues WHERE id = $1`, [issueId]);
  if (exists[0] === undefined) throw new SiteIssueNotFound('No such site issue.');
  throw new SiteIssueRefused('That issue is already resolved.');
}

/**
 * A site, as the host names it: a project in progress, with the code a
 * director knows it by. Which projects are in progress is projects' to say;
 * siteops answers what happened on each.
 */
export interface Site {
  readonly id: string;
  readonly code: string;
}

export interface SiteToday {
  readonly date: string;
  readonly onSite: number | null;
  readonly sitesReporting: number;
  readonly openIssues: number;
  readonly blockingIssues: number;
  readonly sites: ReadonlyArray<{
    readonly projectId: string;
    readonly code: string;
    readonly reportedToday: boolean;
    readonly lastReportOn: string | null;
  }>;
  readonly sitesTotal: number;
  readonly latestReportOn: string | null;
  readonly sitesReportingOnLatest: number;
  readonly byDay: ReadonlyArray<{ readonly date: string; readonly label: string; readonly onSite: number | null; readonly index: number }>;
  readonly firstBlocking: { readonly title: string; readonly projectCode: string } | null;
}

const DAYS_SHOWN = 7;

/**
 * Today across every site: how many people the day's reports put on site,
 * how many sites reported, and the issues still open. `onSite` is `null`
 * when no report today carries a head count — nobody said nobody was there.
 *
 * Since the grid (19 September 2026) it also says which sites reported and
 * which did not — a site with no report is the first sign of a problem — the
 * latest day anybody reported when nobody has today, the head count for each
 * of the last seven days, and the first issue stopping work, named with its
 * site. `sites` are the projects in progress, from the host; a report on a
 * project that is not a site (handed over, still in design) is counted in the
 * totals as before and listed under no site.
 */
export async function siteToday(tx: TxLike, date: string, sites: readonly Site[] = []): Promise<SiteToday> {
  const [today] = await tx.query<{ on_site: number | null; sites: number }>(
    `SELECT SUM(m.head_count)::int AS on_site, count(DISTINCT r.project_id)::int AS sites
       FROM siteops.daily_reports r
       LEFT JOIN siteops.daily_manpower m ON m.tenant_id = r.tenant_id AND m.daily_report_id = r.id
      WHERE r.report_date = $1::date`,
    [date],
  );
  const [issues] = await tx.query<{ open: number; blocking: number }>(
    `SELECT count(*)::int AS open,
            count(*) FILTER (WHERE severity = 'blocking')::int AS blocking
       FROM siteops.site_issues
      WHERE resolved_on IS NULL`,
  );
  const siteIds = sites.map((s) => s.id);
  const codeOf = new Map(sites.map((s) => [s.id, s.code]));
  const lastBySite = await tx.query<{ project_id: string; last_on: string }>(
    `SELECT project_id, max(report_date)::text AS last_on
       FROM siteops.daily_reports
      WHERE project_id = ANY($1::uuid[]) AND report_date <= $2::date
      GROUP BY project_id`,
    [siteIds, date],
  );
  const lastOf = new Map(lastBySite.map((r) => [r.project_id, r.last_on]));
  const latest = lastBySite.reduce<string | null>((acc, r) => (acc === null || r.last_on > acc ? r.last_on : acc), null);
  const days = await tx.query<{ day: string; on_site: number | null }>(
    `SELECT r.report_date::text AS day, SUM(m.head_count)::int AS on_site
       FROM siteops.daily_reports r
       LEFT JOIN siteops.daily_manpower m ON m.tenant_id = r.tenant_id AND m.daily_report_id = r.id
      WHERE r.project_id = ANY($1::uuid[])
        AND r.report_date > ($2::date - ${String(DAYS_SHOWN)}) AND r.report_date <= $2::date
      GROUP BY r.report_date`,
    [siteIds, date],
  );
  const byDay = headCountByDay(date, new Map(days.map((r) => [r.day, r.on_site])));
  const [blocking] = await tx.query<{ title: string; project_id: string }>(
    `SELECT title, project_id FROM siteops.site_issues
      WHERE resolved_on IS NULL AND severity = 'blocking'
      ORDER BY raised_on, created_at
      LIMIT 1`,
  );
  return {
    date,
    onSite: today?.on_site ?? null,
    sitesReporting: today?.sites ?? 0,
    openIssues: issues?.open ?? 0,
    blockingIssues: issues?.blocking ?? 0,
    sites: sites.map((s) => {
      const last = lastOf.get(s.id) ?? null;
      return { projectId: s.id, code: s.code, reportedToday: last === date, lastReportOn: last };
    }),
    sitesTotal: sites.length,
    latestReportOn: latest,
    sitesReportingOnLatest: latest === null ? 0 : lastBySite.filter((r) => r.last_on === latest).length,
    byDay,
    firstBlocking:
      blocking === undefined ? null : { title: blocking.title, projectCode: codeOf.get(blocking.project_id) ?? '' },
  };
}

const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * The last seven days ending on `date`, oldest first, each with the head
 * count reported that day — `null` for a day with no report, which is not a
 * day nobody was there — and the count as basis points of the week's largest
 * day, for a column chart that draws plain numbers. A head count is a count,
 * not money, so the share is plain arithmetic.
 */
export function headCountByDay(
  date: string,
  countOf: ReadonlyMap<string, number | null>,
): ReadonlyArray<{ readonly date: string; readonly label: string; readonly onSite: number | null; readonly index: number }> {
  const days: Array<{ date: string; label: string; onSite: number | null }> = [];
  for (let back = DAYS_SHOWN - 1; back >= 0; back -= 1) {
    const day = new Date(new Date(`${date}T00:00:00Z`).getTime() - back * 86_400_000).toISOString().slice(0, 10);
    days.push({ date: day, label: DAY_LABEL[new Date(`${day}T00:00:00Z`).getUTCDay()] ?? '', onSite: countOf.get(day) ?? null });
  }
  const peak = Math.max(0, ...days.map((d) => d.onSite ?? 0));
  return days.map((d) => ({
    ...d,
    index: peak === 0 || d.onSite === null || d.onSite <= 0 ? 0 : Math.floor((d.onSite * 10000) / peak),
  }));
}
