import { z } from 'zod';
import { pageOf } from '../pagination.js';
import { paiseWire } from '../money.js';

/**
 * Approval and audit shapes.
 *
 * Every stage field here is one the engine **evaluates**. The legacy
 * `approval_workflow_stages` declares nine and reads one, so configuring "two
 * approvers required" silently yields one (APPR-03) — a chain that is displayed
 * must be the chain that is enforced, and a field that cannot be honoured is
 * not published.
 */

export const approvalStage = z.object({
  name: z.string(),
  sequence: z.number().int(),
  /** Empty means anyone authenticated may act at this stage. */
  approverRole: z.string(),
  /** How many DISTINCT people must approve. Honoured, not decorative. */
  minApprovals: z.number().int().min(1),
  /** Most this stage signs alone, paise. `null` = no limit — the shipped state. */
  approvalCeilingPaise: paiseWire.nullable(),
});

export const approvalChain = z.object({
  id: z.uuid(),
  entityType: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  stages: z.array(approvalStage),
});

export const approvalChainsResponse = z.object({
  items: z.array(approvalChain),
});

export type ApprovalChainsResponse = z.infer<typeof approvalChainsResponse>;

/**
 * One decision, as recorded.
 *
 * `requesterId` is stored alongside `approverId` so self-approval is answerable
 * from the record rather than by re-deriving who raised the request. The table
 * is append-only by privilege: `app_runtime` holds SELECT and INSERT and
 * neither UPDATE nor DELETE.
 */
export const approvalHistoryEntry = z.object({
  id: z.uuid(),
  entityType: z.string(),
  entityId: z.string(),
  stageName: z.string(),
  decision: z.string(),
  approverId: z.string(),
  requesterId: z.string(),
  remarks: z.string(),
  occurredAt: z.string(),
});

export const approvalHistoryResponse = z.object({
  items: z.array(approvalHistoryEntry),
});

export type ApprovalHistoryResponse = z.infer<typeof approvalHistoryResponse>;

export const auditEntry = z.object({
  id: z.uuid(),
  actorId: z.string(),
  actorKind: z.string(),
  /** Present when a support engineer acted as a customer's user. Never hidden. */
  impersonatedBy: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  occurredAt: z.string(),
});

/**
 * `total` is the count under whatever filter the request carried; `impersonated`
 * is always over the WHOLE log, not the filtered slice — an impersonation rate
 * that silently narrows to `entityType=purchase_order` is not the number this
 * screen's warning banner means.
 */
export const auditResponse = pageOf(auditEntry).extend({
  summary: z.object({
    total: z.number().int(),
    impersonated: z.number().int(),
  }),
});

export type AuditResponse = z.infer<typeof auditResponse>;

// ----------------------------------------------------------------- tasks --

const TASK_STATUS = ["pending", "in_progress", "completed", "cancelled"] as const;
const TASK_PRIORITY = ["low", "medium", "high", "urgent"] as const;

/**
 * Creating a task.
 *
 * `assignedTo` is a **principal id**, not an email. The legacy stores a
 * lowercased email and matches with `LOWER(assigned_to) = ?` (`tasks.js:138`)
 * with no foreign key, so a person who changes their email loses their tasks
 * (TASK-03).
 *
 * There is no `assignedBy` and no `status`: who assigned it is who is
 * authenticated, and a task starts pending.
 */
export const createTaskInput = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(120).optional(),
  entityName: z.string().max(300).optional(),
  projectId: z.uuid().optional(),
  assignedTo: z.uuid(),
  dueDate: z.iso.date().optional(),
  priority: z.enum(TASK_PRIORITY).optional(),
  notes: z.string().max(4000).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskInput>;

/**
 * Editing a task.
 *
 * **No `completedAt` and no `completedBy`.** They are derived from the status
 * by the server. `updateTask` in the legacy takes both as parameters and writes
 * them with no COALESCE (`tasks.js:247-248`), so any edit that is not a
 * completion erases the record of one that was (TASK-02).
 */
export const updateTaskInput = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  assignedTo: z.uuid(),
  dueDate: z.iso.date().optional(),
  priority: z.enum(TASK_PRIORITY),
  status: z.enum(TASK_STATUS),
  notes: z.string().max(4000).optional(),
  expectedVersion: z.number().int().min(1),
});
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

export const task = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  entityName: z.string(),
  projectId: z.uuid().nullable(),
  assignedTo: z.uuid(),
  assignedBy: z.uuid(),
  dueDate: z.string().nullable(),
  /** Due before today and still open — the server's date comparison, so a screen never compares dates. */
  overdue: z.boolean(),
  priority: z.enum(TASK_PRIORITY),
  status: z.enum(TASK_STATUS),
  completedAt: z.string().nullable(),
  completedBy: z.uuid().nullable(),
  notes: z.string(),
  version: z.number().int(),
});
export type Task = z.infer<typeof task>;

/**
 * `summary` is computed over the WHOLE tenant's tasks, ignoring the current
 * filter and the cursor window — the stat row above the list ("N open, N due
 * today") is a fact about the tenant, not about one page of it.
 */
export const taskListResponse = pageOf(task).extend({
  summary: z.object({
    open: z.number().int(),
    dueToday: z.number().int(),
    overdue: z.number().int(),
    peopleWithOpenTasks: z.number().int(),
    overdueAssignees: z.array(z.uuid()),
    dueTodayAssignees: z.array(z.uuid()),
    entityTypes: z.array(z.string()),
  }),
});
export type TaskListResponse = z.infer<typeof taskListResponse>;

// ------------------------------------------------------------- documents --

/**
 * Registering a document.
 *
 * **There is no `fileData` field, and that is the design.** `attachments`
 * stores `file_data TEXT NOT NULL` — base64 bytes in a row — so every list
 * query carries every payload and every backup carries them again (VAULT-02).
 * Bytes go to object storage; this records what is there.
 *
 * There is no `objectKey` either: the key is built server-side from the tenant
 * and a fresh document id, so a caller cannot place an object outside its own
 * prefix.
 */
export const registerDocumentInput = z.object({
  entityType: z.string().min(1).max(60),
  entityId: z.string().min(1).max(120),
  fileName: z.string().min(1).max(300),
  contentType: z.string().min(1).max(160),
  sizeBytes: z.number().int().min(1).max(52_428_800),
  /** sha256 of the bytes, so a re-upload is detectable and an archive verifiable. */
  checksum: z.string().regex(/^[0-9a-f]{64}$/, "checksum must be a sha256 hex digest"),
  /** The project this belongs to, when the record it hangs off is not itself a project. */
  projectId: z.uuid().nullable().optional(),
});
export type RegisterDocumentInput = z.infer<typeof registerDocumentInput>;

export const documentRecord = z.object({
  id: z.uuid(),
  entityType: z.string(),
  entityId: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  checksum: z.string(),
  objectKey: z.string(),
  uploadedBy: z.uuid(),
  createdAt: z.string(),
  /** The project it belongs to — its own, or stamped at registration — or null. */
  projectId: z.uuid().nullable(),
});
export type DocumentRecord = z.infer<typeof documentRecord>;

/** `byFolder` is grouped by the real `entityType` value, over the whole vault, sorted busiest first. */
export const documentListResponse = pageOf(documentRecord).extend({
  summary: z.object({
    total: z.number().int(),
    byFolder: z.array(z.object({ folder: z.string(), count: z.number().int() })),
  }),
});
export type DocumentListResponse = z.infer<typeof documentListResponse>;

export const decideApprovalInput = z.object({
  remarks: z.string().max(2000).optional(),
});
export type DecideApprovalInput = z.infer<typeof decideApprovalInput>;

/**
 * What one approval decision did.
 *
 * `outcome` is the engine's word for it, `stage` is where the chain now sits
 * and `complete` says whether the last stage has been cleared. Nothing here is
 * a permission the screen may act on: the next decision is refused or accepted
 * by the same endpoint, not predicted by the client. The legacy predicts it —
 * `POListTable.js:170` shows "Approve" when `canApprove` is true, and
 * `canApprove` is derived in the browser from an email (`POsView.js:136`).
 */
export const approvalDecisionResponse = z.object({
  entityId: z.string(),
  outcome: z.string(),
  stage: z.string(),
  complete: z.boolean(),
});
export type ApprovalDecisionResponse = z.infer<typeof approvalDecisionResponse>;

/** Declining needs a reason: the requester reads it, and a "no" without one teaches nothing. */
export const declineApprovalInput = z.object({
  remarks: z.string().trim().min(1).max(2000),
});
export type DeclineApprovalInput = z.infer<typeof declineApprovalInput>;

// ---------------------------------------------- comments and notifications --

export const COMMENTABLE_ENTITIES = ['project', 'purchase_order', 'change_order', 'boq_item'] as const;

/**
 * A person's remark about a record.
 *
 * Separate from `approvalHistoryEntry` and from the audit trail on purpose: one
 * records what the system did and is evidence, this records what somebody said
 * and can be corrected.
 */
export const recordComment = z.object({
  id: z.uuid(),
  entityType: z.enum(COMMENTABLE_ENTITIES),
  entityId: z.uuid(),
  parentId: z.uuid().nullable(),
  authorId: z.uuid(),
  authorEmail: z.string(),
  body: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
});
export type RecordComment = z.infer<typeof recordComment>;

export const recordCommentsResponse = z.object({ items: z.array(recordComment) });
export type RecordCommentsResponse = z.infer<typeof recordCommentsResponse>;

export const addCommentInput = z.object({
  body: z.string().min(1).max(4000),
  parentId: z.uuid().optional(),
  mentions: z.array(z.uuid()).max(20).optional(),
});
export type AddCommentInput = z.infer<typeof addCommentInput>;

/**
 * One notification. **A row and a read state — no channel.**
 *
 * Email, push, digests and preferences are deliberately absent: they need a
 * decision about how this company talks to its people that has not been made,
 * whereas "an approval is waiting for you" is useful the moment it is
 * queryable.
 */
export const notification = z.object({
  id: z.uuid(),
  kind: z.enum(['approval_requested', 'approval_decided', 'comment_mentioned']),
  summary: z.string(),
  entityType: z.enum(COMMENTABLE_ENTITIES),
  entityId: z.uuid(),
  /** Who acted — the submitter, the approver, the author — named. `null` when none is on file. */
  actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notification>;

export const markAllNotificationsReadResponse = z.object({ marked: z.number().int().min(0) });
export type MarkAllNotificationsReadResponse = z.infer<typeof markAllNotificationsReadResponse>;

/** `unread` is the caller's total unread count, independent of `unread=true` narrowing the window. */
export const notificationsResponse = pageOf(notification).extend({
  unread: z.number().int(),
});
export type NotificationsResponse = z.infer<typeof notificationsResponse>;
