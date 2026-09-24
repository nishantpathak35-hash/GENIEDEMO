import type { TxLike } from './boq-writes.js';
import { ProjectNotFound } from './boq-writes.js';
import type { ProjectState } from '../domain/project-state.js';

/**
 * What a handed-over or closed project still allows (`docs/design/03-navigation.html`,
 * "Overview inside ANU-02 — handed over, and read-only"): snags, final bills
 * and retention are still worked from it, from Money; nothing else on it can
 * be raised or changed, and everything stays readable and exportable. A lost
 * project is final the same way.
 *
 * The rule lives here, once, and every project-scoped write in this service
 * asks it before touching a row — the BOQ, a variation, a milestone, a
 * takeoff sheet — and the composition root asks it before an order is raised
 * on the project. The page shows the banner; the server is what refuses.
 */
export const READ_ONLY_STATES: ReadonlySet<ProjectState> = new Set(['handed_over', 'closed', 'lost']);

export class ProjectReadOnly extends Error {
  override readonly name = 'ProjectReadOnly';
  constructor(
    readonly code: string,
    readonly state: ProjectState,
  ) {
    super(
      state === 'handed_over'
        ? `${code} has been handed over: snags, final bills and retention are still worked from it; nothing else can be raised or changed.`
        : `${code} is ${state === 'closed' ? 'closed' : 'lost'} and final: nothing on it can be raised or changed.`,
    );
  }
}

/** The project's state, or not found. */
export async function projectStateOf(tx: TxLike, projectId: string): Promise<{ code: string; state: ProjectState }> {
  const rows = await tx.query<{ code: string; state: ProjectState }>(`SELECT code, state FROM projects.projects WHERE id = $1`, [projectId]);
  const row = rows[0];
  if (row === undefined) throw new ProjectNotFound(`no such project: ${projectId}`);
  return row;
}

/** Refuse a write on a project that is no longer worked. */
export async function assertProjectOpen(tx: TxLike, projectId: string): Promise<void> {
  const { code, state } = await projectStateOf(tx, projectId);
  if (READ_ONLY_STATES.has(state)) throw new ProjectReadOnly(code, state);
}
