import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './project-team.js';
import { assertProjectOpen } from './project-guard.js';

/**
 * Workflow 7: delivery milestones.
 *
 * **Verdict: THIN.** Three of the legacy's columns say why, and none of the
 * three is built here — `predecessor_id` is written and never read,
 * `site_readiness_gate` defaults to `'Passed'`, and `is_critical_path` appears
 * in no query. See migration 0076.
 *
 * What is here is planned against actual, a delay that has to carry a reason,
 * and the two-week lookahead — which is small, real, and computed rather than
 * stored.
 */

export class MilestoneRefused extends Error {
  override readonly name = 'MilestoneRefused';
}

export const MILESTONE_STATUSES = ['not_started', 'in_progress', 'delayed', 'complete'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export interface DeliveryMilestone {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly trade: string;
  readonly plannedStart: string;
  readonly plannedFinish: string;
  readonly actualStart: string | null;
  readonly actualFinish: string | null;
  readonly status: MilestoneStatus;
  readonly delayReason: string;
  readonly recoveryPlan: string;
  readonly responsibleParty: string;
  /** Starting inside the next fortnight and not finished. Computed. */
  readonly inLookahead: boolean;
  /** Days late against the planned finish, when it is. Computed, never stored. */
  readonly daysLate: number | null;
}

const COLUMNS = `id, project_id, name, trade,
  planned_start::text AS planned_start, planned_finish::text AS planned_finish,
  actual_start::text AS actual_start, actual_finish::text AS actual_finish,
  status, delay_reason, recovery_plan, responsible_party`;

interface Row extends Record<string, unknown> {
  id: string;
  project_id: string;
  name: string;
  trade: string;
  planned_start: string;
  planned_finish: string;
  actual_start: string | null;
  actual_finish: string | null;
  status: string;
  delay_reason: string;
  recovery_plan: string;
  responsible_party: string;
}

/** Whole days between two `YYYY-MM-DD` dates, at UTC midnight both ends. */
function daysBetween(from: string, to: string): number {
  const a = from.split('-').map((p) => Number(p));
  const b = to.split('-').map((p) => Number(p));
  const start = Date.UTC(a[0] ?? 0, (a[1] ?? 1) - 1, a[2] ?? 1);
  const end = Date.UTC(b[0] ?? 0, (b[1] ?? 1) - 1, b[2] ?? 1);
  return Math.floor((end - start) / 86_400_000);
}

/**
 * Every milestone, with the lookahead and lateness worked out.
 *
 * `at` is a parameter so a test can stand on a chosen day. A rule about time
 * tested only on the day it happens to run is a rule tested once.
 */
export async function listMilestones(
  tx: TxLike,
  projectId: string,
  at: Date = new Date(),
): Promise<readonly DeliveryMilestone[]> {
  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS} FROM projects.delivery_milestones
      WHERE project_id = $1
      ORDER BY planned_start, name`,
    [projectId],
  );

  const today = at.toISOString().slice(0, 10);
  const fortnight = new Date(at.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    trade: row.trade,
    plannedStart: row.planned_start,
    plannedFinish: row.planned_finish,
    actualStart: row.actual_start,
    actualFinish: row.actual_finish,
    status: row.status as MilestoneStatus,
    delayReason: row.delay_reason,
    recoveryPlan: row.recovery_plan,
    responsibleParty: row.responsible_party,
    // Starting within the fortnight and not finished. `getTwoWeekLookahead`
    // ported, as a field rather than a separate endpoint: it is the same rows
    // with one more thing known about them.
    inLookahead: row.status !== 'complete' && row.planned_start <= fortnight,
    // Late against the PLAN. A finished milestone is late by how much it
    // overran; an unfinished one past its date is late by how long it has been.
    daysLate:
      row.actual_finish !== null
        ? Math.max(0, daysBetween(row.planned_finish, row.actual_finish))
        : row.planned_finish < today
          ? daysBetween(row.planned_finish, today)
          : null,
  }));
}

export interface MilestoneInput {
  readonly name: string;
  readonly trade?: string | undefined;
  readonly plannedStart: string;
  readonly plannedFinish: string;
  readonly responsibleParty?: string | undefined;
}

export async function addMilestone(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  input: MilestoneInput,
): Promise<string> {
  await assertProjectOpen(tx, projectId);
  try {
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO projects.delivery_milestones
         (tenant_id, project_id, name, trade, planned_start, planned_finish, responsible_party)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, $7)
       RETURNING id`,
      [
        ctx.tenantId,
        projectId,
        input.name.trim(),
        input.trade ?? '',
        input.plannedStart,
        input.plannedFinish,
        input.responsibleParty ?? '',
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new MilestoneRefused('That milestone was not saved.');
    return id;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') throw new MilestoneRefused('That milestone already exists.');
    if (code === '23514') {
      throw new MilestoneRefused('A milestone cannot finish before it starts.');
    }
    throw error;
  }
}

export interface ProgressInput {
  readonly status: MilestoneStatus;
  readonly actualStart?: string | null | undefined;
  readonly actualFinish?: string | null | undefined;
  readonly delayReason?: string | undefined;
  readonly recoveryPlan?: string | undefined;
}

/**
 * Move a milestone on.
 *
 * **A delay carries a reason**, refused here and by a CHECK constraint. The
 * legacy has a `recordMilestoneDelay` that takes a reason and a recovery plan
 * and a `saveDeliveryMilestone` that can set the same status without either;
 * one function with the rule in it is better than two where only one has it.
 */
export async function recordProgress(
  tx: TxLike,
  milestoneId: string,
  input: ProgressInput,
): Promise<void> {
  if (input.status === 'delayed' && (input.delayReason ?? '').trim() === '') {
    throw new MilestoneRefused(
      'A delayed milestone needs a reason. A flag with nothing beside it tells nobody anything three weeks later.',
    );
  }
  if (input.status === 'complete' && (input.actualFinish ?? null) === null) {
    throw new MilestoneRefused('Say what day it finished.');
  }

  try {
    const rows = await tx.query<{ id: string }>(
      `UPDATE projects.delivery_milestones
          SET status        = $2,
              actual_start  = $3::date,
              actual_finish = $4::date,
              delay_reason  = $5,
              recovery_plan = $6,
              updated_at    = now()
        WHERE id = $1
       RETURNING id`,
      [
        milestoneId,
        input.status,
        input.actualStart ?? null,
        input.actualFinish ?? null,
        input.delayReason ?? '',
        input.recoveryPlan ?? '',
      ],
    );
    if (rows[0] === undefined) throw new MilestoneRefused('no such milestone');
  } catch (error) {
    if ((error as { code?: string }).code === '23514') {
      throw new MilestoneRefused('A milestone cannot finish before it started.');
    }
    throw error;
  }
}
