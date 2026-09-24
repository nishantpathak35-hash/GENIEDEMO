import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  HTTP_STATUS,
  createTaskInput,
  registerDocumentInput,
  task,
  updateTaskInput,
} from '@cog/contracts';
import { finishPage, keyset, readPage, tenantOf, txOf } from '@cog/service-kit';
import {
  DocumentNotFound,
  VaultError,
  deleteDocument,
  documentSummary,
  listDocuments,
  registerDocument,
} from '../application/documents.js';
import {
  TaskNotFound,
  TaskReferentNotFound,
  TaskStaleWrite,
  createTask,
  deleteTask,
  listTasks,
  taskSummary,
  updateTask,
} from '../application/tasks.js';

/**
 * Approval and audit HTTP surface.
 *
 * Mounted by `services/host` **behind the tenant middleware**. No query below
 * carries a `WHERE tenant_id` — the RLS policy applies it.
 *
 * **These are read surfaces only, and that is a boundary decision rather than
 * an omission.** Recording an approval means applying the decision to the
 * aggregate that owns it — a purchase order, a payment request — and
 * `recordApproval` takes an `applyDecision` callback for exactly that. But
 * `services/workflow` may not import `services/procurement`, and procurement
 * may not import workflow: `eslint.config.mjs` generates a restricted zone for
 * every ordered pair of services, and CI fails on either direction.
 *
 * So the *decision* endpoint belongs to `services/host`, the composition root
 * and the one place permitted to import both (M1/D5). Putting it here would
 * mean workflow reaching into procurement's tables, which is precisely the
 * accumulation TOPOLOGY warns about: "`workflow` is the one to watch. It owns
 * no business domain of its own. If it starts accumulating procurement or
 * finance logic, that is the early warning that the old mess is re-forming."
 */

type ChainRow = {
  id: string;
  entity_type: string;
  name: string;
  is_active: boolean;
};

type StageRow = {
  chain_id: string;
  name: string;
  sequence: number;
  approver_role: string;
  min_approvals: number;
      approval_ceiling_paise: string | null;
};

type HistoryRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  stage_name: string;
  decision: string;
  approver_id: string;
  requester_id: string;
  remarks: string;
  occurred_at: string;
};

type AuditRow = {
  id: string;
  actor_id: string;
  actor_kind: string;
  impersonated_by: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  occurred_at: string;
};

export function workflowRoutes(): Hono {
  const app = new Hono();

  /**
   * The configured chains, with their stages.
   *
   * Every stage field returned here is one the engine actually evaluates. The
   * legacy declares nine and reads one (APPR-03), so an administrator who
   * configured "two approvers required" got one and had no way to tell. A
   * chain that is displayed must be the chain that is enforced.
   *
   * Not paged: this is bounded configuration, a handful of chains per tenant,
   * never a screen's worth of a feed.
   */
  app.get('/chains', async (c) => {
    const tx = txOf(c);
    const chains = await tx.query<ChainRow>(
      `SELECT id, entity_type, name, is_active FROM workflow.approval_chains
        ORDER BY entity_type, name`,
    );
    const stages = await tx.query<StageRow>(
      `SELECT chain_id, name, sequence, approver_role, min_approvals, approval_ceiling_paise
         FROM workflow.approval_stages ORDER BY chain_id, sequence`,
    );

    return c.json({
      items: chains.map((chain) => ({
        id: chain.id,
        entityType: chain.entity_type,
        name: chain.name,
        isActive: chain.is_active,
        stages: stages
          .filter((s) => s.chain_id === chain.id)
          .map((s) => ({
            name: s.name,
            sequence: s.sequence,
            approverRole: s.approver_role,
            minApprovals: s.min_approvals,
            approvalCeilingPaise: s.approval_ceiling_paise,
          })),
      })),
    });
  });

  /**
   * The approval history for one entity.
   *
   * `workflow.approval_history` is append-only **by privilege** — `app_runtime`
   * holds `SELECT, INSERT` and neither `UPDATE` nor `DELETE`. That is the
   * property this endpoint exposes, and it is why the history is evidence
   * rather than a display cache: one row per stage per approver, including an
   * administrator who pushed something through, which the legacy makes
   * invisible by advancing several stages in a single call (APPR-01).
   */
  app.get('/history/:entityType/:entityId', async (c) => {
    const entityType = c.req.param('entityType');
    const entityId = c.req.param('entityId');
    if (entityType.length === 0 || entityId.length === 0) return badRequest(c);

    const rows = await txOf(c).query<HistoryRow>(
      `SELECT id, entity_type, entity_id, stage_name, decision, approver_id,
              requester_id, remarks, occurred_at::text AS occurred_at
         FROM workflow.approval_history
        WHERE entity_type = $1 AND entity_id = $2
        ORDER BY occurred_at`,
      [entityType, entityId],
    );

    return c.json({
      items: rows.map((r) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        stageName: r.stage_name,
        decision: r.decision,
        approverId: r.approver_id,
        requesterId: r.requester_id,
        remarks: r.remarks,
        occurredAt: r.occurred_at,
      })),
    });
  });

  /**
   * Audit search.
   *
   * `impersonatedBy` is returned rather than hidden. An impersonated action
   * that looks identical to a real one is the finding a SOC 2 auditor opens
   * with, so the field is part of the answer and not an internal column.
   */
  app.get('/audit', async (c) => {
    const page = readPage(c);
    if ('error' in page) return validationFailedRaw(c, 'cursor', page.error);
    const entityType = c.req.query('entityType');
    const actorId = c.req.query('actorId');
    if (actorId !== undefined && !z.uuid().safeParse(actorId).success) {
      return validationFailedRaw(c, 'actorId', 'must be a principal id');
    }
    const action = c.req.query('action');

    const tx = txOf(c);
    const params = [entityType ?? null, actorId ?? null, action ?? null];
    const where = `($1::text IS NULL OR entity_type = $1)
                AND ($2::uuid IS NULL OR actor_id = $2::text)
                AND ($3::text IS NULL OR action = $3)`;
    const k = keyset(page, 'occurred_at', 'id', 'timestamptz', true, params.length + 1);
    const rows = await tx.query<AuditRow>(
      `SELECT id, actor_id, actor_kind, impersonated_by, action,
              entity_type, entity_id, occurred_at::text AS occurred_at
         FROM workflow.audit_events
        WHERE ${where}
          AND ${k.where}
        ORDER BY ${k.orderBy}
        LIMIT $${params.length + k.params.length + 1}`,
      [...params, ...k.params, page.limit + 1],
    );
    const [counted] = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM workflow.audit_events WHERE ${where}`,
      params,
    );
    // The summary is over the WHOLE log, under no filter: an impersonation
    // count that silently narrowed to `entityType=purchase_order` would not be
    // the number the banner above the list means.
    const [summaryRow] = await tx.query<{ total: number; impersonated: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE impersonated_by IS NOT NULL)::int AS impersonated
         FROM workflow.audit_events`,
    );
    const paged = finishPage(rows, page, (r) => ({ key: r.occurred_at, id: r.id }));

    return c.json({
      items: paged.items.map((r) => ({
        id: r.id,
        actorId: r.actor_id,
        actorKind: r.actor_kind,
        impersonatedBy: r.impersonated_by,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        occurredAt: r.occurred_at,
      })),
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: counted?.n ?? 0,
      summary: { total: summaryRow?.total ?? 0, impersonated: summaryRow?.impersonated ?? 0 },
    });
  });

  // --------------------------------------------------------------- tasks ----

  /**
   * Tasks.
   *
   * `assignedTo` filters by principal id. The legacy filters with
   * `LOWER(assigned_to) = ?` against a stored email (`tasks.js:138`).
   */
  app.get('/tasks', async (c) => {
    const page = readPage(c);
    if ('error' in page) return validationFailedRaw(c, 'cursor', page.error);
    const assignedTo = c.req.query('assignedTo');
    if (assignedTo !== undefined && !z.uuid().safeParse(assignedTo).success) {
      return validationFailedRaw(c, 'assignedTo', 'must be a principal id');
    }
    const status = c.req.query('status');
    if (status !== undefined && !task.shape.status.safeParse(status).success) {
      return validationFailedRaw(c, 'status', 'is not a task status');
    }
    const due = c.req.query('due');
    if (due !== undefined && due !== 'today' && due !== 'overdue') {
      return validationFailedRaw(c, 'due', 'must be today or overdue');
    }

    const tx = txOf(c);
    const [page_, summary] = await Promise.all([
      listTasks(tx, page, {
        assignedTo,
        status,
        entityType: c.req.query('entityType'),
        due,
      }),
      taskSummary(tx),
    ]);
    return c.json({ ...page_, summary });
  });

  app.post('/tasks', async (c) => {
    const parsed = createTaskInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(await createTask(txOf(c), tenantOf(c), parsed.data), 201);
  });

  /**
   * Edit a task.
   *
   * The completion record is set from the status, here, and cannot be supplied.
   */
  app.patch('/tasks/:taskId', async (c) => {
    const id = c.req.param('taskId');
    if (!z.uuid().safeParse(id).success) return taskNotFound(c);
    const parsed = updateTaskInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(await updateTask(txOf(c), tenantOf(c), id, parsed.data));
  });

  app.delete('/tasks/:taskId', async (c) => {
    const id = c.req.param('taskId');
    if (!z.uuid().safeParse(id).success) return taskNotFound(c);
    await deleteTask(txOf(c), id);
    return c.body(null, 204);
  });

  // ----------------------------------------------------------- documents --

  /**
   * The document vault.
   *
   * **No endpoint here accepts file bytes.** The row records a document in
   * object storage under a key this service issued. `uploadAttachment`
   * (`attachments.js:45`) takes base64 in the request and either writes it into
   * `public/uploads/` — a directory served with no authentication at all
   * (VAULT-01) — or base64-encodes it into a column (VAULT-02).
   */
  app.get('/documents', async (c) => {
    const page = readPage(c);
    if ('error' in page) return validationFailedRaw(c, 'cursor', page.error);

    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success) {
      return validationFailedRaw(c, 'projectId', 'must be a uuid');
    }
    const tx = txOf(c);
    const [page_, summary] = await Promise.all([
      listDocuments(tx, page, { folder: c.req.query('folder'), q: c.req.query('q'), projectId }),
      documentSummary(tx, projectId),
    ]);
    return c.json({ ...page_, summary });
  });

  app.post('/documents', async (c) => {
    const parsed = registerDocumentInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(await registerDocument(txOf(c), tenantOf(c), parsed.data), 201);
  });

  app.delete('/documents/:documentId', async (c) => {
    const id = c.req.param('documentId');
    if (!z.uuid().safeParse(id).success) return documentNotFound(c);
    await deleteDocument(txOf(c), id);
    return c.body(null, 204);
  });
  app.onError((error, c) => {
    if (error instanceof TaskNotFound) return taskNotFound(c);
    if (error instanceof DocumentNotFound) return documentNotFound(c);
    if (error instanceof VaultError) {
      // A refused content type or an oversized document is a thing the caller
      // can act on, not a fault.
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: taskRequestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof TaskStaleWrite || error instanceof TaskReferentNotFound) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: taskRequestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    throw error;
  });
  return app;
}

function badRequest(c: Context): Response {
  return c.json(
    {
      code: 'VALIDATION_FAILED' as const,
      message: 'An entity type and id are required.',
      requestId: c.req.header('x-request-id') ?? 'unknown',
    },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

function taskRequestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

function taskNotFound(c: Context): Response {
  return c.json(
    { code: 'NOT_FOUND' as const, message: 'No such task.', requestId: taskRequestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

/** Field paths only. Echoing a rejected value back is how data reaches a console. */
function validationFailed(c: Context, error: z.ZodError): Response {
  return c.json(
    {
      code: 'VALIDATION_FAILED' as const,
      message: 'Some of the submitted values are not valid.',
      requestId: taskRequestId(c),
      details: error.issues.map((i) => ({ path: i.path.join('.'), reason: i.message })),
    },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

function validationFailedRaw(c: Context, path: string, reason: string): Response {
  return c.json(
    {
      code: 'VALIDATION_FAILED' as const,
      message: 'Some of the submitted values are not valid.',
      requestId: taskRequestId(c),
      details: [{ path, reason }],
    },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

function documentNotFound(c: Context): Response {
  return c.json(
    { code: 'NOT_FOUND' as const, message: 'No such document.', requestId: taskRequestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}
