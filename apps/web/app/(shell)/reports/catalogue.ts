import { API_ROUTES, type ApiClient, type ApiError } from '@cog/contracts';
import { WORDS, load, type Terms } from '@cog/design-system';

/**
 * The Reports Center's first set — exactly the nine reads the panels already
 * own (`docs/design/11-settings.html`, "Reports"; the brief's own rule: a
 * report is "a number this product shows on a card somewhere"). Nothing here
 * computes: each report runs its read with the read's own parameters, the
 * period and the project, and lays the server's rows out as a table. The
 * catalogue is not inferred beyond the nine; the design's other names are
 * recorded, not built.
 *
 * One cell is either text or a money wire — the page prints the wire with
 * `MoneyExact`, the CSV with `rupees`, and nobody does arithmetic on it.
 */
export type ReportKey =
  | 'receivablesAgeing'
  | 'payablesAgeing'
  | 'moneyByMonth'
  | 'spendByTrade'
  | 'projectRollup'
  | 'unsignedVariations'
  | 'milestonesThisWeek'
  | 'siteToday'
  | 'pipelineSummary';

export type ReportGroup = 'Money' | 'Buying' | 'Projects' | 'Site' | 'Sales';

export type Cell = { readonly text: string; readonly money?: undefined } | { readonly money: string; readonly text?: undefined };

export interface ReportColumn {
  readonly label: string;
  readonly num?: boolean;
}

export interface ReportRun {
  /** One line under the title: the window, the count, what the rows are. */
  readonly summary: string;
  readonly columns: readonly ReportColumn[];
  readonly rows: ReadonlyArray<readonly Cell[]>;
}

export type Period = 'fy' | 'q';

export interface ReportArgs {
  readonly period: Period;
  readonly projectId: string | null;
}

export interface Report {
  readonly key: ReportKey;
  readonly group: ReportGroup;
  readonly name: (t: Terms) => string;
  readonly what: (t: Terms) => string;
  /** Which of the read's own parameters this report takes. */
  readonly params: ReadonlyArray<'period' | 'project'>;
  /** False for a read that has no project view — leads are not a project's. */
  readonly narrows: boolean;
  readonly run: (client: ApiClient, args: ReportArgs, t: Terms) => Promise<RunResult>;
}

export type RunResult =
  | { readonly kind: 'ok'; readonly run: ReportRun }
  | { readonly kind: 'refused'; readonly error: ApiError }
  | { readonly kind: 'unreachable' };

const text = (s: string | number | null | undefined): Cell => ({ text: s === null || s === undefined ? '' : String(s) });
const money = (wire: string | null | undefined): Cell => (wire === null || wire === undefined ? { text: '' } : { money: wire });
const project = (args: ReportArgs): Record<string, string> => (args.projectId === null ? {} : { projectId: args.projectId });

function notOk(r: { kind: 'refused'; error: ApiError } | { kind: 'unreachable' }): RunResult {
  return r.kind === 'unreachable' ? { kind: 'unreachable' } : { kind: 'refused', error: r.error };
}

export const REPORTS: readonly Report[] = [
  {
    key: 'receivablesAgeing',
    group: 'Money',
    name: () => 'Receivables ageing',
    what: () => 'What each client owes, by how long it has been owed',
    params: ['project'],
    narrows: true,
    async run(client, args) {
      const r = await load(client, API_ROUTES.receivablesAgeing, { query: project(args) });
      if (r.kind !== 'ok') return notOk(r);
      const b = r.data.buckets;
      const rows = [
        ['Not yet due', b.current],
        ['1 to 30 days', b.days1to30],
        ['31 to 60 days', b.days31to60],
        ['Over 60 days', b.over60],
        ['Overdue, all', r.data.overdue],
      ].map(([label, bucket]) => [text(label as string), text((bucket as { count: number }).count), money((bucket as { total: string }).total), text(`${String((bucket as { pct: number }).pct)}%`)]);
      return {
        kind: 'ok',
        run: {
          summary: `${String(r.data.openCount)} open ${r.data.openCount === 1 ? 'invoice' : 'invoices'} on ${r.data.today}`,
          columns: [{ label: 'Age' }, { label: 'Invoices', num: true }, { label: 'Owed', num: true }, { label: 'Share', num: true }],
          rows,
        },
      };
    },
  },
  {
    key: 'payablesAgeing',
    group: 'Money',
    name: (t) => `Payables ageing`,
    what: (t) => `What is owed to each ${t.vendorLower}, by age`,
    params: ['project'],
    narrows: true,
    async run(client, args) {
      const r = await load(client, API_ROUTES.payablesAgeing, { query: project(args) });
      if (r.kind !== 'ok') return notOk(r);
      const b = r.data.buckets;
      const rows = [
        ['Not yet due', b.current],
        ['1 to 30 days', b.days1to30],
        ['31 to 60 days', b.days31to60],
        ['Over 60 days', b.over60],
        ['Overdue, all', r.data.overdue],
      ].map(([label, bucket]) => [text(label as string), text((bucket as { count: number }).count), money((bucket as { total: string }).total), text(`${String((bucket as { pct: number }).pct)}%`)]);
      rows.push([text('Waiting to be checked'), text(r.data.toAcknowledge.count), money(r.data.toAcknowledge.total), text('')]);
      return {
        kind: 'ok',
        run: {
          summary: `${String(r.data.openCount)} open ${r.data.openCount === 1 ? 'bill' : 'bills'} on ${r.data.today}`,
          columns: [{ label: 'Age' }, { label: 'Bills', num: true }, { label: 'Owed', num: true }, { label: 'Share', num: true }],
          rows,
        },
      };
    },
  },
  {
    key: 'moneyByMonth',
    group: 'Money',
    name: () => 'Money in and out',
    what: () => 'Collected and paid out, by month',
    params: ['period', 'project'],
    narrows: true,
    async run(client, args) {
      const r = await load(client, API_ROUTES.moneyByMonth, { query: { period: args.period, ...project(args) } });
      if (r.kind !== 'ok') return notOk(r);
      return {
        kind: 'ok',
        run: {
          summary: `${r.data.label} · ${r.data.from} to ${r.data.to}`,
          columns: [{ label: 'Month' }, { label: 'Collected', num: true }, { label: 'Paid out', num: true }],
          rows: r.data.months.map((m) => [text(m.label), money(m.collected), money(m.paidOut)]),
        },
      };
    },
  },
  {
    key: 'spendByTrade',
    group: 'Buying',
    name: () => 'Spend by trade package',
    what: () => 'Every order not cancelled, by the trade its lines name',
    params: ['period', 'project'],
    narrows: true,
    async run(client, args) {
      const r = await load(client, API_ROUTES.spendByTrade, { query: { period: args.period, ...project(args) } });
      if (r.kind !== 'ok') return notOk(r);
      const rows = r.data.items.map((i) => [text(i.label), money(i.gross), text(`${String(i.pct)}%`)]);
      if (r.data.rest.count > 0) rows.push([text(`${String(r.data.rest.count)} more trades`), money(r.data.rest.gross), text(`${String(r.data.rest.pct)}%`)]);
      rows.push([text(WORDS.total), money(r.data.total), text('')]);
      return {
        kind: 'ok',
        run: {
          summary: `${r.data.label} · ${r.data.from} to ${r.data.to}`,
          columns: [{ label: 'Trade' }, { label: WORDS.total, num: true }, { label: 'Share', num: true }],
          rows,
        },
      };
    },
  },
  {
    key: 'projectRollup',
    group: 'Projects',
    name: () => 'Contract against ordered against billed',
    what: () => 'Every project’s three numbers on one page',
    params: ['project'],
    narrows: true,
    async run(client, args) {
      const r = await load(client, API_ROUTES.projectRollup, { query: args.projectId === null ? {} : { ids: args.projectId } });
      if (r.kind !== 'ok') return notOk(r);
      return {
        kind: 'ok',
        run: {
          summary: `${String(r.data.count)} ${r.data.count === 1 ? 'project' : 'projects'} · ${WORDS.orderedSoFar.toLowerCase()} across them`,
          columns: [{ label: 'Project' }, { label: 'State' }, { label: WORDS.contract, num: true }, { label: WORDS.orderedSoFar, num: true }, { label: 'Billed', num: true }, { label: 'Health' }],
          rows: r.data.items.map((p) => [text(`${p.code} · ${p.name}`), text(p.state.replace(/_/g, ' ')), money(p.contractValue), money(p.committed), money(p.billed), text(p.health.replace(/-/g, ' '))]),
        },
      };
    },
  },
  {
    key: 'unsignedVariations',
    group: 'Projects',
    name: (t) => t.unsignedVariations,
    what: (t) => `${t.variations} sent to a client and not yet signed off`,
    params: ['project'],
    narrows: true,
    async run(client, args) {
      const r = await load(client, API_ROUTES.unsignedVariations, { query: project(args) });
      if (r.kind !== 'ok') return notOk(r);
      return {
        kind: 'ok',
        run: {
          summary: `${String(r.data.count)} waiting for a signature`,
          columns: [{ label: 'Number' }, { label: 'Title' }, { label: 'Project' }, { label: 'Client' }, { label: 'Cost impact', num: true }, { label: 'Waiting', num: true }],
          rows: r.data.items.map((v) => [text(v.number), text(v.title), text(v.projectCode), text(v.clientName), money(v.costImpact), text(v.daysWaiting === null ? '' : `${String(v.daysWaiting)} days`)]),
        },
      };
    },
  },
  {
    key: 'milestonesThisWeek',
    group: 'Projects',
    name: () => 'Milestones this week',
    what: () => 'Due this week or already delayed, by project',
    params: ['project'],
    narrows: true,
    async run(client, args) {
      const r = await load(client, API_ROUTES.milestonesThisWeek, { query: project(args) });
      if (r.kind !== 'ok') return notOk(r);
      return {
        kind: 'ok',
        run: {
          summary: `${r.data.weekStart} to ${r.data.weekEnd} · ${String(r.data.dueCount)} due · ${String(r.data.delayedCount)} delayed`,
          columns: [{ label: 'Milestone' }, { label: 'Project' }, { label: 'Trade' }, { label: 'Planned finish' }, { label: 'Status' }, { label: 'Late by', num: true }],
          rows: r.data.items.map((m) => [text(m.name), text(m.projectCode), text(m.trade), text(m.plannedFinish), text(m.status.replace(/_/g, ' ')), text(m.daysLate === null ? '' : `${String(m.daysLate)} days`)]),
        },
      };
    },
  },
  {
    key: 'siteToday',
    group: 'Site',
    name: () => 'Site today',
    what: (t) => `Which sites filed a ${t.dailyReportLower} today, and which did not`,
    params: ['project'],
    narrows: true,
    async run(client, args) {
      const r = await load(client, API_ROUTES.siteToday, { query: project(args) });
      if (r.kind !== 'ok') return notOk(r);
      return {
        kind: 'ok',
        run: {
          summary: `${r.data.date} · ${String(r.data.sitesReporting)} of ${String(r.data.sitesTotal)} sites reported · ${String(r.data.openIssues)} open ${r.data.openIssues === 1 ? 'issue' : 'issues'}`,
          columns: [{ label: 'Site' }, { label: 'Reported today' }, { label: 'Last report' }],
          rows: r.data.sites.map((s) => [text(s.code), text(s.reportedToday ? 'Yes' : 'No'), text(s.lastReportOn ?? 'never')]),
        },
      };
    },
  },
  {
    key: 'pipelineSummary',
    group: 'Sales',
    name: () => 'Pipeline',
    what: () => 'Leads by what happens this month, and their value',
    params: [],
    narrows: false,
    async run(client) {
      const r = await load(client, API_ROUTES.pipelineSummary, {});
      if (r.kind !== 'ok') return notOk(r);
      const slice = (label: string, s: { count: number; total: string; names: string[] }) => [text(label), text(s.count), money(s.total), text(s.names.join(' · '))];
      return {
        kind: 'ok',
        run: {
          summary: `${r.data.month} · ${String(r.data.open.count)} open ${r.data.open.count === 1 ? 'lead' : 'leads'}`,
          columns: [{ label: 'Slice' }, { label: 'Leads', num: true }, { label: 'Value', num: true }, { label: 'Which' }],
          rows: [slice('Quoted', r.data.quoted), slice('Next step this month', r.data.nextStepThisMonth), slice('Closing this month', r.data.closingThisMonth), slice('Open', r.data.open)],
        },
      };
    },
  },
];

export const REPORT_GROUPS: readonly ReportGroup[] = ['Money', 'Buying', 'Projects', 'Site', 'Sales'];

export function reportOf(key: string | null | undefined): Report | null {
  return REPORTS.find((r) => r.key === key) ?? null;
}

/** The export list's name for a report: `report-<key>`, on the existing export path. */
export const exportListOf = (key: ReportKey): string => `report-${key}`;
