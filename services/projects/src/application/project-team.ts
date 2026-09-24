/**
 * The transaction the caller is already in. Declared here rather than imported
 * from a sibling: these modules share a shape, not a dependency.
 */
export interface TxLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

/**
 * Project membership, and the first authorisation scope narrower than a tenant.
 *
 * `project_team` was a granted module with no data behind it (migration 0024's
 * module list, recorded as a gap in `docs/ports/design-build-and-work.md`).
 *
 * **RLS does not help here and saying so is the point.** Every row this touches
 * belongs to one tenant, and every principal asking belongs to the same one.
 * Whether a site engineer on project A may read project B's team is a question
 * the database cannot answer, because both rows are equally visible to the
 * connection. It is answered by `mayReadTeam` below and tested with two
 * principals in one tenant.
 */

export interface ProjectMember {
  readonly id: string;
  readonly projectId: string;
  readonly principalId: string;
  readonly email: string;
  readonly designation: string;
  readonly addedAt: string;
}

export class ProjectTeamError extends Error {
  override readonly name = 'ProjectTeamError';
}

/** Not on this project, and not entitled to see across projects. */
export class NotOnThisProject extends ProjectTeamError {}

/**
 * May this principal see this project's team?
 *
 * Two ways in, and only two:
 *
 *   1. **They are on it.** Membership is the ordinary path and needs no grant.
 *   2. **They hold `manage_settings`.** The administrative override, so an
 *      organisation is never locked out of a project whose whole team has left.
 *
 * Holding the `project_team` MODULE grant is deliberately not sufficient. That
 * grant says "this role uses the team screen", which every project manager
 * needs; it must not also mean "on every project in the company". A module
 * grant is about which screens exist for a role, not which rows.
 */
export async function mayReadTeam(
  tx: TxLike,
  projectId: string,
  principalId: string,
  actions: readonly string[],
): Promise<boolean> {
  if (actions.includes('manage_settings')) return true;
  const rows = await tx.query<{ id: string }>(
    `SELECT id FROM projects.project_members
      WHERE project_id = $1 AND principal_id = $2`,
    [projectId, principalId],
  );
  return rows.length > 0;
}

export async function listProjectTeam(
  tx: TxLike,
  projectId: string,
): Promise<readonly ProjectMember[]> {
  const rows = await tx.query<{
    id: string;
    project_id: string;
    principal_id: string;
    email: string;
    designation: string;
    added_at: string;
  }>(
    `SELECT m.id, m.project_id, m.principal_id, p.email, m.designation,
            m.added_at::text AS added_at
       FROM projects.project_members m
       JOIN identity.principals p
         ON p.tenant_id = m.tenant_id AND p.id = m.principal_id
      WHERE m.project_id = $1
      ORDER BY p.email`,
    [projectId],
  );
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    principalId: r.principal_id,
    email: r.email,
    designation: r.designation,
    addedAt: r.added_at,
  }));
}

export interface AddMemberInput {
  readonly projectId: string;
  readonly principalId: string;
  readonly designation?: string | undefined;
}

/**
 * Put somebody on a project.
 *
 * `ON CONFLICT DO UPDATE` on the designation rather than `DO NOTHING`: adding
 * somebody who is already on the project, with a corrected job title, is a
 * correction and not an error. Adding them twice unchanged is a no-op.
 */
export async function addProjectMember(
  tx: TxLike,
  tenantId: string,
  addedBy: string,
  input: AddMemberInput,
): Promise<string> {
  const rows = await tx.query<{ id: string }>(
    `INSERT INTO projects.project_members
       (tenant_id, id, project_id, principal_id, designation, added_by)
     VALUES ($1, gen_random_uuid(), $2, $3, $4, $5)
     ON CONFLICT (tenant_id, project_id, principal_id)
       DO UPDATE SET designation = EXCLUDED.designation
     RETURNING id`,
    [tenantId, input.projectId, input.principalId, (input.designation ?? '').trim(), addedBy],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new ProjectTeamError('that member was not saved');
  return id;
}

/**
 * Take somebody off a project.
 *
 * Returns whether a row went. The caller turns `false` into a 404 rather than
 * reporting success for a removal that removed nothing — "it worked" for a
 * member who is still on the project is the wrong answer to give an
 * administrator tidying up access.
 */
export async function removeProjectMember(
  tx: TxLike,
  projectId: string,
  principalId: string,
): Promise<boolean> {
  const rows = await tx.query<{ id: string }>(
    `DELETE FROM projects.project_members
      WHERE project_id = $1 AND principal_id = $2
      RETURNING id`,
    [projectId, principalId],
  );
  return rows.length > 0;
}

/** Which projects this principal is on. Drives the "my projects" filter later. */
export async function projectsFor(
  tx: TxLike,
  principalId: string,
): Promise<readonly string[]> {
  const rows = await tx.query<{ project_id: string }>(
    `SELECT project_id FROM projects.project_members WHERE principal_id = $1`,
    [principalId],
  );
  return rows.map((r) => r.project_id);
}

export interface Membership {
  readonly principalId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly designation: string;
}

/**
 * Which projects these people are on, with the project's name.
 *
 * The inverse of `listProjectTeam`, for a screen that lists PEOPLE rather than
 * a project. One query for the whole page rather than one per person: a
 * thirty-person organisation would otherwise make thirty round trips to render
 * a table, and the join is inside one service.
 */
export async function projectMembershipsFor(
  tx: TxLike,
  principalIds: readonly string[],
): Promise<readonly Membership[]> {
  if (principalIds.length === 0) return [];
  const rows = await tx.query<{
    principal_id: string;
    project_id: string;
    project_name: string;
    designation: string;
  }>(
    `SELECT m.principal_id, m.project_id, p.name AS project_name, m.designation
       FROM projects.project_members m
       JOIN projects.projects p ON p.tenant_id = m.tenant_id AND p.id = m.project_id
      WHERE m.principal_id = ANY($1::uuid[])
      ORDER BY p.name`,
    [[...principalIds]],
  );
  return rows.map((r) => ({
    principalId: r.principal_id,
    projectId: r.project_id,
    projectName: r.project_name,
    designation: r.designation,
  }));
}

/** Names for a set of project ids, for a screen that holds only the ids. */
export async function projectNames(
  tx: TxLike,
  projectIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (projectIds.length === 0) return new Map();
  const rows = await tx.query<{ id: string; name: string }>(
    `SELECT id, name FROM projects.projects WHERE id = ANY($1::uuid[])`,
    [[...projectIds]],
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Does this project exist in the caller's tenant? RLS answers, not a filter. */
export async function projectExists(tx: TxLike, projectId: string): Promise<boolean> {
  const rows = await tx.query<{ id: string }>(
    `SELECT id FROM projects.projects WHERE id = $1`,
    [projectId],
  );
  return rows.length > 0;
}
