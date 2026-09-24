import { z } from 'zod';
import {
  acknowledgeBillInput,
  billListResponse,
  payBillInput,
  paymentListResponse,
  staffBill,
  vendorPayment,
  vendorPortalPaymentListResponse,
  releaseRetentionInput,
  retentionPositionListResponse,
  tdsChallanResponse,
  form26QResponse,
  cancelClientInvoiceInput,
  clientInvoice,
  clientInvoiceListResponse,
  clientPortalBillingResponse,
  raiseClientInvoiceInput,
  recordClientReceiptInput,
  receivablesAgeingResponse,
  payablesAgeingResponse,
  moneyByMonthResponse,
} from './money.js';
import {
  addBoqLinesInput,
  boqItem,
  boqResponse,
  boqWriteResponse,
  changeOrder,
  unsignedVariationsResponse,
  pipelineSummaryResponse,
  contractValueResponse,
  createChangeOrderInput,
  createEstimationItemInput,
  createLeadInput,
  createProjectInput,
  setProjectStateInput,
  createTakeoffSheetInput,
  convertLeadInput,
  decideChangeOrderInput,
  drawingListResponse,
  estimationItem,
  estimationListResponse,
  gfcDrawing,
  issueDrawingInput,
  lead,
  pipelineResponse,
  project,
  projectListResponse,
  projectRollupResponse,
  rateCoverageResponse,
  rateLibraryResponse,
  saveTakeoffItemsInput,
  submitChangeOrderInput,
  takeoffSheet,
  takeoffSheetListResponse,
  takeoffSummary,
  updateBoqLineInput,
  updateLeadInput,
  leadContactListResponse,
  addLeadContactInput,
  leadActivityListResponse,
  recordLeadActivityInput,
  markLeadLostInput,
  possibleDuplicateResponse,
  clientPortalProjectListResponse,
  clientPortalVariationListResponse,
  changeOrder as clientPortalDecidedVariation,
  decideChangeOrderInput as clientDecideVariationInput,
  projectTeamResponse,
  addProjectMemberInput,
  tradePackageListResponse,
  tradePackageInput,
  updateTradePackageInput,
  tradePackageCreated,
  mergeLeadsInput,
  mergeLeadsResponse,
  leadMergeListResponse,
  handoverLeadInput,
  handoverLeadResponse,
} from './projects.js';
import {
  createInviteInput,
  invitesResponse,
  mintedInviteResponse,
  principalsResponse,
  tenantSettings,
  platformTenantListResponse,
  setTenantPlanInput,
  platformWhoamiResponse,
  provisionTenantInput,
  provisionedTenantResponse,
  provisioningEventListResponse,
  entitlementsResponse,
  roleListResponse,
  setRoleGrantsInput,
  addRoleInput,
  okResponse,
  configureChainInput,
  taxRateListResponse,
  recordTaxRateInput,
  tdsThresholdListResponse,
  loadStatutoryCatalogueResponse,
  configuredChainResponse,
  peopleResponse,
  clientAccountsResponse,
  grantClientProjectInput,
  vendorAccountsResponse,
  grantVendorInput,
} from './identity.js';
import {
  briefListResponse,
  clientBrief,
  saveBriefInput,
  setBriefStatusInput,
  addStatementInput,
  saveRoomInput,
  deliverableListResponse,
  addDeliverableInput,
  reviewDeliverableInput,
  reviewResult,
  selectionListResponse,
  addSelectionInput,
  decideSelectionInput,
  proposeSubstitutionInput,
  decideSubstitutionInput,
  substitutionResult,
  agreementResponse,
  saveAgreementInput,
  setStagesInput,
  setAgreementStatusInput,
  procurementPlanResponse,
  joineryListResponse,
  addPackageInput,
  advanceStageInput,
  advanceResult,
  milestoneListResponse,
  milestonesThisWeekResponse,
  addMilestoneInput,
  recordProgressInput,
  handoverStateResponse,
  handoverRecord,
  raiseItemInput,
  rectifyItemInput,
  issueHandoverInput,
  warrantyListResponse,
  raiseCaseInput,
  decideCaseInput,
  timesheetResponse,
  bookTimeInput,
  clientActionsResponse,
  externalDecisionInput,
} from './design-build.js';
import {
  moduleListResponse,
  terminologyResponse,
  saveTerminologyInput,
  setModuleInput,
  setModuleResponse,
  companyProfile,
  saveCompanyProfileInput,
  operationalDefaults,
  saveOperationalDefaultsInput,
  taxSetup,
  saveTaxSetupInput,
} from './tenancy.js';
import {
  createDailyReportInput,
  siteIssueListResponse,
  raiseSiteIssueInput,
  resolveSiteIssueInput,
  siteTodayResponse,
  createRecceInput,
  dailyReport,
  dailyReportsResponse,
  imprest,
  imprestListResponse,
  measurement,
  measurementListResponse,
  recce,
  recceListResponse,
  reconcileImprestInput,
  recordMeasurementInput,
  requestImprestInput,
  sanctionImprestInput,
  weeklyAggregateResponse,
} from './siteops.js';
import {
  approvalChainsResponse,
  approvalDecisionResponse,
  approvalHistoryResponse,
  auditResponse,
  createTaskInput,
  decideApprovalInput,
  declineApprovalInput,
  documentListResponse,
  documentRecord,
  registerDocumentInput,
  task,
  taskListResponse,
  updateTaskInput,
  recordCommentsResponse,
  notificationsResponse,
  markAllNotificationsReadResponse,
} from './workflow.js';
import {
  blockedApprovalsStat,
  cashAgainstPayablesStat,
  marginAtRiskStat,
  spendByTradeResponse,
  todayHeroResponse,
  todaySetupResponse,
  weeklySeriesResponse,
} from './today.js';
import {
  createSavedViewInput,
  myProjectsResponse,
  preferencesResponse,
  quickCreateResponse,
  searchResponse,
  recentHistoryResponse,
  recordOpenedInput,
  savedView,
  savedViewsResponse,
  shellCountsResponse,
  updatePreferencesInput,
} from './shell.js';
import {
  createdId,
  createPurchaseOrderFromBoqInput,
  createPurchaseOrderInput,
  createStockItemInput,
  createVendorInput,
  rateContractDetail,
  rateContractInput,
  rateContractsResponse,
  rateDeviationsResponse,
  purchaseOrderLinesResponse,
  purchaseOrderFromBoqResponse,
  purchaseOrderListResponse,
  purchaseOrderListItem,
  purchaseOrderNumberPreview,
  purchaseOrderTotalsResponse,
  purchaseOrderWriteResponse,
  recordRetentionInput,
  renamePurchaseOrderInput,
  retentionHolding,
  retentionListResponse,
  stockItemListResponse,
  stockListResponse,
  costingPolicyResponse,
  stockMovementInput,
  awaitingReceiptListResponse,
  stockLocationListResponse,
  createStockLocationInput,
  stockTransferInput,
  stockTransferResponse,
  updatePurchaseOrderInput,
  submitPurchaseOrderInput,
  purchaseOrderStateResponse,
  numberSeriesListResponse,
  saveNumberSeriesInput,
  updateVendorInput,
  vendorTdsProfileInput,
  recordTransporterDeclarationInput,
  transporterDeclaration,
  transporterDeclarationListResponse,
  vendor,
  vendorListResponse,
  whoamiResponse,
  acceptOrderInput,
  orderAcceptanceResponse,
  submitBillInput,
  submittedBillResponse,
  vendorBillListResponse,
  vendorPortalLineListResponse,
  vendorPortalOrderListResponse,
  portalWhoamiResponse,
} from './purchase-orders.js';

/**
 * The route table — every endpoint an app may call, declared once.
 *
 * A descriptor carries the method, the path, the request schema and the
 * response schema. **Both the client and the service mount from the same
 * descriptor**, so a change to a shape is a compile error on both sides rather
 * than a runtime surprise on one.
 *
 * This replaces what the legacy calls an API: a single `/api/rpc` endpoint
 * dispatching on a 217-name string allowlist, where the shape of every call was
 * a runtime check for something the compiler should have caught.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteDescriptor<
  Req extends z.ZodTypeAny | undefined,
  Res extends z.ZodTypeAny,
  Path extends string = string,
> {
  readonly method: HttpMethod;
  readonly path: Path;
  /** `undefined` for a route with no body. */
  readonly request: Req;
  readonly response: Res;
  /** Why this route exists, in one line. Shown in no UI; read by the next developer. */
  readonly summary: string;
}

export function defineRoute<
  Req extends z.ZodTypeAny | undefined,
  Res extends z.ZodTypeAny,
  Path extends string,
>(descriptor: RouteDescriptor<Req, Res, Path>): RouteDescriptor<Req, Res, Path> {
  return descriptor;
}

/**
 * Path parameter names, extracted from the path at the type level.
 *
 * `/api/v1/projects/:id/boq` yields `'id'`, so calling it without an `id` is a
 * compile error rather than a request to a URL with a literal `:id` in it.
 */
export type PathParams<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | PathParams<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

/**
 * The body of a 204.
 *
 * The client turns an empty body into `null` before parsing, so a route that
 * answers "done, nothing to say" still goes through the same parse as every
 * other route rather than being special-cased out of it.
 */
export const noContent = z.null();

export const API_ROUTES = {
  /**
   * Price a draft purchase order without saving it.
   *
   * The endpoint that makes ADR-0014's authority inversion real. The legacy
   * computes totals in the browser for display (`POsView.js`) and again on the
   * server at save, and the two disagree. One endpoint, one answer.
   */
  pricePurchaseOrder: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/price',
    request: createPurchaseOrderInput,
    response: purchaseOrderTotalsResponse,
    summary: 'Server-computed totals for a draft purchase order.',
  }),

  listPurchaseOrders: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders',
    request: undefined,
    response: purchaseOrderListResponse,
    summary: 'Purchase orders for the resolved tenant. RLS applies the filter.',
  }),

  listProjects: defineRoute({
    method: 'GET',
    path: '/api/v1/projects',
    request: undefined,
    response: projectListResponse,
    summary: 'Projects for the resolved tenant. RLS applies the filter.',
  }),

  createProject: defineRoute({
    method: 'POST',
    path: '/api/v1/projects',
    request: createProjectInput,
    response: project,
    summary: 'Create a project. The id is issued by the server, never supplied.',
  }),

  getProject: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/:projectId',
    request: undefined,
    response: project,
    summary: 'One project by id — never by name (TOPOLOGY defect 1).',
  }),

  setProjectState: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/:projectId/state',
    request: setProjectStateInput,
    response: project,
    summary: 'Move a project to its next state; the server stamps started/handed-over dates.',
  }),

  projectBoq: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/:projectId/boq',
    request: undefined,
    response: boqResponse,
    summary: 'BOQ lines with server-computed line amounts and totals.',
  }),

  /**
   * A project's team.
   *
   * Answers 404 rather than 403 for a project the caller is not on: a 403 would
   * confirm the project exists and that somebody else is on it.
   */
  projectTeam: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/:projectId/team',
    request: undefined,
    response: projectTeamResponse,
    summary: 'Who is on a project. Scoped by membership, not by tenant alone.',
  }),

  recordComments: defineRoute({
    method: 'GET',
    path: '/api/v1/records/:entityType/:entityId/comments',
    request: undefined,
    response: recordCommentsResponse,
    summary: 'What people said about a record. Not the audit trail.',
  }),

  /** The CALLER's notifications. There is no route that takes a recipient. */
  notifications: defineRoute({
    method: 'GET',
    path: '/api/v1/notifications',
    request: undefined,
    response: notificationsResponse,
    summary: "The signed-in person's inbox, and their unread count.",
  }),

  /** Mark one of the CALLER's notifications read. Someone else's is not found. */
  markNotificationRead: defineRoute({
    method: 'POST',
    path: '/api/v1/notifications/:id/read',
    request: undefined,
    response: noContent,
    summary: "Mark one of the caller's notifications read; another person's is not found.",
  }),

  markAllNotificationsRead: defineRoute({
    method: 'POST',
    path: '/api/v1/notifications/read-all',
    request: undefined,
    response: markAllNotificationsReadResponse,
    summary: "Mark every unread notification of the caller's read. Returns how many moved.",
  }),

  approvalChains: defineRoute({
    method: 'GET',
    path: '/api/v1/workflow/chains',
    request: undefined,
    response: approvalChainsResponse,
    // Bounded configuration — a handful of chains per tenant, never a screen's
    // worth of a feed — so this is not paged.
    summary: 'Configured approval chains. Every field shown is one the engine evaluates.',
  }),

  approvalHistory: defineRoute({
    method: 'GET',
    path: '/api/v1/workflow/history/:entityType/:entityId',
    request: undefined,
    response: approvalHistoryResponse,
    summary: 'Append-only decision history for one entity.',
  }),

  auditSearch: defineRoute({
    method: 'GET',
    path: '/api/v1/workflow/audit',
    request: undefined,
    response: auditResponse,
    summary: 'Audit events, including who was impersonating whom.',
  }),

  listDailyReports: defineRoute({
    method: 'GET',
    path: '/api/v1/siteops/daily-reports',
    request: undefined,
    response: dailyReportsResponse,
    summary: 'Daily progress reports for the resolved tenant.',
  }),

  createDailyReport: defineRoute({
    method: 'POST',
    path: '/api/v1/siteops/daily-reports',
    request: createDailyReportInput,
    response: dailyReport,
    summary: 'Record a daily progress report and its manpower.',
  }),

  siteToday: defineRoute({
    method: 'GET',
    path: '/api/v1/siteops/today',
    request: undefined,
    response: siteTodayResponse,
    summary: 'Today across every site: people on site, sites reporting, issues open. ?date= for another day.',
  }),

  listSiteIssues: defineRoute({
    method: 'GET',
    path: '/api/v1/siteops/issues',
    request: undefined,
    response: siteIssueListResponse,
    summary: 'Site issues, newest raised first. ?projectId=, ?status=open|resolved|all (open by default).',
  }),

  raiseSiteIssue: defineRoute({
    method: 'POST',
    path: '/api/v1/siteops/issues',
    request: raiseSiteIssueInput,
    response: createdId,
    summary: "Raise an issue on a project. Another tenant's project is not found.",
  }),

  resolveSiteIssue: defineRoute({
    method: 'POST',
    path: '/api/v1/siteops/issues/:issueId/resolve',
    request: resolveSiteIssueInput,
    response: noContent,
    summary: 'Resolve an open issue; a resolved one is refused with CONFLICT.',
  }),

  weeklyAggregate: defineRoute({
    method: 'GET',
    path: '/api/v1/siteops/weekly/:projectId',
    request: undefined,
    response: weeklyAggregateResponse,
    summary: 'Weekly aggregate with its missing days named and its denominator stated.',
  }),

  listPrincipals: defineRoute({
    method: 'GET',
    path: '/api/v1/identity/principals',
    request: undefined,
    response: principalsResponse,
    summary: 'People in the resolved tenant. Never returns an external id.',
  }),

  listInvites: defineRoute({
    method: 'GET',
    path: '/api/v1/identity/invites',
    request: undefined,
    response: invitesResponse,
    summary: 'Outstanding invitations. Never returns a token or its hash.',
  }),

  createInvite: defineRoute({
    method: 'POST',
    path: '/api/v1/identity/invites',
    request: createInviteInput,
    response: mintedInviteResponse,
    summary: 'Mint an invite. The URL is returned once and never again.',
  }),

  /**
   * PO-13's answer, as an API.
   *
   * `myEntitlements` is the one every screen calls before rendering a control.
   * The rest edit the model, and each is refused without the matching
   * administrative permission — the server decides, the screen displays.
   */
  myEntitlements: defineRoute({
    method: 'GET',
    path: '/api/v1/identity/me/entitlements',
    request: undefined,
    response: entitlementsResponse,
    summary: 'What the signed-in person may reach and do. Never derived client-side.',
  }),

  listRoles: defineRoute({
    method: 'GET',
    path: '/api/v1/identity/roles',
    request: undefined,
    response: roleListResponse,
    summary: 'The role catalog with its grants, and whether any is still provisional.',
  }),

  /**
   * Which optional modules this organisation has switched on.
   *
   * Readable by any staff principal: what a company uses is not a secret from
   * the people using it, and hiding the list only means nobody knows what to
   * ask for.
   */
  /**
   * The organisation's registered details.
   *
   * Readable by any staff principal: it is what goes on the top of every
   * document they raise. Writing needs "manage_settings".
   */
  /**
   * Everybody in the organisation, with their roles and their projects.
   *
   * Composition: the people are `identity`, the projects they are on are
   * `projects`, and only the host may read both.
   */
  /**
   * Fold a duplicate opportunity into this one.
   *
   * Nothing is deleted and nothing is summed. The losing record keeps its
   * row and takes the stage `merged`, which is not an outcome — the legacy
   * marks it Lost, so every tidied duplicate counts against the win rate.
   */
  mergeLeads: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/leads/:leadId/merge',
    request: mergeLeadsInput,
    response: mergeLeadsResponse,
    summary: 'Merge another opportunity into this one. Recorded, not silent.',
  }),

  /**
   * Hand a won opportunity to delivery.
   *
   * Creates the project, marks the opportunity won against it and records
   * what was confirmed — one statement, because any two of the three
   * without the third is a state somebody cleans up by hand.
   */
  // ── design-build workflow 1: the client brief —
  //
  // Every route under `/api/v1/design-build` is behind `moduleGate` and
  // answers 404 when the module is off. Not 403: a module a tenant never
  // enabled has no permission question to answer.
  briefsForProject: defineRoute({
    method: 'GET',
    path: '/api/v1/design-build/brief/projects/:projectId',
    request: undefined,
    response: briefListResponse,
    summary: 'Every version of a project brief, newest first. Superseded versions included.',
  }),

  saveBrief: defineRoute({
    method: 'PUT',
    path: '/api/v1/design-build/brief/projects/:projectId',
    request: saveBriefInput,
    response: clientBrief,
    summary: 'Write the brief. An acknowledged version is superseded, never edited.',
  }),

  setBriefStatus: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/brief/:briefId/status',
    request: setBriefStatusInput,
    response: clientBrief,
    summary: 'Issue it, or record that the client acknowledged it. Acknowledgement freezes it.',
  }),

  addBriefStatement: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/brief/:briefId/statements',
    request: addStatementInput,
    response: createdId,
    summary: 'Add a decision maker, a client-supplied item, an assumption or an exclusion.',
  }),

  saveBriefRoom: defineRoute({
    method: 'PUT',
    path: '/api/v1/design-build/brief/:briefId/rooms',
    request: saveRoomInput,
    response: createdId,
    summary: 'Add or update a room on the brief. Refused once the client has acknowledged it.',
  }),

  handoverLead: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/leads/:leadId/handover',
    request: handoverLeadInput,
    response: handoverLeadResponse,
    summary: 'Create the project and record what was confirmed. Scope and commercials are a gate.',
  }),

  leadMerges: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/leads/:leadId/merges',
    request: undefined,
    response: leadMergeListResponse,
    summary: 'What was merged into this record, and what those records held.',
  }),

  // ── design-build workflow 2: deliverables and review ──
  deliverablesForProject: defineRoute({
    method: 'GET',
    path: '/api/v1/design-build/deliverables/projects/:projectId',
    request: undefined,
    response: deliverableListResponse,
    summary: 'Drawings and views issued for review, with every review of each.',
  }),

  addDeliverable: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/deliverables/projects/:projectId',
    request: addDeliverableInput,
    response: createdId,
    summary: 'Add a deliverable. No revision limit is defaulted.',
  }),

  submitDeliverable: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/deliverables/:deliverableId/submit',
    request: undefined,
    response: okResponse,
    summary: 'Issue it for review.',
  }),

  reviewDeliverable: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/deliverables/:deliverableId/review',
    request: reviewDeliverableInput,
    response: reviewResult,
    summary: 'Record a review. A revision past an AGREED limit is flagged, never priced.',
  }),

  // ── design-build workflow 3: room selections ──
  selectionsForProject: defineRoute({
    method: 'GET',
    path: '/api/v1/design-build/selections/projects/:projectId',
    request: undefined,
    response: selectionListResponse,
    summary: 'What goes in each room, and every alternative proposed against it.',
  }),

  addSelection: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/selections/projects/:projectId',
    request: addSelectionInput,
    response: createdId,
    summary: 'Propose an item for a room.',
  }),

  decideSelection: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/selections/:selectionId/decide',
    request: decideSelectionInput,
    response: okResponse,
    summary: 'The client answer. Approving freezes it; anything else unfreezes it.',
  }),

  proposeSubstitution: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/selections/:selectionId/substitutions',
    request: proposeSubstitutionInput,
    response: createdId,
    summary: 'Propose an alternative to a frozen selection, with its price and lead-time impact.',
  }),

  decideSubstitution: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/substitutions/:substitutionId/decide',
    request: decideSubstitutionInput,
    response: substitutionResult,
    summary: 'Approve or refuse it. Approving applies the delta exactly once.',
  }),

  // ── design-build workflow 4: the commercial agreement ──
  agreementForProject: defineRoute({
    method: 'GET',
    path: '/api/v1/design-build/agreement/projects/:projectId',
    request: undefined,
    response: agreementResponse,
    summary: 'The contract value and the stages that release it, with each stage amount computed.',
  }),

  saveAgreement: defineRoute({
    method: 'PUT',
    path: '/api/v1/design-build/agreement/projects/:projectId',
    request: saveAgreementInput,
    response: okResponse,
    summary: 'Write it. No deposit, validity or revision-count defaults exist to write.',
  }),

  setAgreementStages: defineRoute({
    method: 'PUT',
    path: '/api/v1/design-build/agreement/projects/:projectId/stages',
    request: setStagesInput,
    response: okResponse,
    summary: 'Replace the payment schedule. Sent in full: the rule is about the set.',
  }),

  setAgreementStatus: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/agreement/projects/:projectId/status',
    request: setAgreementStatusInput,
    response: okResponse,
    summary: 'Issue or sign it. Signing requires the stages to total exactly 100%.',
  }),

  // ── design-build workflow 5: procurement planning ──
  procurementPlan: defineRoute({
    method: 'GET',
    path: '/api/v1/design-build/procurement-plan/projects/:projectId',
    request: undefined,
    response: procurementPlanResponse,
    summary: 'Long-lead items, and the ones that cannot arrive before the target date.',
  }),

  // ── design-build workflow 6: joinery packages ──
  joineryForProject: defineRoute({
    method: 'GET',
    path: '/api/v1/design-build/joinery/projects/:projectId',
    request: undefined,
    response: joineryListResponse,
    summary: 'Joinery packages and their nine stages, in order.',
  }),

  addJoineryPackage: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/joinery/projects/:projectId',
    request: addPackageInput,
    response: createdId,
    summary: 'Start a package. Its nine stages are written with it.',
  }),

  advanceJoineryStage: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/joinery/stages/:stageId/complete',
    request: advanceStageInput,
    response: advanceResult,
    summary: 'Sign a stage off. Refused while an earlier stage is outstanding.',
  }),

  // ── design-build workflow 7: delivery milestones ──
  milestonesThisWeek: defineRoute({
    method: 'GET',
    path: '/api/v1/design-build/milestones/this-week',
    request: undefined,
    response: milestonesThisWeekResponse,
    summary: 'Every milestone planned to finish this week or already delayed, firm-wide, by project.',
  }),

  milestonesForProject: defineRoute({
    method: 'GET',
    path: '/api/v1/design-build/milestones/projects/:projectId',
    request: undefined,
    response: milestoneListResponse,
    summary: 'Site milestones, with the fortnight lookahead and lateness computed.',
  }),

  addMilestone: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/milestones/projects/:projectId',
    request: addMilestoneInput,
    response: createdId,
    summary: 'Add a milestone.',
  }),

  recordMilestoneProgress: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/milestones/:milestoneId/progress',
    request: recordProgressInput,
    response: okResponse,
    summary: 'Move it on. A delay carries a reason, in the route and in the database.',
  }),

  // ── design-build workflow 8: handover ──
  handoverForProject: defineRoute({
    method: 'GET',
    path: '/api/v1/design-build/handover/projects/:projectId',
    request: undefined,
    response: handoverStateResponse,
    summary: 'The punch list, whether it has been handed over, and what is blocking it.',
  }),

  raiseHandoverItem: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/handover/projects/:projectId/items',
    request: raiseItemInput,
    response: createdId,
    summary: 'Raise a snag or a defect. Severity is stated, never defaulted.',
  }),

  rectifyHandoverItem: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/handover/items/:itemId/rectify',
    request: rectifyItemInput,
    response: okResponse,
    summary: 'Mark it fixed. The after-photo is required — a tick is not evidence.',
  }),

  issueHandover: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/handover/projects/:projectId/issue',
    request: issueHandoverInput,
    response: handoverRecord,
    summary: 'Hand it over. Refused while any critical item is still open.',
  }),

  // ── design-build workflow 9: warranty ──
  warrantyForProject: defineRoute({
    method: 'GET',
    path: '/api/v1/design-build/warranty/projects/:projectId',
    request: undefined,
    response: warrantyListResponse,
    summary: 'Warranty claims, with overdue computed from a promised date somebody set.',
  }),

  raiseWarrantyCase: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/warranty/projects/:projectId',
    request: raiseCaseInput,
    response: createdId,
    summary: 'Raise a claim. No SLA, category or contractor is invented for it.',
  }),

  decideWarrantyCase: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/warranty/:caseId/decide',
    request: decideCaseInput,
    response: okResponse,
    summary: 'Move it on or close it. Closing needs notes.',
  }),

  // ── design-build workflow 10: design timesheets ──
  timesheetsForProject: defineRoute({
    method: 'GET',
    path: '/api/v1/design-build/timesheets/projects/:projectId',
    request: undefined,
    response: timesheetResponse,
    summary: 'Time booked against a job, in whole minutes, per person.',
  }),

  bookTime: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/timesheets/projects/:projectId',
    request: bookTimeInput,
    response: createdId,
    summary: "Book your own time. There is no field for somebody else's.",
  }),

  // ── design-build workflow 11: client action items ──
  clientActionsForProject: defineRoute({
    method: 'GET',
    path: '/api/v1/design-build/client-actions/projects/:projectId',
    request: undefined,
    response: clientActionsResponse,
    summary: 'What the client is holding up, and decisions recorded from elsewhere.',
  }),

  recordExternalDecision: defineRoute({
    method: 'POST',
    path: '/api/v1/design-build/client-actions/projects/:projectId',
    request: externalDecisionInput,
    response: createdId,
    summary: 'Record a decision made on WhatsApp, in a meeting or on the phone, and apply it.',
  }),

  people: defineRoute({
    method: 'GET',
    path: '/api/v1/settings/people',
    request: undefined,
    response: peopleResponse,
    summary: 'Staff, their tenant-wide roles, and the projects they are on.',
  }),

  clientAccounts: defineRoute({
    method: 'GET',
    path: '/api/v1/settings/client-accounts',
    request: undefined,
    response: clientAccountsResponse,
    summary: 'Client portal logins and exactly which projects each one may see.',
  }),

  grantClientProject: defineRoute({
    method: 'POST',
    path: '/api/v1/settings/client-accounts/:principalId/projects',
    request: grantClientProjectInput,
    response: okResponse,
    summary: 'Let a client login see one more project. Needs "manage_users".',
  }),

  revokeClientProject: defineRoute({
    method: 'DELETE',
    path: '/api/v1/settings/client-accounts/:principalId/projects/:projectId',
    request: undefined,
    response: okResponse,
    summary: 'Take a project away from a client login. Needs "manage_users".',
  }),

  vendorAccounts: defineRoute({
    method: 'GET',
    path: '/api/v1/settings/vendor-accounts',
    request: undefined,
    response: vendorAccountsResponse,
    summary: 'Vendor portal logins and exactly which vendors each one represents.',
  }),

  grantVendor: defineRoute({
    method: 'POST',
    path: '/api/v1/settings/vendor-accounts/:principalId/vendors',
    request: grantVendorInput,
    response: okResponse,
    summary: 'Let a vendor login see one more vendor’s orders. Needs "manage_users".',
  }),

  revokeVendor: defineRoute({
    method: 'DELETE',
    path: '/api/v1/settings/vendor-accounts/:principalId/vendors/:vendorId',
    request: undefined,
    response: okResponse,
    summary: 'Take a vendor away from a vendor login. Needs "manage_users".',
  }),

  companyProfile: defineRoute({
    method: 'GET',
    path: '/api/v1/settings/company',
    request: undefined,
    response: companyProfile,
    summary: "The organisation's own GSTIN, PAN, address and bank. Nothing is seeded.",
  }),

  saveCompanyProfile: defineRoute({
    method: 'PUT',
    path: '/api/v1/settings/company',
    request: saveCompanyProfileInput,
    response: okResponse,
    summary: 'Save it. Needs "manage_settings". A blank tax field clears the value.',
  }),

  operationalDefaults: defineRoute({
    method: 'GET',
    path: '/api/v1/settings/operational',
    request: undefined,
    response: operationalDefaults,
    summary: 'Payment terms on a new order, and when an opportunity is called stale.',
  }),

  saveOperationalDefaults: defineRoute({
    method: 'PUT',
    path: '/api/v1/settings/operational',
    request: saveOperationalDefaultsInput,
    response: okResponse,
    summary: 'Save the operational defaults. Needs "manage_settings".',
  }),

  taxSetup: defineRoute({
    method: 'GET',
    path: '/api/v1/settings/tax-setup',
    request: undefined,
    response: taxSetup,
    summary: 'The two business questions on Settings › Tax and whether the review was completed. Flags, never rates.',
  }),

  saveTaxSetup: defineRoute({
    method: 'PUT',
    path: '/api/v1/settings/tax-setup',
    request: saveTaxSetupInput,
    response: taxSetup,
    summary: 'Answer the two questions. Needs "manage_settings". Records who and when.',
  }),

  completeTaxReview: defineRoute({
    method: 'POST',
    path: '/api/v1/settings/tax-setup/complete',
    request: undefined,
    response: taxSetup,
    summary: 'Mark the tax review read. Needs "manage_settings" and both answers; unlocks nothing.',
  }),

  terminology: defineRoute({
    method: 'GET',
    path: '/api/v1/settings/terminology',
    request: undefined,
    response: terminologyResponse,
    summary: "The words this organisation uses — one per pair. Read once per request by every screen's labels.",
  }),

  saveTerminology: defineRoute({
    method: 'PUT',
    path: '/api/v1/settings/terminology',
    request: saveTerminologyInput,
    response: terminologyResponse,
    summary: 'Choose a word for one or more pairs. Needs "manage_settings"; a word outside its pair is refused.',
  }),

  modules: defineRoute({
    method: 'GET',
    path: '/api/v1/settings/modules',
    request: undefined,
    response: moduleListResponse,
    summary: 'The optional modules and whether this organisation has each one on.',
  }),

  setModule: defineRoute({
    method: 'PUT',
    path: '/api/v1/settings/modules/:key',
    request: setModuleInput,
    response: setModuleResponse,
    summary: 'Switch one optional module on or off. Needs "manage_settings". Deletes nothing.',
  }),

  setRoleGrants: defineRoute({
    method: 'PUT',
    path: '/api/v1/identity/roles/:roleKey/grants',
    request: setRoleGrantsInput,
    response: okResponse,
    summary: 'Replace one role\u2019s grants. Needs "manage_users". Saving confirms the answer.',
  }),

  addRole: defineRoute({
    method: 'POST',
    path: '/api/v1/identity/roles',
    request: addRoleInput,
    response: okResponse,
    summary: 'Add a role the ten defaults do not carry. Needs "manage_users".',
  }),

  retireRole: defineRoute({
    method: 'DELETE',
    path: '/api/v1/identity/roles/:roleKey',
    request: undefined,
    response: okResponse,
    summary: 'Withdraw a role without deleting it \u2014 the approval history names it.',
  }),

  configureChain: defineRoute({
    method: 'PUT',
    path: '/api/v1/workflow/chains/:entityType',
    request: configureChainInput,
    response: configuredChainResponse,
    summary: 'Replace the active approval chain. Needs "manage_settings".',
  }),

  /**
   * The tax-rate table. **Read and write, and it computes nothing.**
   *
   * Every row written is provisional; no route marks one verified. CA-01..CA-08
   * are open, and the surface exists so that when they are answered the answer
   * lands somewhere that already carries an effective date and a statute.
   */
  listTaxRates: defineRoute({
    method: 'GET',
    path: '/api/v1/finance/tax-rates',
    request: undefined,
    response: taxRateListResponse,
    summary: 'Configured tax rates with their provenance. Provisional until a person promotes one with a CA name and date.',
  }),

  recordTaxRate: defineRoute({
    method: 'POST',
    path: '/api/v1/finance/tax-rates',
    request: recordTaxRateInput,
    response: createdId,
    summary: 'Record a PROVISIONAL rate. Only a person verifies one, with a CA name and date.',
  }),

  listTdsThresholds: defineRoute({
    method: 'GET',
    path: '/api/v1/finance/tds-thresholds',
    request: undefined,
    response: tdsThresholdListResponse,
    summary: 'TDS thresholds with their provenance. Provisional until a person promotes one.',
  }),

  loadStatutoryCatalogue: defineRoute({
    method: 'POST',
    path: '/api/v1/settings/tax/statutory-values',
    request: undefined,
    response: loadStatutoryCatalogueResponse,
    summary: 'Add the provisional statutory rates and thresholds this organisation lacks. Needs "manage_settings". Never writes verified.',
  }),

  tenantSettings: defineRoute({
    method: 'GET',
    path: '/api/v1/tenancy/settings',
    request: undefined,
    response: tenantSettings,
    summary: "The resolved tenant's own settings, including its app origin.",
  }),

  whoami: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/whoami',
    request: undefined,
    response: whoamiResponse,
    summary: 'What the tenant middleware resolved for this request.',
  }),

  // --- purchase orders and vendors --------------------------------------

  nextPurchaseOrderNumber: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/next-number',
    request: undefined,
    response: purchaseOrderNumberPreview,
    summary: 'Preview the next number WITHOUT reserving it — the name says so on purpose.',
  }),

  /**
   * The numbering formats this organisation uses.
   *
   * Driven by the catalogue of numbered documents rather than by the rows, so
   * a tenant that has never raised an order still sees the series it will use.
   */
  /**
   * The trades this organisation works in.
   *
   * Readable by any staff principal: it is what the estimating and BOQ
   * pickers offer, so every screen that groups work reads it.
   */
  tradePackages: defineRoute({
    method: 'GET',
    path: '/api/v1/settings/trade-packages',
    request: undefined,
    response: tradePackageListResponse,
    summary: 'The trade catalogue. Ships empty; nothing seeds a margin or a vendor.',
  }),

  addTradePackage: defineRoute({
    method: 'POST',
    path: '/api/v1/settings/trade-packages',
    request: tradePackageInput,
    response: tradePackageCreated,
    summary: 'Add a trade. Needs "manage_settings". The code is uppercased.',
  }),

  updateTradePackage: defineRoute({
    method: 'PUT',
    path: '/api/v1/settings/trade-packages/:tradePackageId',
    request: updateTradePackageInput,
    response: okResponse,
    summary: 'Edit or retire a trade. Needs "manage_settings". There is no delete.',
  }),

  numberSeries: defineRoute({
    method: 'GET',
    path: '/api/v1/settings/number-series',
    request: undefined,
    response: numberSeriesListResponse,
    summary: 'How each numbered document is named, and the next number in each series.',
  }),

  saveNumberSeries: defineRoute({
    method: 'PUT',
    path: '/api/v1/settings/number-series/:moduleType',
    request: saveNumberSeriesInput,
    response: okResponse,
    summary: 'Change a series format. Needs "manage_settings". The counter is not writable.',
  }),

  createPurchaseOrder: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders',
    request: createPurchaseOrderInput,
    response: purchaseOrderWriteResponse,
    summary: 'Raise a draft order. Totals are computed from the lines; no field carries money.',
  }),

  /**
   * Send a draft order for approval.
   *
   * Its absence was what made the approval chain unreachable: the engine has
   * been complete since M1 and nothing could move an order into the state the
   * engine acts on.
   */
  submitPurchaseOrder: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/:id/submit',
    request: submitPurchaseOrderInput,
    response: purchaseOrderStateResponse,
    summary: 'Move a draft order to pending approval, under an optimistic lock.',
  }),

  updatePurchaseOrder: defineRoute({
    method: 'PATCH',
    path: '/api/v1/purchase-orders/:id',
    request: updatePurchaseOrderInput,
    response: purchaseOrderWriteResponse,
    summary: 'Replace an order. `expectedVersion` is required by the schema.',
  }),

  renamePurchaseOrder: defineRoute({
    method: 'PATCH',
    path: '/api/v1/purchase-orders/:id/number',
    request: renamePurchaseOrderInput,
    response: purchaseOrderWriteResponse,
    summary: 'Rename one order — one row, because the number is not the key.',
  }),

  approvePurchaseOrder: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/:id/approve',
    request: decideApprovalInput,
    response: approvalDecisionResponse,
    summary: 'Record one approval decision. Refuses while no chain is configured (PO-13).',
  }),

  declinePurchaseOrder: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/:id/decline',
    request: declineApprovalInput,
    response: approvalDecisionResponse,
    summary: 'Decline at the current stage, with a reason; the order is cancelled. Never your own.',
  }),

  purchaseOrderFromBoq: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/from-boq',
    request: createPurchaseOrderFromBoqInput,
    response: purchaseOrderFromBoqResponse,
    summary: 'Raise a DRAFT order from BOQ lines. The BOQ-03 replacement.',
  }),

  listRateContracts: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/rate-contracts',
    request: undefined,
    response: rateContractsResponse,
    summary: 'Vendor rate contracts — what a vendor agreed to charge, per trade.',
  }),

  getRateContract: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/rate-contracts/:contractId',
    request: undefined,
    response: rateContractDetail,
    summary: 'One rate contract with its contracted rates.',
  }),

  createRateContract: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/rate-contracts',
    request: rateContractInput,
    response: rateContractDetail,
    summary: 'Record a rate contract. Overlapping rates for one trade are refused.',
  }),

  updateRateContract: defineRoute({
    method: 'PUT',
    path: '/api/v1/purchase-orders/rate-contracts/:contractId',
    request: rateContractInput.omit({ vendorId: true }),
    response: rateContractDetail,
    summary: 'Replace a rate contract and its rates.',
  }),

  deleteRateContract: defineRoute({
    method: 'DELETE',
    path: '/api/v1/purchase-orders/rate-contracts/:contractId',
    request: undefined,
    response: noContent,
    summary: 'Remove a rate contract. Stamped deviations on past orders survive.',
  }),

  getPurchaseOrder: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/:id',
    request: undefined,
    response: purchaseOrderListItem,
    summary:
      'One order, the list row shape. A record page reads its record, never a ' +
      'page of the list hoping the record is on it.',
  }),

  purchaseOrderLines: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/:id/lines',
    request: undefined,
    response: purchaseOrderLinesResponse,
    summary: "An order's own lines with the server's amounts and the rate check on each. 404 for an order that does not exist.",
  }),

  listRateDeviations: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/rate-deviations',
    request: undefined,
    response: rateDeviationsResponse,
    summary:
      'Purchase-order lines priced ABOVE their contracted rate. The control the ' +
      'rate contracts exist for — without it the tables are a filing cabinet.',
  }),

  listVendors: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/vendors',
    request: undefined,
    response: vendorListResponse,
    summary: 'Vendors. Bank details are in a table no read here touches (VEND-02).',
  }),

  getVendor: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/vendors/:vendorId',
    request: undefined,
    response: vendor,
    summary: 'One vendor, without an account number or an IFSC.',
  }),

  createVendor: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/vendors',
    request: createVendorInput,
    response: vendor,
    summary: 'Register a vendor. GSTIN and PAN are validated by shape.',
  }),

  updateVendor: defineRoute({
    method: 'PATCH',
    path: '/api/v1/purchase-orders/vendors/:vendorId',
    request: updateVendorInput,
    response: vendor,
    summary: 'Edit a vendor. VEND-01: the legacy edit writes a column no migration creates.',
  }),

  setVendorTdsProfile: defineRoute({
    method: 'PUT',
    path: '/api/v1/purchase-orders/vendors/:vendorId/tds-profile',
    request: vendorTdsProfileInput,
    response: vendor,
    summary: 'What a payment to this vendor is deducted under: section, kind, PAN status and constitution.',
  }),

  listTransporterDeclarations: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/vendors/:vendorId/transporter-declarations',
    request: undefined,
    response: transporterDeclarationListResponse,
    summary: "A vendor's 194C(6) declarations, and the documents registered against it that can be their evidence.",
  }),

  recordTransporterDeclaration: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/vendors/:vendorId/transporter-declarations',
    request: recordTransporterDeclarationInput,
    response: transporterDeclaration,
    summary:
      'Record a 194C(6) declaration for a financial year: name, PAN, the goods-carriage confirmation, its date and its evidence (CA-07).',
  }),

  deleteVendor: defineRoute({
    method: 'DELETE',
    path: '/api/v1/purchase-orders/vendors/:vendorId',
    request: undefined,
    response: noContent,
    summary: 'Remove a vendor. Refused while an order references it — deactivate instead.',
  }),

  // --- inventory ---------------------------------------------------------

  listStock: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/stock',
    request: undefined,
    response: stockListResponse,
    summary: 'Balances summed from the movement ledger. No valuation (INV-03).',
  }),

  listStockItems: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/stock/items',
    request: undefined,
    response: stockItemListResponse,
    summary: 'Item definitions, including any nothing has moved yet — what a receipt form picks from.',
  }),

  createStockItem: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/stock/items',
    request: createStockItemInput,
    response: createdId,
    summary: 'Define a stock item. A definition, not a balance.',
  }),

  costingPolicy: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/stock/costing-policy',
    request: undefined,
    response: costingPolicyResponse,
    summary: 'The costing method behind every stock valuation, and whether it is provisional.',
  }),

  receiveStock: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/stock/receipts',
    request: stockMovementInput,
    response: noContent,
    summary: 'Goods received — one positive movement. checkedIn: false leaves it at the gate, out of the balance.',
  }),

  awaitingReceipts: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/stock/receipts/awaiting',
    request: undefined,
    response: awaitingReceiptListResponse,
    summary: 'Receipts at the gate, not yet counted into a store. Paged, newest first.',
  }),

  checkInReceipt: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/stock/receipts/:movementId/check-in',
    request: undefined,
    response: noContent,
    summary: 'Count a gate receipt into its store; it joins the balance. 404 unless it is waiting.',
  }),

  listStockLocations: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/stock/locations',
    request: undefined,
    response: stockLocationListResponse,
    summary: 'The stores and site stores stock is kept in, by name. ?includeRetired=true for all.',
  }),

  createStockLocation: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/stock/locations',
    request: createStockLocationInput,
    response: createdId,
    summary: 'Register a store or a site store. A duplicate name is a conflict.',
  }),

  retireStockLocation: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/stock/locations/:locationId/retire',
    request: undefined,
    response: noContent,
    summary: 'Retire a location. Movements that name it keep it; nothing is deleted.',
  }),

  issueStock: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/stock/issues',
    request: stockMovementInput,
    response: noContent,
    summary: 'Material issued — one negative movement, refused below zero.',
  }),

  transferStock: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/stock/transfers',
    request: stockTransferInput,
    response: stockTransferResponse,
    summary: 'Two movements summing to zero. INV-01: the legacy transfer moves no stock.',
  }),

  // --- retention ---------------------------------------------------------

  payablesAgeing: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/bills/ageing',
    request: undefined,
    response: payablesAgeingResponse,
    summary: 'What the firm owes vendors: current, then overdue by 1–30, 31–60 and over 60 days, gross. ?projectId= narrows it.',
  }),

  listBills: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/bills',
    request: undefined,
    response: billListResponse,
    summary: 'Vendor bills as payables, by view, with what is due by week over every bill. Gross.',
  }),

  acknowledgeBill: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/bills/:billId/acknowledge',
    request: acknowledgeBillInput,
    response: staffBill,
    summary: 'Acknowledge a submitted bill with its taxable value, GST and due date. The split must equal the claim.',
  }),

  listPayments: defineRoute({
    method: 'GET',
    path: '/api/v1/money/payments',
    request: undefined,
    response: paymentListResponse,
    summary: 'Vendor payments, newest first, with the month totals. TDS and retention as deducted; provisional marked.',
  }),

  payBill: defineRoute({
    method: 'POST',
    path: '/api/v1/money/bills/:billId/pay',
    request: payBillInput,
    response: vendorPayment,
    summary: 'Pay an acknowledged bill: TDS at the provisional rates, retention withheld, a Tally voucher staged. Refused unless drafts are switched on while a value is provisional. Needs "approve_payment".',
  }),

  receivablesAgeing: defineRoute({
    method: 'GET',
    path: '/api/v1/money/client-invoices/ageing',
    request: undefined,
    response: receivablesAgeingResponse,
    summary: 'What clients owe: current, then overdue by 1–30, 31–60 and over 60 days. ?projectId= narrows it.',
  }),

  moneyByMonth: defineRoute({
    method: 'GET',
    path: '/api/v1/money/by-month',
    request: undefined,
    response: moneyByMonthResponse,
    summary: 'Receipts and payments (net of TDS and retention) by month, FY or quarter to date. ?period=fy|q, ?projectId=.',
  }),

  listClientInvoices: defineRoute({
    method: 'GET',
    path: '/api/v1/money/client-invoices',
    request: undefined,
    response: clientInvoiceListResponse,
    summary: 'Tax invoices to clients, newest first, with what is invoiced, received and due over all of them.',
  }),

  raiseClientInvoice: defineRoute({
    method: 'POST',
    path: '/api/v1/money/client-invoices',
    request: raiseClientInvoiceInput,
    response: clientInvoice,
    summary: 'Raise a tax invoice at the provisional GST rate, numbered from the tax-invoice series with no gaps. Refused unless drafts are switched on while the rate is provisional. Needs "approve_payment".',
  }),

  recordClientReceipt: defineRoute({
    method: 'POST',
    path: '/api/v1/money/client-invoices/:invoiceId/receipts',
    request: recordClientReceiptInput,
    response: clientInvoice,
    summary: 'Record what a client paid against an invoice. Never more than is due. Needs "approve_payment".',
  }),

  cancelClientInvoice: defineRoute({
    method: 'POST',
    path: '/api/v1/money/client-invoices/:invoiceId/cancel',
    request: cancelClientInvoiceInput,
    response: clientInvoice,
    summary: 'Cancel an invoice, keeping its number. Refused once anything is received against it. Needs "approve_payment".',
  }),

  tdsChallan: defineRoute({
    method: 'GET',
    path: '/api/v1/money/tds/challan',
    request: undefined,
    response: tdsChallanResponse,
    summary: 'The TDS challan for a month (?period=YYYY-MM), from the payments. Absent without a TAN; refused unless drafts are switched on while a rate is provisional.',
  }),

  form26Q: defineRoute({
    method: 'GET',
    path: '/api/v1/money/tds/26q',
    request: undefined,
    response: form26QResponse,
    summary: 'The 26Q deductee lines for a quarter (?quarter=2026-27-Q2). Absent without a TAN; refused unless drafts are switched on while a rate is provisional.',
  }),

  listRetentionPositions: defineRoute({
    method: 'GET',
    path: '/api/v1/money/retention',
    request: undefined,
    response: retentionPositionListResponse,
    summary: 'Retention per order: the rate held, what was withheld from its bills, released, and held now.',
  }),

  releaseRetention: defineRoute({
    method: 'POST',
    path: '/api/v1/money/retention/:holdingId/release',
    request: releaseRetentionInput,
    response: vendorPayment,
    summary: 'Release what is held against an order as a payment voucher, with nothing further deducted. Needs "approve_payment".',
  }),

  listRetention: defineRoute({
    method: 'GET',
    path: '/api/v1/purchase-orders/retention',
    request: undefined,
    response: retentionListResponse,
    summary: 'What is held back, per order. RET-01: nothing in the legacy ever recorded it.',
  }),

  recordRetention: defineRoute({
    method: 'POST',
    path: '/api/v1/purchase-orders/retention',
    request: recordRetentionInput,
    response: retentionHolding,
    summary: 'The rate is the input; the retained amount is computed from the order.',
  }),

  // --- BOQ ---------------------------------------------------------------

  addBoqLines: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/:projectId/boq',
    request: addBoqLinesInput,
    response: boqWriteResponse,
    summary: 'Lines as a set, written atomically. The amount is computed, never supplied.',
  }),

  updateBoqLine: defineRoute({
    method: 'PATCH',
    path: '/api/v1/projects/:projectId/boq/:itemId',
    request: updateBoqLineInput,
    response: boqItem,
    summary: 'Replace one line. `expectedVersion` required — that is BOQ-04 closed.',
  }),

  deleteBoqLine: defineRoute({
    method: 'DELETE',
    path: '/api/v1/projects/:projectId/boq/:itemId',
    request: undefined,
    response: noContent,
    summary: '404 when it is not there, rather than reporting success for an untouched row.',
  }),

  // --- leads -------------------------------------------------------------

  pipelineSummary: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/leads/pipeline-summary',
    request: undefined,
    response: pipelineSummaryResponse,
    summary: 'Quotes awaiting a decision, next steps and expected closes this month, the open pipeline — unweighted.',
  }),

  listLeads: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/leads',
    request: undefined,
    response: pipelineResponse,
    summary: 'The pipeline, with the weighted total computed server-side (CRM-01).',
  }),

  createLead: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/leads',
    request: createLeadInput,
    response: lead,
    summary: 'Record a lead. Probability is stored as entered and never derived.',
  }),

  updateLead: defineRoute({
    method: 'PATCH',
    path: '/api/v1/projects/leads/:leadId',
    request: updateLeadInput,
    response: lead,
    summary: 'Edit a lead, under an optimistic lock.',
  }),

  convertLead: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/leads/:leadId/convert',
    request: convertLeadInput,
    response: lead,
    summary: 'Attach a won lead to the project it became.',
  }),

  deleteLead: defineRoute({
    method: 'DELETE',
    path: '/api/v1/projects/leads/:leadId',
    request: undefined,
    response: noContent,
    summary: 'Remove a lead.',
  }),

  /**
   * What a lead accumulates while somebody works it.
   *
   * The pipeline screen answers "where is this lead"; these answer "what has
   * anybody actually done about it", which is the question a sales review asks
   * and the one our single-screen CRM could not answer at all.
   */
  leadContacts: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/leads/:leadId/contacts',
    request: undefined,
    response: leadContactListResponse,
    summary: 'Everyone at the client. A fit-out lead has more than one.',
  }),

  addLeadContact: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/leads/:leadId/contacts',
    request: addLeadContactInput,
    response: createdId,
    summary: 'Add a contact. Making one primary demotes the other, atomically.',
  }),

  removeLeadContact: defineRoute({
    method: 'DELETE',
    path: '/api/v1/projects/leads/:leadId/contacts/:contactId',
    request: undefined,
    response: noContent,
    summary: 'Remove a contact.',
  }),

  leadActivities: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/leads/:leadId/activities',
    request: undefined,
    response: leadActivityListResponse,
    summary: 'The timeline, newest first, ordered by when things happened.',
  }),

  recordLeadActivity: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/leads/:leadId/activities',
    request: recordLeadActivityInput,
    response: createdId,
    summary: 'Log what happened and, in the same act, when the next thing will.',
  }),

  markLeadLost: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/leads/:leadId/lost',
    request: markLeadLostInput,
    response: noContent,
    summary: 'Close a lead as lost. The reason is required in three places.',
  }),

  leadDuplicates: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/leads/:leadId/duplicates',
    request: undefined,
    response: possibleDuplicateResponse,
    summary: 'Leads sharing an exact client name. A warning that decides nothing.',
  }),

  // --- change orders -----------------------------------------------------

  unsignedVariations: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/change-orders/unsigned',
    request: undefined,
    response: unsignedVariationsResponse,
    summary: 'Variations with the client for signature: count, value, the longest-waiting. ?projectId= narrows it.',
  }),

  listChangeOrders: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/:projectId/change-orders',
    request: undefined,
    response: contractValueResponse,
    summary: 'Variations, and the contract value they add up to. `original` is never overwritten.',
  }),

  createChangeOrder: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/:projectId/change-orders',
    request: createChangeOrderInput,
    response: changeOrder,
    summary: 'Raise a variation as a draft. `costImpact` is signed — a credit is negative.',
  }),

  submitChangeOrder: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/:projectId/change-orders/:changeOrderId/submit',
    request: submitChangeOrderInput,
    response: changeOrder,
    summary: 'Send a draft to the client. A zero-value variation is refused.',
  }),

  decideChangeOrder: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/:projectId/change-orders/:changeOrderId/decide',
    request: decideChangeOrderInput,
    response: changeOrder,
    summary: 'Record the decision. Once — CO-04 adds the money twice on a second approval.',
  }),

  // --- drawings ----------------------------------------------------------

  listDrawings: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/:projectId/drawings',
    request: undefined,
    response: drawingListResponse,
    summary: 'GFC drawings. No file URL column — bytes live in the vault.',
  }),

  issueDrawing: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/:projectId/drawings',
    request: issueDrawingInput,
    response: gfcDrawing,
    summary: 'Issue a revision; any active revision of the same number is superseded atomically.',
  }),

  withdrawDrawing: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/:projectId/drawings/:drawingId/withdraw',
    request: undefined,
    response: gfcDrawing,
    summary: 'Withdraw a drawing. Not a delete — an issued drawing was on site.',
  }),

  // --- estimation and takeoff -------------------------------------------

  listEstimationItems: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/estimation/items',
    request: undefined,
    response: estimationListResponse,
    summary: 'The rate library. The rate is PRE-TAX and there is no GST field (RATE-03, PO-16).',
  }),

  createEstimationItem: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/estimation/items',
    request: createEstimationItemInput,
    response: estimationItem,
    summary: 'Store the four factors; the rate is the answer, not an input.',
  }),

  deleteEstimationItem: defineRoute({
    method: 'DELETE',
    path: '/api/v1/projects/estimation/items/:itemId',
    request: undefined,
    response: noContent,
    summary: 'Remove a library item.',
  }),

  listTakeoffSheets: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/:projectId/takeoff',
    request: undefined,
    response: takeoffSheetListResponse,
    summary: 'Takeoff sheets. The scale is an exact rational, not a float.',
  }),

  createTakeoffSheet: defineRoute({
    method: 'POST',
    path: '/api/v1/projects/:projectId/takeoff',
    request: createTakeoffSheetInput,
    response: takeoffSheet,
    summary: 'A sheet has both halves of a scale or neither — half a scale reads as calibrated.',
  }),

  takeoffSummary: defineRoute({
    method: 'GET',
    path: '/api/v1/projects/:projectId/takeoff/:sheetId/summary',
    request: undefined,
    response: takeoffSummary,
    summary: 'Totals, with unpriced and uncosted items NAMED rather than excluded (TAKE-01).',
  }),

  saveTakeoffItems: defineRoute({
    method: 'PUT',
    path: '/api/v1/projects/:projectId/takeoff/:sheetId/items',
    request: saveTakeoffItemsInput,
    response: takeoffSummary,
    summary: 'Items are saved as a set: the sheet is redrawn, not patched.',
  }),

  // --- tasks and documents ----------------------------------------------

  listTasks: defineRoute({
    method: 'GET',
    path: '/api/v1/workflow/tasks',
    request: undefined,
    response: taskListResponse,
    summary: 'Tasks for the resolved tenant.',
  }),

  createTask: defineRoute({
    method: 'POST',
    path: '/api/v1/workflow/tasks',
    request: createTaskInput,
    response: task,
    summary: 'Raise a task against any entity.',
  }),

  updateTask: defineRoute({
    method: 'PATCH',
    path: '/api/v1/workflow/tasks/:taskId',
    request: updateTaskInput,
    response: task,
    summary: 'Edit a task. Completed means completedAt AND completedBy — a CHECK, not a branch.',
  }),

  deleteTask: defineRoute({
    method: 'DELETE',
    path: '/api/v1/workflow/tasks/:taskId',
    request: undefined,
    response: noContent,
    summary: 'Remove a task.',
  }),

  listDocuments: defineRoute({
    method: 'GET',
    path: '/api/v1/workflow/documents',
    request: undefined,
    response: documentListResponse,
    summary: 'Vault metadata. No byte path exists here — VAULT-01 served uploads unauthenticated.',
  }),

  registerDocument: defineRoute({
    method: 'POST',
    path: '/api/v1/workflow/documents',
    request: registerDocumentInput,
    response: documentRecord,
    summary: 'Register an object by checksum and key. The API never accepts file bytes.',
  }),

  deleteDocument: defineRoute({
    method: 'DELETE',
    path: '/api/v1/workflow/documents/:documentId',
    request: undefined,
    response: noContent,
    summary: 'Remove a vault record.',
  }),

  // --- site controls -----------------------------------------------------

  listImprest: defineRoute({
    method: 'GET',
    path: '/api/v1/siteops/imprest/:projectId',
    request: undefined,
    response: imprestListResponse,
    summary: 'Site cash requests for a project.',
  }),

  requestImprest: defineRoute({
    method: 'POST',
    path: '/api/v1/siteops/imprest',
    request: requestImprestInput,
    response: imprest,
    summary: 'Ask for site cash.',
  }),

  sanctionImprest: defineRoute({
    method: 'POST',
    path: '/api/v1/siteops/imprest/:imprestId/sanction',
    request: sanctionImprestInput,
    response: imprest,
    summary: 'Sanction, possibly for less. The sanctioner is recorded separately (IMP-02).',
  }),

  reconcileImprest: defineRoute({
    method: 'POST',
    path: '/api/v1/siteops/imprest/:imprestId/reconcile',
    request: reconcileImprestInput,
    response: imprest,
    summary: 'Reconcile against what was spent. Cannot exceed the sanction (IMP-01).',
  }),

  listMeasurements: defineRoute({
    method: 'GET',
    path: '/api/v1/siteops/measurements/:projectId',
    request: undefined,
    response: measurementListResponse,
    summary: 'Joint measurements. Append-only — there is no edit and no delete.',
  }),

  recordMeasurement: defineRoute({
    method: 'POST',
    path: '/api/v1/siteops/measurements',
    request: recordMeasurementInput,
    response: measurement,
    summary: 'Record a measurement the client signed.',
  }),

  listRecces: defineRoute({
    method: 'GET',
    path: '/api/v1/siteops/recces/:projectId',
    request: undefined,
    response: recceListResponse,
    summary: 'Site surveys for a project.',
  }),

  getRecce: defineRoute({
    method: 'GET',
    path: '/api/v1/siteops/recce/:recceId',
    request: undefined,
    response: recce,
    summary: 'One survey in full.',
  }),

  createRecce: defineRoute({
    method: 'POST',
    path: '/api/v1/siteops/recces',
    request: createRecceInput,
    response: recce,
    summary: 'Record a survey. Areas are exact integers; conductedBy is the authenticated caller.',
  }),

  // --- rollup ------------------------------------------------------------

  projectRollup: defineRoute({
    method: 'GET',
    path: '/api/v1/rollups/projects',
    request: undefined,
    response: projectRollupResponse,
    summary: 'Committed spend against contract value, with the health band the server computed.',
  }),

  rateLibrary: defineRoute({
    method: 'GET',
    path: '/api/v1/rollups/rate-library',
    request: undefined,
    response: rateLibraryResponse,
    summary: 'Every agreed rate on file with what was last ordered against it and the BOQ cost rate that line came from. ?vendorId= and ?tradeCode= narrow the rows; the summary is over every row.',
  }),

  rateAnalysis: defineRoute({
    method: 'GET',
    path: '/api/v1/rollups/rate-analysis',
    request: undefined,
    response: rateCoverageResponse,
    summary: 'Order lines at an agreed rate, and agreed rates against the BOQ cost budget, compared by id.',
  }),

  // --- Today -------------------------------------------------------------
  //
  // The first screen. The hero is whatever ranked first; every panel is a
  // read, and a read with nothing on a tenant answers empty. See `today.ts`.

  todayHero: defineRoute({
    method: 'GET',
    path: '/api/v1/today/hero',
    request: undefined,
    response: todayHeroResponse,
    summary: 'The one thing that needs the director this morning, ranked by the server. ?projectId= asks it of one project.',
  }),

  blockedApprovals: defineRoute({
    method: 'GET',
    path: '/api/v1/today/blocked-approvals',
    request: undefined,
    response: blockedApprovalsStat,
    summary: 'Orders waiting on a decision: count, value held up, oldest, and the roles they wait on.',
  }),

  marginAtRisk: defineRoute({
    method: 'GET',
    path: '/api/v1/today/margin-at-risk',
    request: undefined,
    response: marginAtRiskStat,
    summary:
      'Approved orders past each BOQ cost budget, with the budget the bar sets it against. Absent only when no project has a BOQ.',
  }),

  cashAgainstPayables: defineRoute({
    method: 'GET',
    path: '/api/v1/today/cash-against-payables',
    request: undefined,
    response: cashAgainstPayablesStat,
    summary:
      'Payables by week, gross, present; the cash side absent until a cash position exists. ?projectId= narrows to one project.',
  }),

  spendByTrade: defineRoute({
    method: 'GET',
    path: '/api/v1/today/spend-by-trade',
    request: undefined,
    response: spendByTradeResponse,
    summary: 'Orders not cancelled, gross, by trade package: the top five and the rest. ?period=fy|q (fy).',
  }),

  todaySetup: defineRoute({
    method: 'GET',
    path: '/api/v1/today/setup',
    request: undefined,
    response: todaySetupResponse,
    summary: 'The six setup steps and which the server can see are done.',
  }),

  weeklySeries: defineRoute({
    method: 'GET',
    path: '/api/v1/today/weekly',
    request: undefined,
    response: weeklySeriesResponse,
    summary: 'ISO weeks of ordered so far, pipeline opened and people on site, for sparklines. ?weeks=2..26 (8).',
  }),

  // --- the portals -------------------------------------------------------
  //
  // A SEPARATE PREFIX, and that is the control rather than a naming choice.
  // `/api/v1/portal/...` is the only surface a non-staff principal may reach;
  // the internal tree above is behind `requireStaff`, so a vendor credential
  // presented to any of it is refused rather than filtered. The subject a
  // portal route scopes to comes from `identity.principal_links`, never from
  // the request — a route taking the id from its path would be an access
  // control whose input the caller supplies.

  portalWhoami: defineRoute({
    method: 'GET',
    path: '/api/v1/portal/whoami',
    request: undefined,
    response: portalWhoamiResponse,
    summary: 'Who is signed in to a portal — the person, their organisation, and whose portal it is. Refused to staff.',
  }),

  vendorPortalOrders: defineRoute({
    method: 'GET',
    path: '/api/v1/portal/vendor/orders',
    request: undefined,
    response: vendorPortalOrderListResponse,
    summary: "Orders issued to THIS vendor. A vendor with no link sees none, not all.",
  }),

  vendorPortalOrderLines: defineRoute({
    method: 'GET',
    path: '/api/v1/portal/vendor/orders/:orderId/lines',
    request: undefined,
    response: vendorPortalLineListResponse,
    summary: "404 for another vendor's order — existence is not confirmed.",
  }),

  vendorPortalAcceptOrder: defineRoute({
    method: 'POST',
    path: '/api/v1/portal/vendor/orders/:orderId/acceptance',
    request: acceptOrderInput,
    response: orderAcceptanceResponse,
    summary: 'Accept or reject an order. Append-only: a later answer is a second fact.',
  }),

  clientPortalBilling: defineRoute({
    method: 'GET',
    path: '/api/v1/portal/client/projects/:projectId/billing',
    request: undefined,
    response: clientPortalBillingResponse,
    summary: "Billing for the client's own project: its tax invoices, what was received and what is due, each marked provisional or verified.",
  }),

  vendorPortalPayments: defineRoute({
    method: 'GET',
    path: '/api/v1/portal/vendor/payments',
    request: undefined,
    response: vendorPortalPaymentListResponse,
    summary: 'Payments to the vendor this login is linked to: tax deducted and retention withheld, each marked provisional or verified.',
  }),

  vendorPortalBills: defineRoute({
    method: 'GET',
    path: '/api/v1/portal/vendor/bills',
    request: undefined,
    response: vendorBillListResponse,
    summary: 'Running-account bills this vendor has submitted.',
  }),

  vendorPortalSubmitBill: defineRoute({
    method: 'POST',
    path: '/api/v1/portal/vendor/bills',
    request: submitBillInput,
    response: submittedBillResponse,
    summary: 'Submit a claim. Stored exactly; no TDS, no netting, no approved amount.',
  }),

  clientPortalProjects: defineRoute({
    method: 'GET',
    path: '/api/v1/portal/client/projects',
    request: undefined,
    response: clientPortalProjectListResponse,
    summary: "This client's own projects, with progress and no internal cost or margin.",
  }),

  clientPortalVariations: defineRoute({
    method: 'GET',
    path: '/api/v1/portal/client/projects/:projectId/variations',
    request: undefined,
    response: clientPortalVariationListResponse,
    summary: 'Variations that have left draft. A draft is the contractor working note.',
  }),

  clientPortalDecideVariation: defineRoute({
    method: 'POST',
    path: '/api/v1/portal/client/projects/:projectId/variations/:changeOrderId/decide',
    request: clientDecideVariationInput,
    response: clientPortalDecidedVariation,
    summary: 'Sign off a variation, through the same rule the staff path uses (CO-04).',
  }),

  // --- the platform console ----------------------------------------------
  //
  // `/platform/v1`, and NOT under `/api/v1`: these routes are outside every
  // tenant. A platform principal belongs to none, so no tenant context is set —
  // and because none is set, every tenant-scoped policy in the database denies
  // that connection. The isolation is structural rather than a filter.

  platformWhoami: defineRoute({
    method: 'GET',
    path: '/platform/v1/whoami',
    request: undefined,
    response: platformWhoamiResponse,
    summary: 'What the platform console resolved. Used by the admin sign-in probe.',
  }),

  listTenants: defineRoute({
    method: 'GET',
    path: '/platform/v1/tenants',
    request: undefined,
    response: platformTenantListResponse,
    summary: 'Organisations that exist. Their slugs and names, never their data.',
  }),

  setTenantPlan: defineRoute({
    method: 'PUT',
    path: '/platform/v1/tenants/:tenantId/plan',
    request: setTenantPlanInput,
    response: okResponse,
    summary: "Set an organisation's plan label. Platform principals only; null clears it.",
  }),

  provisionTenant: defineRoute({
    method: 'POST',
    path: '/platform/v1/tenants',
    request: provisionTenantInput,
    response: provisionedTenantResponse,
    summary: 'Create an organisation and its first administrator, in one transaction.',
  }),

  provisioningEvents: defineRoute({
    method: 'GET',
    path: '/platform/v1/provisioning-events',
    request: undefined,
    response: provisioningEventListResponse,
    summary: 'Every provisioning attempt, refused ones included.',
  }),

  // ── the shell: what the bar and the sidebar read, and what a person's own controls write ──
  //
  // `docs/design/03-navigation.html`. One read per request for the sidebar's
  // counts; one call each for the switcher's groups, the history popover, the
  // preferences, the quick-create square's menu; a person's state is theirs —
  // the server takes the principal from the resolved identity, never the body.
  shellCounts: defineRoute({
    method: 'GET',
    path: '/api/v1/shell/counts',
    request: undefined,
    response: shellCountsResponse,
    summary: 'The sidebar’s six counts in one read: approvals waiting, receipts unchecked, rates ending, stock low, sites never reporting, bills overdue.',
  }),
  myProjects: defineRoute({
    method: 'GET',
    path: '/api/v1/shell/my-projects',
    request: undefined,
    response: myProjectsResponse,
    summary: 'The switcher’s groups for this person: Mine (on the team) and Recent (opened last, newest first).',
  }),
  recentHistory: defineRoute({
    method: 'GET',
    path: '/api/v1/shell/history',
    request: undefined,
    response: recentHistoryResponse,
    summary: 'The last records this person opened, newest first, with the project each is on.',
  }),
  recordOpened: defineRoute({
    method: 'POST',
    path: '/api/v1/shell/history',
    request: recordOpenedInput,
    response: okResponse,
    summary: 'Note that this person opened a record; opening it again moves it up.',
  }),
  preferences: defineRoute({
    method: 'GET',
    path: '/api/v1/shell/preferences',
    request: undefined,
    response: preferencesResponse,
    summary: 'This person’s preferences: columns per list, the sidebar’s folds, the last project, stars, the single-key switch.',
  }),
  updatePreferences: defineRoute({
    method: 'PATCH',
    path: '/api/v1/shell/preferences',
    request: updatePreferencesInput,
    response: preferencesResponse,
    summary: 'Merge a change into this person’s preferences; answers the whole document.',
  }),
  search: defineRoute({
    method: 'GET',
    path: '/api/v1/shell/search',
    request: undefined,
    response: searchResponse,
    summary: 'The bar’s search over records: ?q= the words, ?scope=orders|projects|vendors|leads|documents|everything, ?projectId= narrows to a project. At most 50 hits, never a page.',
  }),
  quickCreate: defineRoute({
    method: 'GET',
    path: '/api/v1/shell/quick-create',
    request: undefined,
    response: quickCreateResponse,
    summary: 'What this person may create, here, grouped by section. ?projectId= pre-fills the project.',
  }),
  savedViews: defineRoute({
    method: 'GET',
    path: '/api/v1/shell/views',
    request: undefined,
    response: savedViewsResponse,
    summary: 'A list’s saved views — the firm’s, then this person’s — with this person’s stars. ?list= names the list.',
  }),
  createSavedView: defineRoute({
    method: 'POST',
    path: '/api/v1/shell/views',
    request: createSavedViewInput,
    response: savedView,
    summary: 'Save a view of a list: the firm’s (needs manage_settings) or this person’s own.',
  }),
  deleteSavedView: defineRoute({
    method: 'DELETE',
    path: '/api/v1/shell/views/:viewId',
    request: undefined,
    response: okResponse,
    summary: 'Remove a view: this person’s own, or the firm’s with manage_settings.',
  }),
} as const;

export type ApiRoutes = typeof API_ROUTES;
