import { randomUUID } from 'node:crypto';
import type { Page, TenantContext } from '@cog/contracts';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';

/**
 * Tasks.
 *
 * **A replacement.** The legacy's table is created by `ensureTasksTable()`
 * (`tasks.js:16-48`) at the top of every task function, inside a `try/catch`
 * that swallows the error, and is never recorded in `schema_migrations`
 * (TASK-01). Assignment is a lowercased email matched with
 * `LOWER(assigned_to) = ?` (`:138`), with no foreign key to anything.
 *
 * | Legacy | Why it is not ported |
 * |---|---|
 * | `assigned_to` holds a lowercased email (`tasks.js:94`) | A principal id with a composite FK. An email changes; a person does not, and an email string cannot be joined to a user |
 * | `updateTask` writes `completed_at = ?, completed_by = ?` with **no COALESCE** (`:247-248`) | Any status change wipes the completion record. Here a CHECK constraint makes completed-and-unrecorded unrepresentable (TASK-02) |
 * | Two ways to complete a task, writing different timestamp formats — `completeTask` uses `datetime('now')` (`:286`), `updateTask` an ISO string (`:260`) | One path. `timestamptz`, set by the server |
 * | `status` and `priority` are free text | CHECK-constrained lower-case enums. Free-text status is what leads to `stage.includes('reject')` |
 * | Any authenticated user may reassign or delete any task (`:229`, `:304`) | Behind the tenant middleware; the role model is PO-13 |
 */

const FK_VIOLATION = '23503';

export interface TxLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

export class TaskNotFound extends Error {
  override readonly name = 'TaskNotFound';
}

export class TaskStaleWrite extends Error {
  override readonly name = 'TaskStaleWrite';
}

/** The assignee, or the project, does not exist in this tenant. */
export class TaskReferentNotFound extends Error {
  override readonly name = 'TaskReferentNotFound';
}

export interface CreateTaskInput {
  readonly title: string;
  readonly description?: string | undefined;
  readonly entityType?: string | undefined;
  readonly entityId?: string | undefined;
  readonly entityName?: string | undefined;
  readonly projectId?: string | undefined;
  readonly assignedTo: string;
  readonly dueDate?: string | undefined;
  readonly priority?: string | undefined;
  readonly notes?: string | undefined;
}

export interface UpdateTaskInput {
  readonly title: string;
  readonly description?: string | undefined;
  readonly assignedTo: string;
  readonly dueDate?: string | undefined;
  readonly priority: string;
  readonly status: string;
  readonly notes?: string | undefined;
  readonly expectedVersion: number;
}

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly entityName: string;
  readonly projectId: string | null;
  readonly assignedTo: string;
  readonly assignedBy: string;
  readonly dueDate: string | null;
  /** Due before today and still open — the same comparison the summary counts, made once, here. */
  readonly overdue: boolean;
  readonly priority: string;
  readonly status: string;
  readonly completedAt: string | null;
  readonly completedBy: string | null;
  readonly notes: string;
  readonly version: number;
}

/**
 * Today, on the calendar a task is due on: India's, not the server's. Postgres's
 * `CURRENT_DATE` is the session's zone — UTC in the container — and a task due
 * yesterday in Mumbai was "not yet overdue" until half past five in the
 * morning. Interpolated into SQL as an expression, never a value.
 */
const INDIA_TODAY = "(now() AT TIME ZONE 'Asia/Kolkata')::date";

const COLUMNS = `id, title, description, entity_type, entity_id, entity_name,
                 project_id, assigned_to, assigned_by, due_date::text AS due_date,
                 (due_date < ${INDIA_TODAY} AND status IN ('pending', 'in_progress')) AS overdue,
                 priority, status, completed_at::text AS completed_at, completed_by,
                 notes, version`;

type Row = {
  id: string;
  title: string;
  description: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  project_id: string | null;
  assigned_to: string;
  assigned_by: string;
  due_date: string | null;
  overdue: boolean | null;
  priority: string;
  status: string;
  completed_at: string | null;
  completed_by: string | null;
  notes: string;
  version: number;
};

function toTask(r: Row): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    entityType: r.entity_type,
    entityId: r.entity_id,
    entityName: r.entity_name,
    projectId: r.project_id,
    assignedTo: r.assigned_to,
    assignedBy: r.assigned_by,
    dueDate: r.due_date,
    overdue: r.overdue === true,
    priority: r.priority,
    status: r.status,
    completedAt: r.completed_at,
    completedBy: r.completed_by,
    notes: r.notes,
    version: r.version,
  };
}

export interface TaskFilter {
  readonly assignedTo?: string | undefined;
  readonly status?: string | undefined;
  /** The screen calls this "about". Free text — `entityType` has no enum. */
  readonly entityType?: string | undefined;
  readonly due?: 'today' | 'overdue' | undefined;
}

/**
 * The list's sort key: open tasks before closed ones, then by due date, all
 * in ONE text-sortable expression rather than two ORDER BY columns, because
 * `keyset()` cuts a page on a single comparable value. `'0'`/`'1'` sorts open
 * first; a task with no due date sorts last within its bucket via the
 * `9999-12-31` fallback; `created_at` is the final tiebreak before `id`. The
 * same text appears in the SELECT (aliased `sort_key`), the keyset comparison
 * and the ORDER BY — `keyset()` just interpolates whatever expression it is
 * given, so the full expression stands in for a plain column name.
 */
const SORT_KEY_EXPR = `(CASE WHEN status IN ('pending', 'in_progress') THEN '0' ELSE '1' END
  || COALESCE(due_date::text, '9999-12-31') || created_at::text)`;

export async function listTasks(
  tx: TxLike,
  page: PageQuery,
  filter: TaskFilter,
): Promise<Page<Task>> {
  const params: unknown[] = [
    filter.status ?? null,
    filter.assignedTo ?? null,
    filter.entityType === undefined || filter.entityType === '' ? null : filter.entityType,
  ];
  const dueClause =
    filter.due === 'today'
      ? `due_date = ${INDIA_TODAY}`
      : filter.due === 'overdue'
        ? `due_date < ${INDIA_TODAY} AND status IN ('pending', 'in_progress')`
        : 'TRUE';
  const where = `($1::text IS NULL OR status = $1)
              AND ($2::uuid IS NULL OR assigned_to = $2)
              AND ($3::text IS NULL OR entity_type = $3)
              AND (${dueClause})`;
  const k = keyset(page, SORT_KEY_EXPR, 'id', 'text', false, params.length + 1);
  const rows = await tx.query<Row & { sort_key: string }>(
    `SELECT ${COLUMNS}, ${SORT_KEY_EXPR} AS sort_key
       FROM workflow.tasks
      WHERE ${where}
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${params.length + k.params.length + 1}`,
    [...params, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM workflow.tasks WHERE ${where}`,
    params,
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.sort_key, id: r.id }));
  return {
    items: paged.items.map(toTask),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

export interface TaskSummary {
  readonly open: number;
  readonly dueToday: number;
  readonly overdue: number;
  readonly peopleWithOpenTasks: number;
  readonly overdueAssignees: readonly string[];
  readonly dueTodayAssignees: readonly string[];
  readonly entityTypes: readonly string[];
}

/**
 * The stat row above the list — over the WHOLE tenant, under no filter and no
 * cursor, so it stays true regardless of which page or filter the caller is
 * looking at.
 */
export async function taskSummary(tx: TxLike): Promise<TaskSummary> {
  const [row] = await tx.query<{
    open: number;
    due_today: number;
    overdue: number;
    people_with_open_tasks: number;
    overdue_assignees: string[];
    due_today_assignees: string[];
    entity_types: string[];
  }>(
    `SELECT
       count(*) FILTER (WHERE status IN ('pending', 'in_progress'))::int AS open,
       count(*) FILTER (WHERE due_date = ${INDIA_TODAY}
                          AND status IN ('pending', 'in_progress'))::int AS due_today,
       count(*) FILTER (WHERE due_date < ${INDIA_TODAY}
                          AND status IN ('pending', 'in_progress'))::int AS overdue,
       count(DISTINCT assigned_to) FILTER (WHERE status IN ('pending', 'in_progress'))::int
         AS people_with_open_tasks,
       COALESCE(array_agg(DISTINCT assigned_to ORDER BY assigned_to)
                  FILTER (WHERE due_date < ${INDIA_TODAY}
                            AND status IN ('pending', 'in_progress')), ARRAY[]::uuid[])
         AS overdue_assignees,
       COALESCE(array_agg(DISTINCT assigned_to ORDER BY assigned_to)
                  FILTER (WHERE due_date = ${INDIA_TODAY}
                            AND status IN ('pending', 'in_progress')), ARRAY[]::uuid[])
         AS due_today_assignees,
       COALESCE(array_agg(DISTINCT entity_type ORDER BY entity_type)
                  FILTER (WHERE entity_type <> ''), ARRAY[]::text[])
         AS entity_types
     FROM workflow.tasks`,
  );
  return {
    open: row?.open ?? 0,
    dueToday: row?.due_today ?? 0,
    overdue: row?.overdue ?? 0,
    peopleWithOpenTasks: row?.people_with_open_tasks ?? 0,
    overdueAssignees: row?.overdue_assignees ?? [],
    dueTodayAssignees: row?.due_today_assignees ?? [],
    entityTypes: row?.entity_types ?? [],
  };
}

export async function createTask(
  tx: TxLike,
  ctx: TenantContext,
  input: CreateTaskInput,
): Promise<Task> {
  const id = randomUUID();
  try {
    await tx.query(
      `INSERT INTO workflow.tasks
         (tenant_id, id, title, description, entity_type, entity_id, entity_name,
          project_id, assigned_to, assigned_by, due_date, priority, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        ctx.tenantId,
        id,
        input.title,
        input.description ?? '',
        input.entityType ?? 'general',
        input.entityId ?? '',
        input.entityName ?? '',
        input.projectId ?? null,
        input.assignedTo,
        // Never from the request: who assigned it is who is authenticated.
        ctx.principal.id,
        input.dueDate ?? null,
        input.priority ?? 'medium',
        input.notes ?? '',
      ],
    );
  } catch (error) {
    throw asReferentError(error);
  }
  return getTask(tx, id);
}

export async function getTask(tx: TxLike, id: string): Promise<Task> {
  const rows = await tx.query<Row>(`SELECT ${COLUMNS} FROM workflow.tasks WHERE id = $1`, [id]);
  const row = rows[0];
  if (row === undefined) throw new TaskNotFound(`no such task: ${id}`);
  return toTask(row);
}

/**
 * Edit a task.
 *
 * **Completion is set here, never by the caller.** The request carries a status;
 * `completed_at` and `completed_by` are derived from it and from the
 * authenticated principal. `updateTask` in the legacy takes both as parameters
 * and writes them with no COALESCE (`tasks.js:247-248`), so every edit that is
 * not a completion erases the record of one that was.
 */
export async function updateTask(
  tx: TxLike,
  ctx: TenantContext,
  id: string,
  input: UpdateTaskInput,
): Promise<Task> {
  const current = await tx.query<{ version: number }>(
    `SELECT version FROM workflow.tasks WHERE id = $1`,
    [id],
  );
  const found = current[0];
  if (found === undefined) throw new TaskNotFound(`no such task: ${id}`);
  if (found.version !== input.expectedVersion) {
    throw new TaskStaleWrite(
      `this task was modified by someone else (expected version ${input.expectedVersion}, found ${found.version})`,
    );
  }

  const completing = input.status === 'completed';
  let rows: Row[];
  try {
    rows = await tx.query<Row>(
      `UPDATE workflow.tasks
          SET title        = $2,
              description  = $3,
              assigned_to  = $4,
              due_date     = $5,
              priority     = $6,
              status       = $7,
              notes        = $8,
              completed_at = CASE WHEN $7 = 'completed'
                                  THEN COALESCE(completed_at, now()) END,
              completed_by = CASE WHEN $7 = 'completed'
                                  THEN COALESCE(completed_by, $9::uuid) END,
              version      = version + 1,
              updated_at   = now()
        WHERE id = $1 AND version = $10
      RETURNING ${COLUMNS}`,
      [
        id,
        input.title,
        input.description ?? '',
        input.assignedTo,
        input.dueDate ?? null,
        input.priority,
        input.status,
        input.notes ?? '',
        completing ? ctx.principal.id : null,
        input.expectedVersion,
      ],
    );
  } catch (error) {
    throw asReferentError(error);
  }

  const row = rows[0];
  if (row === undefined) {
    throw new TaskStaleWrite(
      'this task was modified by someone else while the change was being saved',
    );
  }
  return toTask(row);
}

export async function deleteTask(tx: TxLike, id: string): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `DELETE FROM workflow.tasks WHERE id = $1 RETURNING id`,
    [id],
  );
  if (rows[0] === undefined) throw new TaskNotFound(`no such task: ${id}`);
}

/**
 * An assignee or project that is not visible in this tenant.
 *
 * The composite FKs are what turn a cross-tenant reference into a violation —
 * referential integrity is not subject to RLS, so a single-column FK would let
 * one tenant assign work to another tenant's user and learn, from the insert
 * succeeding, that they exist.
 */
function asReferentError(error: unknown): unknown {
  if ((error as { code?: unknown } | null)?.code === FK_VIOLATION) {
    return new TaskReferentNotFound(
      'that assignee or project does not exist in this organisation',
    );
  }
  return error;
}
