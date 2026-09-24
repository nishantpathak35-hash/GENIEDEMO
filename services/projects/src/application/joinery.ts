import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './project-team.js';

/**
 * Workflow 6: bespoke joinery, from measurement to acceptance.
 *
 * **The rule:** a stage cannot be signed off while an earlier one is
 * outstanding, and the refusal names the ones that are. You do not reach Factory
 * Fabrication before Shop Drawing Approval is signed, because the thing being
 * fabricated is the drawing.
 *
 * The nine stages are ported verbatim from `design-build.js:1166-1176`. Nobody
 * writes that list without watching a workshop: two separate inspection stages,
 * and dispatch separated from receipt because those are the two points where a
 * package goes missing.
 */

export class JoineryRefused extends Error {
  override readonly name = 'JoineryRefused';
}

/**
 * The nine stages, in order.
 *
 * Ported as-is rather than shortened. A shorter list would lose exactly the
 * distinctions that make it useful — "dispatched" and "arrived" are not the
 * same day and the gap between them is where a chase happens.
 */
export const JOINERY_STAGES = [
  'Site measurement',
  'Shop drawing approval',
  'Finish and sample approval',
  'Factory fabrication',
  'Factory quality inspection',
  'Dispatch from works',
  'Site receipt',
  'Installation',
  'Final client acceptance',
] as const;

export const COMPLETED = 'Completed' as const;

export interface JoineryStage {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly status: 'pending' | 'completed';
  readonly evidenceUrl: string;
  readonly notes: string;
  readonly completedAt: string | null;
  readonly completedBy: string | null;
}

export interface JoineryPackage {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly roomLabel: string;
  readonly workshop: string;
  readonly currentStage: string;
  readonly targetInstallDate: string | null;
  readonly notes: string;
  readonly stages: readonly JoineryStage[];
}

export async function listPackages(
  tx: TxLike,
  projectId: string,
): Promise<readonly JoineryPackage[]> {
  const rows = await tx.query<{
    id: string;
    project_id: string;
    name: string;
    room_label: string;
    workshop: string;
    current_stage: string;
    target_install_date: string | null;
    notes: string;
  }>(
    `SELECT id, project_id, name, room_label, workshop, current_stage,
            target_install_date::text AS target_install_date, notes
       FROM projects.joinery_packages
      WHERE project_id = $1
      ORDER BY target_install_date NULLS LAST, name`,
    [projectId],
  );
  if (rows.length === 0) return [];

  const stages = await tx.query<{
    id: string;
    package_id: string;
    position: number;
    name: string;
    status: string;
    evidence_url: string;
    notes: string;
    completed_at: string | null;
    completed_by: string | null;
  }>(
    `SELECT id, package_id, position, name, status, evidence_url, notes,
            completed_at::text AS completed_at, completed_by
       FROM projects.joinery_stages
      WHERE package_id = ANY($1::uuid[])
      ORDER BY position`,
    [rows.map((r) => r.id)],
  );

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    roomLabel: row.room_label,
    workshop: row.workshop,
    currentStage: row.current_stage,
    targetInstallDate: row.target_install_date,
    notes: row.notes,
    stages: stages
      .filter((s) => s.package_id === row.id)
      .map((s) => ({
        id: s.id,
        position: s.position,
        name: s.name,
        status: s.status as 'pending' | 'completed',
        evidenceUrl: s.evidence_url,
        notes: s.notes,
        completedAt: s.completed_at,
        completedBy: s.completed_by,
      })),
  }));
}

export interface PackageInput {
  readonly name: string;
  readonly roomLabel?: string | undefined;
  readonly workshop?: string | undefined;
  readonly targetInstallDate?: string | null | undefined;
  readonly notes?: string | undefined;
}

/**
 * Start a package.
 *
 * **The nine stages are written now, with the package.** Creating them lazily
 * as each is reached would mean the prerequisite check has nothing to check
 * against — and it would hide the shape of the process from whoever opens the
 * screen on day one, which is the part that makes it useful.
 */
export async function addPackage(
  tx: TxLike,
  ctx: TenantContext,
  projectId: string,
  input: PackageInput,
): Promise<string> {
  const rows = await tx.query<{ id: string }>(
    `INSERT INTO projects.joinery_packages
       (tenant_id, project_id, name, room_label, workshop, current_stage,
        target_install_date, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9)
     RETURNING id`,
    [
      ctx.tenantId,
      projectId,
      input.name.trim(),
      input.roomLabel ?? '',
      input.workshop ?? '',
      JOINERY_STAGES[0],
      input.targetInstallDate ?? null,
      input.notes ?? '',
      ctx.principal.id,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new JoineryRefused('That package was not saved.');

  await tx.query(
    `INSERT INTO projects.joinery_stages (tenant_id, package_id, position, name)
     SELECT $1, $2, ordinality - 1, name
       FROM unnest($3::text[]) WITH ORDINALITY AS t(name, ordinality)`,
    [ctx.tenantId, id, [...JOINERY_STAGES]],
  );

  return id;
}

export interface AdvanceResult {
  readonly currentStage: string;
  readonly completedStage: string;
}

/**
 * Sign a stage off.
 *
 * **The prerequisite check is the point of this function**, and the refusal
 * names what is outstanding rather than saying no — "you cannot do that" on a
 * nine-stage process sends somebody hunting through the list.
 *
 * The package's `current_stage` moves to the first stage still pending, which
 * is not always the next one by position: signing off out of order is refused,
 * but a stage can be signed off after a later one was already done in a
 * previous version of this data.
 */
export async function advanceStage(
  tx: TxLike,
  ctx: TenantContext,
  stageId: string,
  evidence: { readonly evidenceUrl?: string | undefined; readonly notes?: string | undefined },
): Promise<AdvanceResult> {
  const found = await tx.query<{
    package_id: string;
    position: number;
    name: string;
    status: string;
  }>(
    `SELECT package_id, position, name, status FROM projects.joinery_stages WHERE id = $1`,
    [stageId],
  );
  const stage = found[0];
  if (stage === undefined) throw new JoineryRefused('no such stage');
  if (stage.status === 'completed') {
    throw new JoineryRefused(`${stage.name} has already been signed off.`);
  }

  const outstanding = await tx.query<{ name: string }>(
    `SELECT name FROM projects.joinery_stages
      WHERE package_id = $1 AND position < $2 AND status <> 'completed'
      ORDER BY position`,
    [stage.package_id, stage.position],
  );
  if (outstanding.length > 0) {
    throw new JoineryRefused(
      `${stage.name} cannot be signed off yet. Outstanding first: ${outstanding
        .map((o) => o.name)
        .join(', ')}.`,
    );
  }

  await tx.query(
    `UPDATE projects.joinery_stages
        SET status = 'completed', completed_at = now(), completed_by = $2,
            evidence_url = $3, notes = $4
      WHERE id = $1`,
    [stageId, ctx.principal.id, evidence.evidenceUrl ?? '', evidence.notes ?? ''],
  );

  const next = await tx.query<{ name: string }>(
    `SELECT name FROM projects.joinery_stages
      WHERE package_id = $1 AND status <> 'completed'
      ORDER BY position
      LIMIT 1`,
    [stage.package_id],
  );
  const currentStage = next[0]?.name ?? COMPLETED;

  await tx.query(
    `UPDATE projects.joinery_packages SET current_stage = $2, updated_at = now() WHERE id = $1`,
    [stage.package_id, currentStage],
  );

  return { currentStage, completedStage: stage.name };
}
