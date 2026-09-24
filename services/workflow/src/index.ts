/**
 * `services/workflow` — approvals, audit, document vault, realtime.
 *
 * Owns no business domain of its own. TOPOLOGY flags this as the service to
 * watch: if procurement or finance logic starts accumulating here, that is the
 * early warning that the old mess is re-forming.
 */

export {
  auditRecord,
  forJsonb,
  diff,
  type AuditEvent,
  type AuditRecord,
} from './domain/audit.js';

export {
  EVENT_CHANNEL,
  NOTIFY_PAYLOAD_LIMIT_BYTES,
  notificationPayload,
  parseNotification,
  isForTenant,
  assertPublishable,
  EventError,
  type DomainEvent,
  type EventNotification,
} from './domain/events.js';

export {
  approve,
  awaitingStage,
  isEntitled,
  validateChain,
  ApprovalError,
  type ApprovalStage,
  type Approval,
  type ChainState,
  type ApproveInput,
  type AdvanceOutcome,
  type RefusalReason,
} from './domain/approval.js';

export {
  objectKey,
  assertMaySign,
  assertAcceptable,
  VaultError,
  MAX_SIGNED_URL_TTL_SECONDS,
  MAX_DOCUMENT_BYTES,
  type DocumentRef,
  type SignedUrlRequest,
} from './domain/vault.js';

export {
  recordApproval,
  recordDecline,
  loadStages,
  loadApprovals,
  assertChainConfigured,
  ApprovalRefused,
  type RecordApprovalInput,
  type TxLike,
} from './application/approve-in-transaction.js';

export { workflowRoutes } from './api/routes.js';

export {
  listTasks,
  taskSummary,
  createTask,
  getTask,
  updateTask,
  deleteTask,
  TaskNotFound,
  TaskStaleWrite,
  TaskReferentNotFound,
  type TaskFilter,
  type TaskSummary,
} from './application/tasks.js';

export {
  listDocuments,
  documentsFor,
  documentSummary,
  registerDocument,
  deleteDocument,
  DocumentNotFound,
  type DocumentFilter,
  type DocumentSummary,
} from './application/documents.js';

/** Configuring an approval chain — what turns the blocked approval screens on. */
export {
  configureChain,
  seedDefaultChains,
  type ConfigureChainInput,
} from './application/chains.js';

export {
  listComments,
  notifiableStaff,
  addComment,
  notify,
  listNotifications,
  markRead,
  markAllRead,
  unreadCount,
  CommentError,
  COMMENTABLE,
  NOTIFICATION_KINDS,
  type RecordComment,
  type AddCommentInput,
  type Notification,
  type NotifyInput,
  type EntityType,
  type NotificationKind,
} from './application/comments.js';

/** A person's working state — preferences, the records they opened last, saved views — theirs, on the server. */
export { DEFAULT_PREFERENCES, readPreferences, updatePreferences, type Preferences } from './application/preferences.js';
export {
  HISTORY_KEEP,
  HISTORY_KINDS,
  recordOpened,
  recentHistory,
  recentProjects,
  type HistoryEntry,
  type HistoryKind,
  type RecordOpened,
} from './application/recent-history.js';
export {
  listSavedViews,
  createSavedView,
  deleteSavedView,
  SavedViewNameTaken,
  SavedViewNotFound,
  type SavedView,
} from './application/saved-views.js';
