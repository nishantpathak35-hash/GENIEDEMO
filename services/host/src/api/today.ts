import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { HTTP_STATUS, moneyPeriod } from '@cog/contracts';
import { financialWindow, isoWeeksEnding, todayInIndia as dayInIndia, txOf } from '@cog/service-kit';
import { peopleOnSiteByWeek, siteToday } from '@cog/siteops';
import { awaitingStage, loadStages } from '@cog/workflow';
import { listPrincipalsOfKind, namedHoldersOfRole, principalNames } from '@cog/identity';
import { connectorPosting, listTaxRates } from '@cog/finance';
import { connectorPresence, getCompanyProfile } from '@cog/tenancy';
import {
  PURCHASE_ORDER_ENTITY_TYPE,
  approvedCommitmentsByProject,
  committedByProject,
  countVendors,
  orderedSoFarByWeek,
  pendingApprovals,
  summariseBlockedApprovals,
  payablesSummary,
  spendByTrade,
  todayInIndia,
  tradeSpendLines,
  type PendingOrder,
} from '@cog/procurement';
import {
  ABSENT_CANDIDATES,
  contractCeilingCandidate,
  indexSeries,
  pipelineOpenedByWeek,
  listBoqCostBudgets,
  listProjectBudgets,
  listTradePackages,
  marginAtRiskSummary,
  loadHealthThreshold,
  orderedSoFar,
  projectCommitmentRows,
  rankToday,
} from '@cog/projects';

/**
 * Today — the first screen's four reads.
 *
 * **Composition, so it lives here.** The hero and the blocked-approvals stat
 * need four services at once: which orders are waiting is procurement's, the
 * stage each one waits at is workflow's, who holds that stage's role is
 * identity's, and which project is closest to its contract ceiling is
 * projects'. No service may import another, and host may not compute — so
 * every figure below is produced by a function in the service that owns it,
 * and this file passes answers between them.
 *
 * ---
 *
 * **`cash against this week's payables` answers `absent`, and that is the
 * honest answer** — it needs a cash position and dated payables, and the
 * payment path is CA-gated and unbuilt; `projects` states exactly which fields
 * are missing (`ABSENT_CANDIDATES`). `margin at risk` is measured: approved
 * orders against each BOQ's derived cost budget, partial where lines are
 * unpriced, absent only where no project has a BOQ at all.
 *
 * `blocked approvals` is fully live, and since 0083 it names people: a chain
 * stage names a ROLE, identity says who holds it and what they are called,
 * and a holder with no name given is shown by address rather than guessed.
 */
function invalid(c: Context, message: string): Response {
  return c.json(
    { code: 'VALIDATION_FAILED' as const, message, requestId: c.req.header('x-request-id') ?? 'unknown' },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

export function todayRoutes(): Hono {
  const app = new Hono();

  /**
   * The queue, resolved across the three services that each hold a piece of
   * it. `projectId` narrows it to one project's orders, for that project's
   * Overview — the same rule over a smaller queue, never a different rule.
   */
  async function blockedApprovals(tx: ReturnType<typeof txOf>, now: Date, projectId?: string) {
    // One transaction, one client, one statement at a time — `pg` queues a
    // second query on a busy client and deprecates the habit.
    const everyOrder = await pendingApprovals(tx);
    const orders = projectId === undefined ? everyOrder : everyOrder.filter((o) => o.projectId === projectId);
    const stages = await loadStages(tx, PURCHASE_ORDER_ENTITY_TYPE);
    const budgets = await listProjectBudgets(tx);
    const codeOf = new Map(budgets.map((p) => [p.id, p.code]));

    const resolve = (order: PendingOrder) => {
      const stage = awaitingStage(stages, order.currentStage);
      return {
        stageName: stage?.name ?? '',
        approverRole: stage?.approverRole ?? '',
        projectCode: order.projectId === null ? null : (codeOf.get(order.projectId) ?? null),
      };
    };
    const summary = summariseBlockedApprovals(orders, resolve, now);

    // Who can clear each role's share, by name. Identity answers per role; a
    // role held by nobody is reported as zero holders rather than dropped,
    // because an order nobody can approve is the most blocked kind.
    const owners = [];
    for (const [role, count] of summary.byRole) {
      const people = await namedHoldersOfRole(tx, role);
      owners.push({ role, count, holders: people.length, people: [...people] });
    }

    return { summary, owners };
  }

  app.get('/today/blocked-approvals', async (c) => {
    const tx = txOf(c);
    const { summary, owners } = await blockedApprovals(tx, new Date());
    // Who raised each, named by identity. `created_by` is text and can hold
    // something that is not a principal id; such a raiser is named by nobody.
    const raisers = await principalNames(
      tx,
      summary.items.map((i) => i.requesterId).filter((r) => /^[0-9a-f-]{36}$/i.test(r)),
    );
    return c.json({
      status: 'present' as const,
      count: summary.count,
      total: summary.total,
      oldestDays: summary.oldestDays,
      owners,
      items: summary.items.map((i) => ({ ...i, raisedBy: raisers.get(i.requesterId) ?? null })),
    });
  });

  /**
   * Margin at risk: approved orders against each BOQ's derived cost budget.
   * Three services' answers, passed between them — projects' budgets and BOQ
   * costs, procurement's approved orders — and projects' rule assembles it.
   */
  app.get('/today/margin-at-risk', async (c) => {
    const tx = txOf(c);
    const budgets = await listProjectBudgets(tx);
    const costBudgets = await listBoqCostBudgets(tx);
    const approved = await approvedCommitmentsByProject(tx);
    return c.json(marginAtRiskSummary(budgets, costBudgets, approved));
  });

  /**
   * Cash against this week's payables (DATA-02). Procurement answers what is
   * due, gross; projects states why the cash side is absent. Host sets one
   * beside the other and computes neither. `?projectId=` narrows the
   * payables to one project's orders, for that project's Overview.
   */
  app.get('/today/cash-against-payables', async (c) => {
    const absent = ABSENT_CANDIDATES.find((a) => a.name === 'cash-shortfall');
    if (absent === undefined) throw new Error('projects declares no cash-shortfall absence');
    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success) {
      return invalid(c, 'projectId must be a uuid');
    }
    const payables = await payablesSummary(txOf(c), todayInIndia(new Date()), { projectId });
    return c.json({
      status: 'present' as const,
      payables,
      cash: { status: 'absent' as const, why: absent.why, missing: absent.missing },
    });
  });

  /**
   * Spend by trade package. Three services' answers, passed between them:
   * procurement's every line of every order raised in the window with its
   * gross and the trade it names, projects' catalogue of trade packages for
   * the name behind each code, and procurement's own rule — the top five and
   * the rest — assembling the panel. Host names the window and computes
   * nothing. `?period=fy|q`, the financial year to date by default.
   */
  app.get('/today/spend-by-trade', async (c) => {
    const period = moneyPeriod.safeParse(c.req.query('period') ?? 'fy');
    if (!period.success) return invalid(c, 'period must be fy or q');
    // `?projectId=` narrows it to one project's orders — the project's report
    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success) return invalid(c, 'projectId must be a uuid');
    const tx = txOf(c);
    const window = financialWindow(dayInIndia(new Date()), period.data);
    const lines = await tradeSpendLines(tx, window, projectId);
    const packages = await listTradePackages(tx);
    const nameOf = new Map(packages.map((p) => [p.code, p.name]));
    return c.json({
      period: window.period,
      label: window.label,
      from: window.from,
      to: window.to,
      ...spendByTrade(lines, (code) => nameOf.get(code) ?? code),
    });
  });

  /**
   * Site today. Which projects are sites — in progress — is projects' to say;
   * what happened on each is siteops'. Served here rather than in siteops'
   * router because siteops may not ask projects which of its reports are a
   * site's. `date` defaults to today in Asia/Kolkata.
   */
  app.get('/siteops/today', async (c) => {
    const date = c.req.query('date') ?? dayInIndia(new Date());
    if (!z.iso.date().safeParse(date).success) return invalid(c, 'date must be an ISO date');
    // `?projectId=` narrows it to that one site — the project's report; a project that is not in progress has no site today
    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success) return invalid(c, 'projectId must be a uuid');
    const tx = txOf(c);
    const projects = await listProjectBudgets(tx);
    const sites = projects
      .filter((p) => p.state === 'in_progress' && (projectId === undefined || p.id === projectId))
      .map((p) => ({ id: p.id, code: p.code }));
    return c.json(await siteToday(tx, date, sites));
  });

  /**
   * The sparklines' series, on one ISO-week grid built here and handed to
   * each service, so the points line up without any service knowing what the
   * others measured. Money series go to projects to be indexed; host touches
   * no figure.
   */
  app.get('/today/weekly', async (c) => {
    const raw = c.req.query('weeks') ?? '8';
    const asked = /^[0-9]{1,2}$/.test(raw) ? Number.parseInt(raw, 10) : 8;
    const weeks = Math.min(Math.max(asked, 2), 26);
    const tx = txOf(c);
    const grid = isoWeeksEnding(new Date(), weeks);
    const ordered = await orderedSoFarByWeek(tx, grid);
    const pipeline = await pipelineOpenedByWeek(tx, grid);
    const people = await peopleOnSiteByWeek(tx, grid);
    return c.json({
      weeks: grid,
      orderedSoFar: { wire: ordered, index: indexSeries(ordered) },
      pipelineOpened: { wire: pipeline, index: indexSeries(pipeline) },
      peopleOnSite: people,
    });
  });

  /**
   * The setup card. Six facts, each read from the service that owns it, none
   * computed here: a profile with a GSTIN and a PAN, a project, a vendor, a
   * second person, a verified tax rate, and a voucher Tally has posted. The
   * Tally step is done when finance has a voucher a connector reported
   * posted; otherwise `tally` says whether an agent has ever called in and
   * how many vouchers wait, so the screen can say "never connected" and
   * "connected, nothing posted yet" as two different things.
   */
  app.get('/today/setup', async (c) => {
    const tx = txOf(c);
    const profile = await getCompanyProfile(tx);
    const projects = await listProjectBudgets(tx);
    const vendorCount = await countVendors(tx);
    const staff = await listPrincipalsOfKind(tx, 'staff');
    const rates = await listTaxRates(tx);
    const posting = await connectorPosting(tx);
    const presence = await connectorPresence(tx);
    const steps = [
      { key: 'company' as const, state: profile.gstin !== null && profile.pan !== null ? ('done' as const) : ('todo' as const) },
      { key: 'projects' as const, state: projects.length > 0 ? ('done' as const) : ('todo' as const) },
      { key: 'vendors' as const, state: vendorCount > 0 ? ('done' as const) : ('todo' as const) },
      { key: 'team' as const, state: staff.length > 1 ? ('done' as const) : ('todo' as const) },
      { key: 'tally' as const, state: posting.postedCount > 0 ? ('done' as const) : ('todo' as const) },
      { key: 'tax' as const, state: rates.some((r) => r.status === 'verified') ? ('done' as const) : ('todo' as const) },
    ];
    const doneCount = steps.filter((s) => s.state === 'done').length;
    const stepCount = steps.length;
    return c.json({
      steps,
      tally: {
        lastPostedAt: posting.lastPostedAt,
        postedCount: posting.postedCount,
        pendingCount: posting.pendingCount,
        lastSeenAt: presence.lastSeenAt,
        instances: presence.instances,
      },
      done: doneCount,
      total: stepCount,
      pct: Math.floor((doneCount * 100) / stepCount),
    });
  });

  /**
   * The hero: whichever candidate `projects` ranks first.
   *
   * Reads everything the stat routes read and hands the lot to `rankToday`.
   * The rule — approvals before a project near its ceiling, ordered-so-far as
   * the fallback — is projects', and this route holds no opinion about it.
   */
  app.get('/today/hero', async (c) => {
    const tx = txOf(c);
    const now = new Date();
    // `?projectId=` is a project's Overview asking the same question of one
    // project: its queue, its ceiling, its orders — ranked by the same rule.
    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success) {
      return invalid(c, 'projectId must be a uuid');
    }
    const { summary, owners } = await blockedApprovals(tx, now, projectId);
    const budgets = await listProjectBudgets(tx);
    const threshold = await loadHealthThreshold(tx);
    const commitments = await committedByProject(tx);

    // Projects joins the two answers, because a project with no orders has
    // committed ZERO and supplying that is holding money.
    const everyRow = projectCommitmentRows(budgets, commitments);
    const rows = projectId === undefined ? everyRow : everyRow.filter((r) => r.id === projectId);

    const blocked =
      summary.count === 0
        ? null
        : {
            kind: 'blocked-approvals' as const,
            count: summary.count,
            total: summary.total,
            oldestDays: summary.oldestDays ?? 0,
            olderThanWeek: summary.olderThanWeek,
            owners,
          };

    return c.json(
      rankToday({
        blocked,
        ceiling: contractCeilingCandidate(rows, threshold),
        ordered: orderedSoFar(rows),
      }),
    );
  });

  return app;
}
