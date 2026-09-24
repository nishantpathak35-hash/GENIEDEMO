/**
 * `services/projects` — project master, CRM, BOQ, estimation, takeoff.
 *
 * `rate-analysis-legacy.ts` is deliberately NOT exported. It reproduces the
 * legacy engine including its defects, as commit 1 of the two-commit port
 * protocol (ADR-0014 decision 5), and exists to be compared against rather than
 * called. `docs/ports/cpwd-rate-engine.md` records why.
 */

export {
  analyseRate,
  lineAmount,
  type RateAnalysisInput,
  type RateAnalysis,
} from './domain/rate-analysis.js';

export {
  lineAmount as boqLineAmount,
  boqTotals,
  fromEstimationItem,
  assertLinesUnique,
  BoqError,
  type BoqLine,
  type BoqTotals,
} from './domain/boq.js';

export {
  decide,
  submitToClient,
  contractValue,
  ChangeOrderError,
  CO_STATES,
  type ChangeOrder,
  type ChangeOrderState,
  type ClientDecision,
  type ContractValue,
} from './domain/change-order.js';

export {
  orderQuantity,
  lineValue as takeoffLineValue,
  summarise as summariseTakeoff,
  assertExportable,
  TakeoffError,
  type TakeoffItem,
  type TakeoffLineValue,
  type TakeoffSummary,
} from './domain/takeoff.js';

export { projectRoutes } from './api/routes.js';

export {
  contractCeilingCandidate,
  orderedSoFar,
  rankToday,
  projectCommitmentRows,
  ABSENT_CANDIDATES,
  type ProjectCommitmentRow,
  type TodayInputs,
} from './domain/today.js';

export {
  projectFinancials,
  projectHealth,
  committedSpend,
  healthThreshold,
  DEFAULT_AT_RISK_PCT,
  DEFAULT_HEALTH_THRESHOLD,
  HealthThresholdError,
  type HealthThreshold,
  type ProjectFinancialsInput,
  type ProjectFinancials,
  type ProjectHealth,
} from './domain/project-financials.js';

export {
  addBoqLines,
  updateBoqLine,
  deleteBoqLine,
  BoqLineInUse,
  BoqLineNotFound,
  DuplicateBoqLine,
  ProjectNotFound,
  type BoqLineInputLike,
  type WrittenLine,
} from './application/boq-writes.js';

export {
  loadOrderableBoqLines,
  BoqLineNotOrderable,
  type OrderableBoqLine,
} from './application/boq-order.js';

export {
  listLeads,
  getLead,
  createLead,
  updateLead,
  deleteLead,
  convertLead,
  LeadNotFound,
  LeadStaleWrite,
  LeadReferentNotFound,
  LeadNotConvertible,
} from './application/leads.js';

export { pipelineTotals, type PipelineTotals, type PipelineLine } from './domain/pipeline.js';
export { PROJECT_STATES, canMove, dateStampedBy, nextStates } from './domain/project-state.js';
export { READ_ONLY_STATES, ProjectReadOnly, assertProjectOpen, projectStateOf } from './application/project-guard.js';

export {
  listProjectBudgets,
  loadHealthThreshold,
  buildProjectRollup,
  type ProjectBudgetRow,
} from './application/rollup.js';
export { listBoqCostBudgets, marginAtRiskSummary } from './application/cost-budgets.js';
export {
  unsignedVariations,
  readPipelineSummary,
  milestonesThisWeek,
  type UnsignedVariation,
  type UnsignedVariations,
  type MilestoneThisWeek,
  type MilestonesThisWeek,
} from './application/dashboard.js';
export { pipelineSummary, type PipelineLead, type PipelineSlice, type PipelineSummary } from './domain/pipeline.js';

export {
  listChangeOrders,
  getChangeOrder,
  createChangeOrder,
  submitChangeOrder,
  decideChangeOrder,
  derivedContractValue,
  ChangeOrderNotFound,
  ChangeOrderConflict,
  type StoredChangeOrder,
} from './application/change-orders.js';

export {
  listDrawings,
  issueDrawing,
  withdrawDrawing,
  DrawingNotFound,
  DrawingRefused,
} from './application/drawings.js';

export {
  listSheets,
  createSheet,
  saveItems,
  summariseSheet,
  TakeoffNotFound,
  TakeoffRefused,
} from './application/takeoff.js';

export {
  clientProjectSummary,
  clientVariations,
  clientDrawingCount,
  type ClientProject,
  type ClientVariation,
} from './application/client-view.js';

/**
 * What a lead accumulates while somebody works it: contacts, a timeline, a next
 * follow-up date, and a reason it was lost.
 */
export {
  listLeadContacts,
  addLeadContact,
  removeLeadContact,
  listLeadActivities,
  recordLeadActivity,
  markLeadLost,
  possibleDuplicates,
  LeadContactNotFound,
  LeadActivityRefused,
  type LeadContact,
  type LeadActivity,
} from './application/lead-depth.js';

export {
  listProjectTeam,
  addProjectMember,
  removeProjectMember,
  mayReadTeam,
  projectsFor,
  ProjectTeamError,
  NotOnThisProject,
  type ProjectMember,
  type AddMemberInput,
} from './application/project-team.js';

/**
 * Trade packages: the list `estimation_items.trade` and `boq_items.section`
 * are supposed to come from. Ships empty; nothing seeds a margin.
 */
export {
  projectMembershipsFor,
  projectNames,
  projectExists,
  type Membership,
} from './application/project-team.js';

export {
  listTradePackages,
  addTradePackage,
  updateTradePackage,
  TradePackageError,
  type TradePackage,
  type TradePackageInput,
} from './application/trade-packages.js';

/**
 * Merging duplicate opportunities. Recorded rather than silent: the legacy
 * marks the losing record Lost and keeps no note of what moved.
 */
export {
  mergeLeads,
  listLeadMerges,
  LeadMergeRefused,
  type MergeResult,
  type LeadMergeRecord,
} from './application/lead-merge.js';

/** Handing a won opportunity to delivery, and what was confirmed at the time. */
export {
  handOverLead,
  handoverForProject,
  HandoverRefused,
  type HandoverInput,
  type HandoverResult,
  // Renamed at the boundary: `HandoverRecord` is also the name of what workflow
  // 8 records when a finished job goes to the client, and the two are different
  // things — sales handing a won opportunity to delivery, and delivery handing
  // the building to the customer.
  type HandoverRecord as LeadHandoverRecord,
} from './application/lead-handover.js';

/**
 * Design-build workflow 1: the client brief.
 *
 * `briefRoutes` is mounted behind `moduleGate('design_brief')` in
 * `services/host`. It does not gate itself — whether a module is on lives
 * in `services/tenancy`, which this service may not read.
 */
export {
  briefRoutes,
  deliverableRoutes,
  selectionRoutes,
  substitutionRoutes,
  agreementRoutes,
  procurementPlanRoutes,
  joineryRoutes,
  milestoneRoutes,
  handoverRoutes,
  warrantyRoutes,
  timesheetRoutes,
  clientActionRoutes,
} from './api/design-build.js';
export {
  listBriefs,
  saveBrief,
  setBriefStatus,
  addStatement,
  removeStatement,
  saveRoom,
  removeRoom,
  BriefRefused,
  BRIEF_STATUSES,
  STATEMENT_KINDS,
  type ClientBrief,
  type BriefStatement,
  type BriefRoom,
  type BriefInput,
  type RoomInput,
} from './application/client-brief.js';

/** Design-build workflows 2 and 3. */
export {
  listDeliverables,
  addDeliverable,
  submitDeliverable,
  reviewDeliverable,
  DeliverableRefused,
  type DesignDeliverable,
  type DesignReview,
  type DeliverableInput,
} from './application/design-deliverables.js';

export {
  listSelections,
  addSelection,
  decideSelection,
  proposeSubstitution,
  decideSubstitution,
  SelectionRefused,
  type RoomSelection,
  type Substitution,
  type SelectionInput,
} from './application/room-selections.js';

/** Design-build workflows 4 and 5. */
export {
  getAgreement,
  saveAgreement,
  setStages,
  setAgreementStatus,
  AgreementRefused,
  type CommercialAgreement,
  type AgreementStage,
  type AgreementInput,
  type StageInput,
} from './application/commercial-agreement.js';

export {
  procurementPlan,
  type ProcurementPlan,
  type LeadTimeConflict,
} from './application/procurement-plan.js';

/** Design-build workflows 6 and 7. */
export {
  JOINERY_STAGES,
  listPackages,
  addPackage,
  advanceStage,
  JoineryRefused,
  type JoineryPackage,
  type JoineryStage,
  type PackageInput,
} from './application/joinery.js';

export {
  MILESTONE_STATUSES,
  listMilestones,
  addMilestone,
  recordProgress,
  MilestoneRefused,
  type DeliveryMilestone,
  type MilestoneInput,
  type ProgressInput,
} from './application/delivery-milestones.js';

/** Design-build workflows 8 and 9. */
export {
  handoverState,
  raiseItem,
  rectifyItem,
  issueHandover,
  HandoverItemRefused,
  type HandoverItem,
  type HandoverRecord,
  type HandoverState,
  type ItemInput,
} from './application/handover.js';

export {
  WARRANTY_STATUSES,
  listCases,
  raiseCase,
  decideCase,
  WarrantyRefused,
  type WarrantyCase,
  type CaseInput,
} from './application/warranty.js';

/** Design-build workflows 10 and 11. */
export {
  timesheets,
  bookTime,
  TimesheetRefused,
  type TimesheetEntry,
  type TimesheetView,
  type TimesheetInput,
} from './application/timesheets.js';

export {
  DECISION_CHANNELS,
  SUBJECT_KINDS,
  clientActions,
  recordExternalDecision,
  ClientActionRefused,
  type ClientActionItem,
  type ClientDecisionRecord,
  type ClientActionsView,
  type ExternalDecisionInput,
} from './application/client-actions.js';
export { pipelineOpenedByWeek } from './application/weekly.js';
export { indexSeries } from './domain/weekly-index.js';
export { agreedAgainstBoq, type AgreedAgainstBoq } from './domain/agreed-against-boq.js';
export { boqCostRatesByIds, agreedAgainstBoqCostRates } from './application/cost-budgets.js';
export { projectForInvoice, type InvoiceProject } from './application/invoicing.js';

/** The bar's search: this service's records by the words typed. */
export { searchProjects, searchLeads, type SearchHit } from './application/search.js';
