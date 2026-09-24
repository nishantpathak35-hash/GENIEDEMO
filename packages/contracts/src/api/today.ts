import { z } from 'zod';
import { paiseWire } from '../money.js';
import { moneyPeriod, payablesSummary } from './money.js';

/**
 * Today — the first screen, and the only one anybody opens without being
 * sent there.
 *
 * **Every figure here is computed by the server and every absence is stated
 * by the server.** The design (`docs/design/04-today.html`) shows a hero — the
 * one thing that needs the director this morning — and three stats. The hero
 * is not a fixed card: the server ranks the candidates and answers with the
 * one that ranks first, so a screen renders whatever came top rather than
 * deciding for itself.
 *
 * Since 19 September 2026 the screen is a grid of panels (`docs/design/04-today.html`),
 * and every panel is a read: the hero, margin at risk, payables this week,
 * the ageing of receivables and payables, unsigned variations, money in and
 * out by month, ordered against contract, milestones this week, site today,
 * the day's tasks, spend by trade package and the pipeline. Where a read has
 * nothing on a tenant it answers empty and the panel says so in product
 * words; `cash by account` alone has no read at all, because the model holds
 * no cash position (HUMAN(ARCH-CASH)), and the panel says that instead of
 * estimating. An `absent` answer names the field or table that is missing,
 * so the screen renders the reason and nobody mistakes the gap for a nought.
 * DASH-01 is the legacy version of that mistake.
 */

/**
 * A stat the model cannot supply. `missing` is the list of fields or tables
 * that would have to exist — in the register of a HUMAN(DATA) marker, so the
 * screen and the backlog say the same thing.
 */
export const absentStat = z.object({
  status: z.literal('absent'),
  /** Why, in the customer's words. */
  why: z.string(),
  /** What the model lacks, as `schema.table.column` or a named surface. */
  missing: z.array(z.string()),
});
export type AbsentStat = z.infer<typeof absentStat>;

/**
 * One purchase order waiting on a decision. `waitingSince` is when it entered
 * the queue; `days` is the server's count, so the screen does not compare
 * dates in the browser. `approverRole` is the role the awaiting stage names —
 * the model assigns a stage to a ROLE, not to a person.
 */
export const blockedApproval = z.object({
  id: z.uuid(),
  number: z.string(),
  gross: paiseWire,
  vendorName: z.string().nullable(),
  projectId: z.uuid().nullable(),
  projectCode: z.string().nullable(),
  waitingSince: z.string(),
  days: z.number().int().min(0),
  stageName: z.string(),
  approverRole: z.string(),
  /** Who raised it, as stored — compared by the screen to the viewer to say "your own order". */
  requesterId: z.string(),
  /** The raiser, named; `null` when the raiser is not a person on file. */
  raisedBy: z.string().nullable(),
  raisedAt: z.string(),
});
export type BlockedApproval = z.infer<typeof blockedApproval>;

/**
 * Who the queue is waiting on. One row per role with a stage awaiting it, how
 * many staff hold that role, and who they are — by the name a colleague
 * would use, or the address when nobody gave one (migration 0083).
 */
export const approvalOwner = z.object({
  role: z.string(),
  /** Orders waiting at a stage this role approves. */
  count: z.number().int().min(0),
  /** Staff principals holding the role. Zero means nobody can clear them. */
  holders: z.number().int().min(0),
  /** The holders, named. As many as `holders`, in a stable order. */
  people: z.array(z.object({ id: z.uuid(), name: z.string() })),
});

export const blockedApprovalsStat = z.object({
  status: z.literal('present'),
  count: z.number().int().min(0),
  /** The gross value held up, summed by the server. `"0"` when nothing waits. */
  total: paiseWire,
  oldestDays: z.number().int().min(0).nullable(),
  owners: z.array(approvalOwner),
  items: z.array(blockedApproval),
});
export type BlockedApprovalsStat = z.infer<typeof blockedApprovalsStat>;

/** Margin at risk — absent until the model holds a cost budget and actuals. */
/**
 * Margin at risk: approved orders against each project's BOQ cost budget —
 * Σ(quantity × cost rate), derived, never typed. `partialProjects` and
 * `unpricedLines` say how many of those budgets are missing lines, which makes
 * their figure an overstatement of risk rather than a complete one. `absent`
 * only when no project has a BOQ.
 */
export const marginAtRiskProject = z.object({
  projectId: z.uuid(),
  code: z.string(),
  status: z.enum(['complete', 'partial']),
  costBudget: paiseWire,
  committedApproved: paiseWire,
  atRisk: paiseWire,
  unpricedLines: z.number().int().min(0),
});
export const marginAtRiskPresent = z.object({
  status: z.literal('present'),
  /** Σ at risk over every project with a BOQ. `"0"` when none is over. */
  total: paiseWire,
  /** Σ cost budget over every project with a BOQ — what the tile's bar sets `total` against. */
  costBudget: paiseWire,
  /** Σ approved orders over the same projects. */
  committedApproved: paiseWire,
  /**
   * The bar: the cost budget's share of budget plus what is past it, 0–100
   * with two decimals, truncated by the server. The remainder is the shortfall.
   */
  coveredPct: z.number().min(0).max(100),
  projectsOver: z.number().int().min(0),
  partialProjects: z.number().int().min(0),
  unpricedLines: z.number().int().min(0),
  /** The projects over their budget, largest first, at most five. */
  items: z.array(marginAtRiskProject),
});
export const marginAtRiskStat = z.discriminatedUnion('status', [marginAtRiskPresent, absentStat]);
export type MarginAtRiskStat = z.infer<typeof marginAtRiskStat>;
/**
 * Cash against this week's payables (DATA-02).
 *
 * The payables side is present: acknowledged, unpaid bills by week, GROSS —
 * never net of TDS. The cash side is absent and says why: where a cash position
 * comes from is HUMAN(ARCH-CASH), and no cash-book is built in its place.
 */
export const cashAgainstPayablesStat = z.object({
  status: z.literal('present'),
  payables: payablesSummary,
  cash: absentStat,
});
export type CashAgainstPayablesStat = z.infer<typeof cashAgainstPayablesStat>;

/**
 * The hero's candidates, each in the shape its own service computed.
 *
 * `rank` is the position the server gave it — 1 is the hero. An `absent`
 * candidate is still listed, with its rank, so the ranking is visibly
 * incomplete rather than quietly narrower than the design's.
 */
export const heroCandidate = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('blocked-approvals'),
    rank: z.number().int().min(1),
    count: z.number().int().min(1),
    total: paiseWire,
    oldestDays: z.number().int().min(0),
    /** How many have waited more than seven days — the server's count. */
    olderThanWeek: z.number().int().min(0),
    owners: z.array(approvalOwner),
  }),
  z.object({
    kind: z.literal('contract-ceiling'),
    rank: z.number().int().min(1),
    projectId: z.uuid(),
    code: z.string(),
    name: z.string(),
    committed: paiseWire,
    contractValue: paiseWire,
    /** Committed as a whole percent of the contract, computed by `projects`. */
    orderedPct: z.number().int().min(0),
    /** The band's edge, from the tenant's threshold. */
    thresholdPct: z.number().int().min(1).max(100),
    /** Past the contract; `orderedPct` is then above 100. */
    over: z.boolean(),
    /** How far past, when `over`. */
    overBy: paiseWire.nullable(),
  }),
  z.object({
    kind: z.literal('ordered-so-far'),
    rank: z.number().int().min(1),
    total: paiseWire,
    orderCount: z.number().int().min(0),
    projectCount: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal('absent'),
    rank: z.number().int().min(1),
    name: z.enum(['cash-shortfall', 'margin-at-risk']),
    why: z.string(),
    missing: z.array(z.string()),
  }),
]);
export type HeroCandidate = z.infer<typeof heroCandidate>;

/**
 * The setup card — "Get set up", six steps, and which are done.
 *
 * Judged by the server from what exists: a company profile with a GSTIN and a
 * PAN, at least one project, at least one vendor, more than one person, a
 * verified tax rate, and a voucher Tally has actually posted. The Tally step
 * used to answer `unknown` because nothing recorded a posting; `tally` below
 * now says when the last one was, when an agent was last seen, and how many
 * vouchers wait — so "never connected", "connected, never posted" and "posted
 * on …" are three different sentences (DATA-05).
 */
export const setupStep = z.object({
  key: z.enum(['company', 'projects', 'vendors', 'team', 'tally', 'tax']),
  state: z.enum(['done', 'todo']),
});
export const tallyPresence = z.object({
  /** The latest `posted_at` on a voucher a connector reported posted. */
  lastPostedAt: z.string().nullable(),
  postedCount: z.number().int().min(0),
  /** Vouchers staged and not yet taken by a connector. */
  pendingCount: z.number().int().min(0),
  /** The latest moment any enabled connector instance called in. */
  lastSeenAt: z.string().nullable(),
  instances: z.number().int().min(0),
});
export type TallyPresence = z.infer<typeof tallyPresence>;
export const todaySetupResponse = z.object({
  steps: z.array(setupStep),
  tally: tallyPresence,
  done: z.number().int().min(0),
  total: z.number().int().min(1),
  /** `done` over `total` as a whole percent, for the progress bar — computed here, drawn there. */
  pct: z.number().int().min(0).max(100),
});
export type TodaySetupResponse = z.infer<typeof todaySetupResponse>;

/**
 * Spend by trade package: every order not cancelled, gross, by the trade its
 * lines name, over the financial year or the quarter to date (an order's
 * date is when it was raised). The top five and the rest as one, each with
 * its share on the bar. Lines that name no trade are "Unassigned" — an
 * honest absence, never folded into a trade.
 */
export const spendByTradeItem = z.object({
  /** `null` for the lines that name no trade. */
  tradeCode: z.string().nullable(),
  /** The trade package's name; the code itself when the catalogue has no such package. */
  label: z.string(),
  gross: paiseWire,
  /** Share of `total`, 0–100 with two decimals, truncated. */
  pct: z.number().min(0).max(100),
});
export const spendByTradeResponse = z.object({
  period: moneyPeriod,
  label: z.string(),
  from: z.string(),
  to: z.string(),
  total: paiseWire,
  /** Largest first, at most five. */
  items: z.array(spendByTradeItem),
  /** Everything past the fifth, as one; `count` is how many trades it folds. */
  rest: z.object({ count: z.number().int().min(0), gross: paiseWire, pct: z.number().min(0).max(100) }),
});
export type SpendByTradeItem = z.infer<typeof spendByTradeItem>;
export type SpendByTradeResponse = z.infer<typeof spendByTradeResponse>;

export const todayHeroResponse = z.object({
  /** Whichever ranked first. Never an `absent` candidate. */
  hero: heroCandidate,
  candidates: z.array(heroCandidate),
});
export type TodayHeroResponse = z.infer<typeof todayHeroResponse>;

/**
 * Eight (or `?weeks=`) ISO weeks of the three series a sparkline draws.
 *
 * Money series carry both the figures (`wire`, digit-string paise per week)
 * and an `index` — each week as basis points of the series' largest week —
 * because a sparkline draws plain numbers and is never handed money.
 * `orderedSoFar` is cumulative: the last point is today's committed total.
 * `pipelineOpened` is what new leads were worth, week by week. `peopleOnSite`
 * is the average head count on reporting days; `null` for a week nobody
 * reported, which is not a week nobody was there.
 */
export const weeklySeriesResponse = z.object({
  weeks: z.array(z.object({ isoWeek: z.string(), start: z.iso.date(), end: z.iso.date() })),
  orderedSoFar: z.object({ wire: z.array(paiseWire), index: z.array(z.number().int().min(0).max(10000)) }),
  pipelineOpened: z.object({ wire: z.array(paiseWire), index: z.array(z.number().int().min(0).max(10000)) }),
  peopleOnSite: z.array(z.number().int().min(0).nullable()),
});
export type WeeklySeriesResponse = z.infer<typeof weeklySeriesResponse>;
