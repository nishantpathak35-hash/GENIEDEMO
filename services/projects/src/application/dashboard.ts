import { fromWire, sum, toWire } from '@cog/money';
import { businessWeek, daysBetween } from '@cog/service-kit';
import type { TxLike } from './project-team.js';
import type { MilestoneStatus } from './delivery-milestones.js';
import { pipelineSummary, type PipelineSummary } from '../domain/pipeline.js';

/**
 * The reads behind Today's and Overview's project panels: the variations a
 * client is sitting on, the pipeline as a director reads it, and the
 * milestones due or slipping this week. Whole-tenant reads, narrowed to one
 * project where the panel is a project's; RLS scopes the tenant.
 */

export interface UnsignedVariation {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly projectId: string;
  readonly projectCode: string;
  readonly clientName: string;
  readonly costImpact: string;
  readonly submittedAt: string | null;
  readonly daysWaiting: number | null;
}

export interface UnsignedVariations {
  readonly count: number;
  readonly total: string;
  readonly items: readonly UnsignedVariation[];
  readonly oldest: UnsignedVariation | null;
}

const UNSIGNED_SHOWN = 20;

/**
 * Every variation with the client for signature, longest-waiting first — a
 * wait is whole days since `submitted_at`, Postgres's count against `now`.
 * A variation sent before 0101 dated the moment has no wait, sorts last,
 * and is never "oldest": a wait nobody dated is not a number.
 */
export async function unsignedVariations(
  tx: TxLike,
  filter: { readonly projectId?: string | undefined } = {},
): Promise<UnsignedVariations> {
  const project = filter.projectId ?? null;
  const rows = await tx.query<{
    id: string;
    number: string;
    title: string;
    project_id: string;
    project_code: string;
    client_name: string;
    cost_impact: string;
    submitted_at: string | null;
    days_waiting: number | null;
  }>(
    `SELECT co.id, co.number, co.title, co.project_id, p.code AS project_code, p.client_name,
            co.cost_impact::text AS cost_impact, co.submitted_at::text AS submitted_at,
            CASE WHEN co.submitted_at IS NULL THEN NULL
                 ELSE GREATEST(0, floor(extract(epoch FROM (now() - co.submitted_at)) / 86400))::int END AS days_waiting
       FROM projects.change_orders co
       JOIN projects.projects p ON p.tenant_id = co.tenant_id AND p.id = co.project_id
      WHERE co.state = 'pending_client'
        AND ($1::uuid IS NULL OR co.project_id = $1::uuid)
      ORDER BY co.submitted_at ASC NULLS LAST, co.number`,
    [project],
  );
  const items = rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    projectId: r.project_id,
    projectCode: r.project_code,
    clientName: r.client_name,
    costImpact: r.cost_impact,
    submittedAt: r.submitted_at === null ? null : new Date(r.submitted_at).toISOString(),
    daysWaiting: r.days_waiting,
  }));
  const first = items[0];
  return {
    count: items.length,
    total: toWire(sum(rows.map((r) => fromWire(r.cost_impact)))),
    items: items.slice(0, UNSIGNED_SHOWN),
    oldest: first === undefined || first.submittedAt === null ? null : first,
  };
}

/** The pipeline as Today reads it, over every lead, for the month of `today`. */
export async function readPipelineSummary(tx: TxLike, today: string): Promise<PipelineSummary> {
  const rows = await tx.query<{
    client_name: string;
    stage: string;
    estimated_value: string;
    next_followup_on: string | null;
    expected_close: string | null;
  }>(
    `SELECT client_name, stage, estimated_value::text AS estimated_value,
            next_followup_on::text AS next_followup_on, expected_close::text AS expected_close
       FROM projects.leads
      WHERE merged_into_id IS NULL
      ORDER BY estimated_value DESC, client_name`,
  );
  return pipelineSummary(
    rows.map((r) => ({
      clientName: r.client_name,
      stage: r.stage,
      value: fromWire(r.estimated_value),
      nextFollowupOn: r.next_followup_on,
      expectedClose: r.expected_close,
    })),
    today.slice(0, 7),
  );
}

export interface MilestoneThisWeek {
  readonly id: string;
  readonly projectId: string;
  readonly projectCode: string;
  readonly name: string;
  readonly trade: string;
  readonly plannedFinish: string;
  readonly status: MilestoneStatus;
  readonly daysLate: number | null;
  readonly delayReason: string;
  readonly dueThisWeek: boolean;
}

export interface MilestonesThisWeek {
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly dueCount: number;
  readonly delayedCount: number;
  readonly items: readonly MilestoneThisWeek[];
}

/**
 * Every milestone planned to finish inside the week that holds `today`
 * (Monday to Sunday), or already `delayed`, by project. `daysLate` is the
 * same count `listMilestones` makes: a finished milestone is late by how much
 * it overran, an unfinished one past its date by how long it has been.
 * Delayed first, most days late first, then by planned finish.
 */
export async function milestonesThisWeek(tx: TxLike, today: string, projectId?: string): Promise<MilestonesThisWeek> {
  const week = businessWeek(today);
  const rows = await tx.query<{
    id: string;
    project_id: string;
    project_code: string;
    name: string;
    trade: string;
    planned_finish: string;
    actual_finish: string | null;
    status: string;
    delay_reason: string;
  }>(
    `SELECT m.id, m.project_id, p.code AS project_code, m.name, m.trade,
            m.planned_finish::text AS planned_finish, m.actual_finish::text AS actual_finish,
            m.status, m.delay_reason
       FROM projects.delivery_milestones m
       JOIN projects.projects p ON p.tenant_id = m.tenant_id AND p.id = m.project_id
      WHERE ((m.planned_finish BETWEEN $1::date AND $2::date) OR m.status = 'delayed')
        AND ($3::uuid IS NULL OR m.project_id = $3::uuid)
      ORDER BY m.planned_finish, p.code, m.name`,
    [week.start, week.end, projectId ?? null],
  );
  const items = rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    projectCode: r.project_code,
    name: r.name,
    trade: r.trade,
    plannedFinish: r.planned_finish,
    status: r.status as MilestoneStatus,
    daysLate:
      r.actual_finish !== null
        ? Math.max(0, daysBetween(r.planned_finish, r.actual_finish))
        : r.planned_finish < today
          ? daysBetween(r.planned_finish, today)
          : null,
    delayReason: r.delay_reason,
    dueThisWeek: r.planned_finish >= week.start && r.planned_finish <= week.end,
  }));
  const rank = (m: MilestoneThisWeek): number => (m.status === 'delayed' ? 0 : 1);
  items.sort((a, b) => rank(a) - rank(b) || (b.daysLate ?? -1) - (a.daysLate ?? -1) || a.plannedFinish.localeCompare(b.plannedFinish));
  return {
    weekStart: week.start,
    weekEnd: week.end,
    dueCount: items.filter((m) => m.dueThisWeek).length,
    delayedCount: items.filter((m) => m.status === 'delayed').length,
    items,
  };
}
