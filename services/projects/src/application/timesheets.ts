import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './project-team.js';

/**
 * Workflow 10: hours booked against a job.
 *
 * **Verdict: THIN.** `logDesignTimesheet:1444` checks that hours are above zero
 * and writes a row keyed by an email string; `getTeamDesignWorkload:1481` then
 * filters with `WHERE role IN (…) OR is_active = 1`, where the `OR` makes the
 * role filter inert and the "design team workload" is the whole company's.
 *
 * Built anyway, because hours booked against a job is a real thing people
 * record. Two things are different: the person is a **principal**, and the
 * duration is **whole minutes** rather than float hours.
 */

export class TimesheetRefused extends Error {
  override readonly name = 'TimesheetRefused';
}

/**
 * Minutes, as somebody reads them.
 *
 * **Computed on the server**, because the app is not allowed to. `Math.*` is
 * banned in `apps/` outright — the rule exists because the legacy rounded TDS
 * in a browser — and the ban has no carve-out for "but this one is only
 * minutes". Sending the string is the right shape anyway: the server computes
 * and the app displays.
 */
function asDuration(minutes: number): string {
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (whole === 0) return `${String(rest)}m`;
  return rest === 0 ? `${String(whole)}h` : `${String(whole)}h ${String(rest)}m`;
}

export interface TimesheetEntry {
  readonly id: string;
  readonly principalId: string;
  readonly principalEmail: string;
  readonly workDate: string;
  readonly minutes: number;
  /** The same figure, ready to print. See `asDuration`. */
  readonly duration: string;
  readonly stage: string;
  readonly deliverableId: string | null;
  readonly description: string;
  readonly additionalService: boolean;
}

export interface TimesheetSummary {
  readonly principalId: string;
  readonly principalEmail: string;
  readonly minutes: number;
  readonly duration: string;
  readonly additionalMinutes: number;
  readonly additionalDuration: string;
}

export interface TimesheetView {
  readonly entries: readonly TimesheetEntry[];
  /** Per person, on this project only. */
  readonly byPerson: readonly TimesheetSummary[];
  readonly totalMinutes: number;
  readonly totalDuration: string;
}

export async function timesheets(tx: TxLike, projectId: string): Promise<TimesheetView> {
  const rows = await tx.query<{
    id: string;
    principal_id: string;
    principal_email: string;
    work_date: string;
    minutes: number;
    stage: string;
    deliverable_id: string | null;
    description: string;
    additional_service: boolean;
  }>(
    `SELECT t.id, t.principal_id, p.email AS principal_email,
            t.work_date::text AS work_date, t.minutes, t.stage, t.deliverable_id,
            t.description, t.additional_service
       FROM projects.design_timesheets t
       JOIN identity.principals p ON p.tenant_id = t.tenant_id AND p.id = t.principal_id
      WHERE t.project_id = $1
      ORDER BY t.work_date DESC, p.email`,
    [projectId],
  );

  const entries = rows.map((r) => ({
    id: r.id,
    principalId: r.principal_id,
    principalEmail: r.principal_email,
    workDate: r.work_date,
    minutes: r.minutes,
    duration: asDuration(r.minutes),
    stage: r.stage,
    deliverableId: r.deliverable_id,
    description: r.description,
    additionalService: r.additional_service,
  }));

  // Summed here rather than in SQL so the numbers on the screen and the numbers
  // in the list cannot come from two different queries and disagree.
  const totals = new Map<string, { email: string; minutes: number; additional: number }>();
  for (const entry of entries) {
    const found = totals.get(entry.principalId);
    totals.set(entry.principalId, {
      email: entry.principalEmail,
      minutes: (found?.minutes ?? 0) + entry.minutes,
      additional: (found?.additional ?? 0) + (entry.additionalService ? entry.minutes : 0),
    });
  }

  const byPerson: TimesheetSummary[] = [...totals.entries()]
    .map(([principalId, total]) => ({
      principalId,
      principalEmail: total.email,
      minutes: total.minutes,
      duration: asDuration(total.minutes),
      additionalMinutes: total.additional,
      additionalDuration: asDuration(total.additional),
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);

  return { entries, byPerson, totalMinutes, totalDuration: asDuration(totalMinutes) };
}

export interface TimesheetInput {
  readonly workDate: string;
  readonly minutes: number;
  readonly stage?: string | undefined;
  readonly deliverableId?: string | null | undefined;
  readonly description?: string | undefined;
  readonly additionalService?: boolean | undefined;
}

/**
 * Book time.
 *
 * **Against the CALLING principal, always.** There is no field for whose time
 * it is: booking somebody else's hours is either a mistake or a thing that
 * needs its own control, and the legacy accepts `payload.userEmail` as a
 * fallback, so anybody can book anybody's time by name.
 */
export async function bookTime(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  input: TimesheetInput,
): Promise<string> {
  try {
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO projects.design_timesheets
         (tenant_id, project_id, principal_id, work_date, minutes, stage,
          deliverable_id, description, additional_service)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        ctx.tenantId,
        projectId,
        ctx.principal.id,
        input.workDate,
        input.minutes,
        input.stage ?? '',
        input.deliverableId ?? null,
        input.description ?? '',
        input.additionalService ?? false,
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new TimesheetRefused('That entry was not saved.');
    return id;
  } catch (error) {
    if ((error as { code?: string }).code === '23514') {
      throw new TimesheetRefused(
        'Time booked has to be more than nothing and less than sixteen hours in one go.',
      );
    }
    throw error;
  }
}
