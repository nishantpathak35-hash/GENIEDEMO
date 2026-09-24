import type { TxLike } from './project-team.js';

/**
 * Workflow 5: procurement planning, and the one rule inside it.
 *
 * **Verdict: THIN, with one real rule.** `getProcurementPlan:1100` is two
 * SELECTs joined by project name and returned untouched — a list, not a plan,
 * and there is no table here for it because there is nothing to store.
 *
 * `detectLeadTimeConflicts:1119-1159` is the real part, and it is ported: an
 * item whose lead time is longer than the days remaining to the target
 * completion date cannot arrive in time, and that is worth knowing on the day
 * the item is chosen rather than on the day it does not turn up.
 *
 * **One thing about it is NOT ported.** The legacy falls back to the last
 * milestone's planned finish when the brief has no target completion date
 * (`:1132`), so a project with no brief measures itself against its own last
 * milestone and can never be late. Here a project with no target date has no
 * conflicts to report and says so, which is the difference between "nothing is
 * late" and "there is nothing to be late against".
 */

export interface LeadTimeConflict {
  readonly selectionId: string;
  readonly roomLabel: string;
  readonly itemName: string;
  readonly leadTimeWeeks: number;
  readonly daysAvailable: number;
  readonly daysShort: number;
  /** Whether the client has approved it. An unapproved item can still change. */
  readonly isFrozen: boolean;
}

export interface ProcurementPlan {
  /** The date everything is measured against, or null when nobody has set one. */
  readonly targetCompletionDate: string | null;
  readonly conflicts: readonly LeadTimeConflict[];
  /** Items with a lead time, longest first, whether or not they conflict. */
  readonly longLead: readonly {
    readonly selectionId: string;
    readonly roomLabel: string;
    readonly itemName: string;
    readonly leadTimeWeeks: number;
    readonly status: string;
  }[];
}

/**
 * What has to be ordered, and what is already too late.
 *
 * `at` is a parameter with a default rather than a hidden `new Date()`, so a
 * test can stand on a particular day. A rule about time that cannot be tested
 * on a chosen day is a rule tested only on the day somebody happened to run it.
 */
export async function procurementPlan(
  tx: TxLike,
  projectId: string,
  at: Date = new Date(),
): Promise<ProcurementPlan> {
  const briefs = await tx.query<{ target_completion_date: string | null }>(
    `SELECT target_completion_date::text AS target_completion_date
       FROM projects.client_briefs
      WHERE project_id = $1 AND status <> 'superseded'
      ORDER BY version DESC
      LIMIT 1`,
    [projectId],
  );
  const target = briefs[0]?.target_completion_date ?? null;

  const selections = await tx.query<{
    id: string;
    room_label: string;
    item_name: string;
    lead_time_weeks: number;
    status: string;
    is_frozen: boolean;
  }>(
    `SELECT id, room_label, item_name, lead_time_weeks, status, is_frozen
       FROM projects.room_selections
      WHERE project_id = $1
        AND lead_time_weeks IS NOT NULL
        AND lead_time_weeks > 0
      ORDER BY lead_time_weeks DESC, item_name`,
    [projectId],
  );

  const longLead = selections.map((s) => ({
    selectionId: s.id,
    roomLabel: s.room_label,
    itemName: s.item_name,
    leadTimeWeeks: s.lead_time_weeks,
    status: s.status,
  }));

  // No target date means nothing to be late against. Reporting zero conflicts
  // here is honest; the screen says which of the two situations it is.
  if (target === null) return { targetCompletionDate: null, conflicts: [], longLead };

  // Whole days between two calendar dates, both taken at UTC midnight so a
  // clock time cannot make the answer differ by one.
  const today = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const parts = target.split('-').map((p) => Number(p));
  const targetDay = Date.UTC(parts[0] ?? 0, (parts[1] ?? 1) - 1, parts[2] ?? 1);
  const daysAvailable = Math.floor((targetDay - today) / 86_400_000);

  const conflicts: LeadTimeConflict[] = [];
  for (const s of selections) {
    const leadDays = s.lead_time_weeks * 7;
    if (leadDays > daysAvailable) {
      conflicts.push({
        selectionId: s.id,
        roomLabel: s.room_label,
        itemName: s.item_name,
        leadTimeWeeks: s.lead_time_weeks,
        // A target date already past is reported as zero days available rather
        // than a negative number: the shortfall is what matters and a negative
        // availability makes it read as an arithmetic error.
        daysAvailable: Math.max(0, daysAvailable),
        daysShort: leadDays - Math.max(0, daysAvailable),
        isFrozen: s.is_frozen,
      });
    }
  }

  return { targetCompletionDate: target, conflicts, longLead };
}
