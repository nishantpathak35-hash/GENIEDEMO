import { z } from 'zod';
import { paiseWire } from '../money.js';

/**
 * The eleven design-build workflows.
 *
 * Every one of them is **off by default** — `tenancy.tenant_modules`, migration
 * 0065 — and every route under `/api/v1/design-build` answers **404** when its
 * module is switched off. Not 403: a module a tenant never enabled has no
 * permission question to answer, and 403 would confirm the feature exists.
 *
 * Verdicts per workflow, with the evidence, are in
 * `docs/ports/design-build-workflows.md`.
 */

// ── 1. Client brief and rooms ───────────────────────────────────────────────

export const BRIEF_STATUS_KEYS = ['draft', 'issued', 'acknowledged', 'superseded'] as const;
export const STATEMENT_KIND_KEYS = [
  'decision_maker',
  'client_supplied',
  'assumption',
  'exclusion',
] as const;

export const briefStatement = z.object({
  id: z.uuid(),
  kind: z.enum(STATEMENT_KIND_KEYS),
  body: z.string(),
  position: z.number().int(),
});
export type BriefStatement = z.infer<typeof briefStatement>;

export const briefRoom = z.object({
  id: z.uuid(),
  roomName: z.string(),
  /** Whole square feet, or null. Never a float — see migration 0071. */
  areaSqft: z.number().int().nullable(),
  headcount: z.number().int().nullable(),
  purpose: z.string(),
  requirements: z.string(),
  position: z.number().int(),
});
export type BriefRoom = z.infer<typeof briefRoom>;

/**
 * One version of a client brief.
 *
 * **`acknowledged` is frozen.** Saving a change to an acknowledged brief creates
 * version n+1 and marks this one superseded; it is never edited in place. That
 * rule is the reason this workflow was judged solid.
 *
 * The budgets are nullable wire paise. Null is *not* zero: the legacy writes
 * `Number(payload.budgetMin ?? 0)`, so "we have not discussed the budget" and
 * "the budget is nothing" become the same row.
 */
export const clientBrief = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  version: z.number().int(),
  status: z.enum(BRIEF_STATUS_KEYS),
  engagementType: z.string(),
  scopeSummary: z.string(),
  budgetMinPaise: paiseWire.nullable(),
  budgetMaxPaise: paiseWire.nullable(),
  targetStartDate: z.string().nullable(),
  targetCompletionDate: z.string().nullable(),
  approvalAuthority: z.string(),
  acknowledgedAt: z.string().nullable(),
  /** A principal id, or nothing. Never a display name. */
  acknowledgedBy: z.uuid().nullable(),
  statements: z.array(briefStatement),
  rooms: z.array(briefRoom),
});
export type ClientBrief = z.infer<typeof clientBrief>;

export const briefListResponse = z.object({ items: z.array(clientBrief) });
export type BriefListResponse = z.infer<typeof briefListResponse>;

export const saveBriefInput = z.object({
  engagementType: z.string().max(60).optional(),
  scopeSummary: z.string().max(8000).optional(),
  budgetMinPaise: paiseWire.nullable().optional(),
  budgetMaxPaise: paiseWire.nullable().optional(),
  targetStartDate: z.iso.date().nullable().optional(),
  targetCompletionDate: z.iso.date().nullable().optional(),
  approvalAuthority: z.string().max(200).optional(),
});
export type SaveBriefInput = z.infer<typeof saveBriefInput>;

/**
 * Issuing or acknowledging.
 *
 * `superseded` is not offered: a version becomes superseded because a later one
 * was created, never because somebody chose it. `draft` is not offered either —
 * a brief cannot be un-issued, because the client has already seen it.
 */
export const setBriefStatusInput = z.object({
  status: z.enum(['issued', 'acknowledged']),
});
export type SetBriefStatusInput = z.infer<typeof setBriefStatusInput>;

export const addStatementInput = z.object({
  kind: z.enum(STATEMENT_KIND_KEYS),
  body: z.string().min(1).max(1000),
  position: z.number().int().min(0).max(9999).optional(),
});
export type AddStatementInput = z.infer<typeof addStatementInput>;

export const saveRoomInput = z.object({
  roomName: z.string().min(1).max(120),
  areaSqft: z.number().int().min(1).max(10_000_000).nullable().optional(),
  headcount: z.number().int().min(0).max(100_000).nullable().optional(),
  purpose: z.string().max(200).optional(),
  requirements: z.string().max(4000).optional(),
  position: z.number().int().min(0).max(9999).optional(),
});
export type SaveRoomInput = z.infer<typeof saveRoomInput>;

// `createdId` is not redeclared here. `api/purchase-orders.ts` already exports
// one and "here is the id of the thing you just made" is one shape, not two.

// ── 2. Design deliverables and review ───────────────────────────────────────

export const DELIVERABLE_STATUS_KEYS = [
  'draft',
  'submitted',
  'approved',
  'revision_requested',
  'rejected',
] as const;
export const REVIEW_DECISION_KEYS = ['approved', 'revision_requested', 'rejected'] as const;

export const designReview = z.object({
  id: z.uuid(),
  /** The label the deliverable carried when it was reviewed, copied not joined. */
  versionLabel: z.string(),
  reviewerKind: z.enum(['internal', 'client']),
  reviewerId: z.uuid().nullable(),
  decision: z.enum(REVIEW_DECISION_KEYS),
  feedback: z.string(),
  reviewedAt: z.string(),
});
export type DesignReview = z.infer<typeof designReview>;

/**
 * A drawing or a view issued for review.
 *
 * `includedRevisionsLimit` is **nullable and nothing defaults it**. The legacy
 * writes `?? 2`, which makes every deliverable in the system start charging on
 * the third revision because of a keystroke. Null means no limit was agreed and
 * `beyondIncludedRevisions` never becomes true.
 *
 * `beyondIncludedRevisions` is a FLAG and never an amount. A variation is
 * priced on a change order, where it goes through the approval chain.
 */
export const designDeliverable = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  briefRoomId: z.uuid().nullable(),
  stage: z.string(),
  name: z.string(),
  ownerId: z.uuid().nullable(),
  dueDate: z.string().nullable(),
  versionLabel: z.string(),
  revisionCount: z.number().int(),
  includedRevisionsLimit: z.number().int().nullable(),
  status: z.enum(DELIVERABLE_STATUS_KEYS),
  beyondIncludedRevisions: z.boolean(),
  fileUrl: z.string(),
  notes: z.string(),
  approvedAt: z.string().nullable(),
  reviews: z.array(designReview),
});
export type DesignDeliverable = z.infer<typeof designDeliverable>;

export const deliverableListResponse = z.object({ items: z.array(designDeliverable) });
export type DeliverableListResponse = z.infer<typeof deliverableListResponse>;

export const addDeliverableInput = z.object({
  name: z.string().min(1).max(200),
  stage: z.string().max(60).optional(),
  briefRoomId: z.uuid().nullable().optional(),
  ownerId: z.uuid().nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  /** Absent means no limit was agreed. There is no default. */
  includedRevisionsLimit: z.number().int().min(1).max(99).nullable().optional(),
  fileUrl: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
});
export type AddDeliverableInput = z.infer<typeof addDeliverableInput>;

export const reviewDeliverableInput = z.object({
  decision: z.enum(REVIEW_DECISION_KEYS),
  feedback: z.string().max(4000).optional(),
});
export type ReviewDeliverableInput = z.infer<typeof reviewDeliverableInput>;

export const reviewResult = z.object({
  status: z.enum(DELIVERABLE_STATUS_KEYS),
  revisionCount: z.number().int(),
  beyondIncludedRevisions: z.boolean(),
});
export type ReviewResult = z.infer<typeof reviewResult>;

// ── 3. Room selections and substitutions ────────────────────────────────────

export const SELECTION_STATUS_KEYS = [
  'proposed',
  'approved',
  'rejected',
  'alternative_requested',
] as const;

/**
 * An alternative proposed against a frozen selection.
 *
 * `priceDeltaPaise` is a **signed** wire amount — a cheaper alternative is the
 * ordinary answer when a lead time is the problem — so it is a plain digit
 * string with an optional minus, not `paiseWire`, which forbids a sign.
 */
export const substitution = z.object({
  id: z.uuid(),
  originalSpec: z.string(),
  proposedSpec: z.string(),
  reason: z.string(),
  priceDeltaPaise: z.string().regex(/^-?\d+$/, 'not a signed paise amount'),
  leadTimeDeltaDays: z.number().int(),
  status: z.enum(['pending', 'approved', 'rejected']),
  proposedAt: z.string(),
  decidedAt: z.string().nullable(),
});
export type Substitution = z.infer<typeof substitution>;

export const roomSelection = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  briefRoomId: z.uuid().nullable(),
  roomLabel: z.string(),
  category: z.string(),
  itemName: z.string(),
  modelSku: z.string(),
  finish: z.string(),
  unitPricePaise: paiseWire.nullable(),
  quantity: z.number().int().nullable(),
  leadTimeWeeks: z.number().int().nullable(),
  decisionDeadline: z.string().nullable(),
  status: z.enum(SELECTION_STATUS_KEYS),
  /** Always equal to `status === 'approved'` — a CHECK constraint says so. */
  isFrozen: z.boolean(),
  decisionNote: z.string(),
  decidedAt: z.string().nullable(),
  substitutions: z.array(substitution),
});
export type RoomSelection = z.infer<typeof roomSelection>;

export const selectionListResponse = z.object({ items: z.array(roomSelection) });
export type SelectionListResponse = z.infer<typeof selectionListResponse>;

export const addSelectionInput = z.object({
  itemName: z.string().min(1).max(200),
  briefRoomId: z.uuid().nullable().optional(),
  roomLabel: z.string().max(120).optional(),
  category: z.string().max(80).optional(),
  modelSku: z.string().max(200).optional(),
  finish: z.string().max(120).optional(),
  unitPricePaise: paiseWire.nullable().optional(),
  quantity: z.number().int().min(1).max(1_000_000).nullable().optional(),
  leadTimeWeeks: z.number().int().min(0).max(260).nullable().optional(),
  decisionDeadline: z.iso.date().nullable().optional(),
});
export type AddSelectionInput = z.infer<typeof addSelectionInput>;

export const decideSelectionInput = z.object({
  decision: z.enum(['approved', 'rejected', 'alternative_requested']),
  note: z.string().max(2000).optional(),
});
export type DecideSelectionInput = z.infer<typeof decideSelectionInput>;

export const proposeSubstitutionInput = z.object({
  proposedSpec: z.string().min(1).max(500),
  reason: z.string().max(2000).optional(),
  priceDeltaPaise: z.string().regex(/^-?\d+$/, 'not a signed paise amount').optional(),
  leadTimeDeltaDays: z.number().int().min(-520).max(520).optional(),
});
export type ProposeSubstitutionInput = z.infer<typeof proposeSubstitutionInput>;

export const decideSubstitutionInput = z.object({ approve: z.boolean() });
export type DecideSubstitutionInput = z.infer<typeof decideSubstitutionInput>;

export const substitutionResult = z.object({
  applied: z.boolean(),
  newUnitPricePaise: paiseWire.nullable(),
});
export type SubstitutionResult = z.infer<typeof substitutionResult>;

// ── 4. Commercial agreement ─────────────────────────────────────────────────

/**
 * A payment stage.
 *
 * `shareBp` is basis points of the contract value and `amountPaise` is what
 * that comes to — **computed at read time, never stored**. A stored amount and
 * a stored share drift apart the moment the contract value changes, and then
 * two screens disagree about what is owed.
 */
export const agreementStage = z.object({
  id: z.uuid(),
  position: z.number().int(),
  name: z.string(),
  trigger: z.string(),
  shareBp: z.number().int(),
  amountPaise: paiseWire.nullable(),
});
export type AgreementStage = z.infer<typeof agreementStage>;

/**
 * The commercial agreement.
 *
 * **There is no deposit percentage, no validity period, no included-revision
 * count and no included-site-visit count.** The legacy invents all four with a
 * `??` and reads none of them. A thin workflow is built without its invented
 * numbers, not built with them.
 */
export const commercialAgreement = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  engagementType: z.string(),
  contractValuePaise: paiseWire.nullable(),
  status: z.enum(['draft', 'issued', 'signed']),
  signedOn: z.string().nullable(),
  notes: z.string(),
  stages: z.array(agreementStage),
  /** What the stages account for. 10000 is the whole contract. */
  allocatedBp: z.number().int(),
});
export type CommercialAgreement = z.infer<typeof commercialAgreement>;

export const agreementResponse = z.object({ agreement: commercialAgreement.nullable() });
export type AgreementResponse = z.infer<typeof agreementResponse>;

export const saveAgreementInput = z.object({
  engagementType: z.string().max(60).optional(),
  contractValuePaise: paiseWire.nullable().optional(),
  notes: z.string().max(8000).optional(),
});
export type SaveAgreementInput = z.infer<typeof saveAgreementInput>;

/** The whole schedule, because the rule is about the set totalling the whole. */
export const setStagesInput = z.object({
  stages: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        trigger: z.string().max(500).optional(),
        shareBp: z.number().int().min(1).max(10_000),
      }),
    )
    .max(40),
});
export type SetStagesInput = z.infer<typeof setStagesInput>;

export const setAgreementStatusInput = z.object({
  status: z.enum(['issued', 'signed']),
  signedOn: z.iso.date().nullable().optional(),
});
export type SetAgreementStatusInput = z.infer<typeof setAgreementStatusInput>;

// ── 5. Procurement planning ─────────────────────────────────────────────────

export const leadTimeConflict = z.object({
  selectionId: z.uuid(),
  roomLabel: z.string(),
  itemName: z.string(),
  leadTimeWeeks: z.number().int(),
  daysAvailable: z.number().int(),
  daysShort: z.number().int(),
  isFrozen: z.boolean(),
});
export type LeadTimeConflict = z.infer<typeof leadTimeConflict>;

/**
 * What has to be ordered, and what is already too late.
 *
 * `targetCompletionDate` null means the brief has no target date, so there are
 * no conflicts because **there is nothing to be late against** — which is a
 * different statement from "nothing is late", and the screen says which.
 */
export const procurementPlanResponse = z.object({
  targetCompletionDate: z.string().nullable(),
  conflicts: z.array(leadTimeConflict),
  longLead: z.array(
    z.object({
      selectionId: z.uuid(),
      roomLabel: z.string(),
      itemName: z.string(),
      leadTimeWeeks: z.number().int(),
      status: z.string(),
    }),
  ),
});
export type ProcurementPlanResponse = z.infer<typeof procurementPlanResponse>;

// ── 6. Joinery packages ─────────────────────────────────────────────────────

export const joineryStage = z.object({
  id: z.uuid(),
  position: z.number().int(),
  name: z.string(),
  status: z.enum(['pending', 'completed']),
  evidenceUrl: z.string(),
  notes: z.string(),
  completedAt: z.string().nullable(),
  /** A principal, never `session?.name || 'Inspector'`. */
  completedBy: z.uuid().nullable(),
});
export type JoineryStage = z.infer<typeof joineryStage>;

export const joineryPackage = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  roomLabel: z.string(),
  /** The workshop's name. Not a vendor id — `projects` may not read `procurement`. */
  workshop: z.string(),
  currentStage: z.string(),
  targetInstallDate: z.string().nullable(),
  notes: z.string(),
  stages: z.array(joineryStage),
});
export type JoineryPackage = z.infer<typeof joineryPackage>;

export const joineryListResponse = z.object({ items: z.array(joineryPackage) });
export type JoineryListResponse = z.infer<typeof joineryListResponse>;

export const addPackageInput = z.object({
  name: z.string().min(1).max(200),
  roomLabel: z.string().max(120).optional(),
  workshop: z.string().max(200).optional(),
  targetInstallDate: z.iso.date().nullable().optional(),
  notes: z.string().max(4000).optional(),
});
export type AddPackageInput = z.infer<typeof addPackageInput>;

export const advanceStageInput = z.object({
  evidenceUrl: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});
export type AdvanceStageInput = z.infer<typeof advanceStageInput>;

export const advanceResult = z.object({
  currentStage: z.string(),
  completedStage: z.string(),
});
export type AdvanceResult = z.infer<typeof advanceResult>;

// ── 7. Delivery milestones ──────────────────────────────────────────────────

export const MILESTONE_STATUS_KEYS = [
  'not_started',
  'in_progress',
  'delayed',
  'complete',
] as const;

/**
 * A site milestone.
 *
 * **There is no predecessor, no critical-path flag and no readiness gate.** The
 * legacy stores all three and reads none of them; a field that looks like a
 * dependency and enforces nothing is worse than its absence.
 *
 * `inLookahead` and `daysLate` are computed on every read, never stored.
 */
export const deliveryMilestone = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  trade: z.string(),
  plannedStart: z.string(),
  plannedFinish: z.string(),
  actualStart: z.string().nullable(),
  actualFinish: z.string().nullable(),
  status: z.enum(MILESTONE_STATUS_KEYS),
  delayReason: z.string(),
  recoveryPlan: z.string(),
  responsibleParty: z.string(),
  inLookahead: z.boolean(),
  daysLate: z.number().int().nullable(),
});
export type DeliveryMilestone = z.infer<typeof deliveryMilestone>;

export const milestoneListResponse = z.object({ items: z.array(deliveryMilestone) });
export type MilestoneListResponse = z.infer<typeof milestoneListResponse>;

/**
 * Milestones this week, firm-wide: every delivery milestone whose planned
 * finish falls in this India week (Monday to Sunday), or whose status is
 * `delayed`, by project — the sites that slip before the client notices.
 * `daysLate` is the server's count against the plan, as on the project read.
 */
export const milestoneThisWeek = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  projectCode: z.string(),
  name: z.string(),
  trade: z.string(),
  plannedFinish: z.string(),
  status: z.enum(MILESTONE_STATUS_KEYS),
  daysLate: z.number().int().nullable(),
  delayReason: z.string(),
  /** Planned to finish inside the week, whatever its status. */
  dueThisWeek: z.boolean(),
});
export const milestonesThisWeekResponse = z.object({
  weekStart: z.iso.date(),
  weekEnd: z.iso.date(),
  dueCount: z.number().int().nonnegative(),
  delayedCount: z.number().int().nonnegative(),
  /** Delayed first (most days late first), then by planned finish. */
  items: z.array(milestoneThisWeek),
});
export type MilestoneThisWeek = z.infer<typeof milestoneThisWeek>;
export type MilestonesThisWeekResponse = z.infer<typeof milestonesThisWeekResponse>;

export const addMilestoneInput = z.object({
  name: z.string().min(1).max(200),
  trade: z.string().max(80).optional(),
  plannedStart: z.iso.date(),
  plannedFinish: z.iso.date(),
  responsibleParty: z.string().max(200).optional(),
});
export type AddMilestoneInput = z.infer<typeof addMilestoneInput>;

export const recordProgressInput = z.object({
  status: z.enum(MILESTONE_STATUS_KEYS),
  actualStart: z.iso.date().nullable().optional(),
  actualFinish: z.iso.date().nullable().optional(),
  delayReason: z.string().max(2000).optional(),
  recoveryPlan: z.string().max(2000).optional(),
});
export type RecordProgressInput = z.infer<typeof recordProgressInput>;

// ── 8. Handover ─────────────────────────────────────────────────────────────

export const ITEM_KIND_KEYS = ['snag', 'defect', 'incomplete'] as const;
export const SEVERITY_KEYS = ['minor', 'major', 'critical'] as const;
export const ITEM_STATUS_KEYS = ['open', 'rectified', 'accepted'] as const;

/**
 * One item on the punch list.
 *
 * `severity` has **no default**: somebody raising a defect says how bad it is,
 * and `critical` is the one with a consequence — it blocks the handover.
 */
export const handoverItem = z.object({
  id: z.uuid(),
  roomLabel: z.string(),
  kind: z.enum(ITEM_KIND_KEYS),
  description: z.string(),
  severity: z.enum(SEVERITY_KEYS),
  status: z.enum(ITEM_STATUS_KEYS),
  beforePhotoUrl: z.string(),
  afterPhotoUrl: z.string(),
  assignedTo: z.string(),
  rectifiedAt: z.string().nullable(),
  notes: z.string(),
});
export type HandoverItem = z.infer<typeof handoverItem>;

export const handoverRecord = z.object({
  id: z.uuid(),
  /** Counts AT the moment of handover, copied rather than joined. */
  totalItems: z.number().int(),
  rectifiedItems: z.number().int(),
  openMinor: z.number().int(),
  notes: z.string(),
  issuedAt: z.string(),
});
export type HandoverRecord = z.infer<typeof handoverRecord>;

export const handoverStateResponse = z.object({
  items: z.array(handoverItem),
  record: handoverRecord.nullable(),
  /** Critical items still open. Anything above zero blocks the handover. */
  blocking: z.number().int(),
});
export type HandoverStateResponse = z.infer<typeof handoverStateResponse>;

export const raiseItemInput = z.object({
  kind: z.enum(ITEM_KIND_KEYS),
  description: z.string().min(1).max(2000),
  severity: z.enum(SEVERITY_KEYS),
  roomLabel: z.string().max(120).optional(),
  beforePhotoUrl: z.string().max(2000).optional(),
  assignedTo: z.string().max(200).optional(),
});
export type RaiseItemInput = z.infer<typeof raiseItemInput>;

/** The photo is required. A tick is not evidence. */
export const rectifyItemInput = z.object({
  afterPhotoUrl: z.string().min(1).max(2000),
  notes: z.string().max(2000).optional(),
});
export type RectifyItemInput = z.infer<typeof rectifyItemInput>;

export const issueHandoverInput = z.object({ notes: z.string().max(4000).optional() });
export type IssueHandoverInput = z.infer<typeof issueHandoverInput>;

// ── 9. Warranty ─────────────────────────────────────────────────────────────

export const WARRANTY_STATUS_KEYS = ['reported', 'in_progress', 'resolved', 'rejected'] as const;

/**
 * A warranty claim.
 *
 * **No invented SLA, category, contractor or client.** The legacy defaults all
 * four and reads none of them. `respondBy` is nullable, never filled in, and IS
 * read: `overdue` is computed from it on every read.
 */
export const warrantyCase = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  reportedOn: z.string(),
  respondBy: z.string().nullable(),
  assignedTo: z.string(),
  status: z.enum(WARRANTY_STATUS_KEYS),
  resolutionNotes: z.string(),
  resolutionEvidenceUrl: z.string(),
  closedAt: z.string().nullable(),
  overdue: z.boolean(),
});
export type WarrantyCase = z.infer<typeof warrantyCase>;

export const warrantyListResponse = z.object({ items: z.array(warrantyCase) });
export type WarrantyListResponse = z.infer<typeof warrantyListResponse>;

export const raiseCaseInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  category: z.string().max(80).optional(),
  reportedOn: z.iso.date().optional(),
  respondBy: z.iso.date().nullable().optional(),
  assignedTo: z.string().max(200).optional(),
});
export type RaiseCaseInput = z.infer<typeof raiseCaseInput>;

export const decideCaseInput = z.object({
  status: z.enum(WARRANTY_STATUS_KEYS),
  resolutionNotes: z.string().max(4000).optional(),
  resolutionEvidenceUrl: z.string().max(2000).optional(),
});
export type DecideCaseInput = z.infer<typeof decideCaseInput>;

// ── 10. Design timesheets ───────────────────────────────────────────────────

/**
 * Time booked against a job.
 *
 * **Whole minutes, not float hours.** The legacy stores `hours_spent` as a
 * REAL, so a fortnight of half-hours totals something ending in nines.
 */
export const timesheetEntry = z.object({
  id: z.uuid(),
  principalId: z.uuid(),
  principalEmail: z.string(),
  workDate: z.string(),
  minutes: z.number().int(),
  /** The same figure ready to print. The app is banned from `Math.*`. */
  duration: z.string(),
  stage: z.string(),
  deliverableId: z.uuid().nullable(),
  description: z.string(),
  additionalService: z.boolean(),
});
export type TimesheetEntry = z.infer<typeof timesheetEntry>;

export const timesheetSummary = z.object({
  principalId: z.uuid(),
  principalEmail: z.string(),
  minutes: z.number().int(),
  duration: z.string(),
  additionalMinutes: z.number().int(),
  additionalDuration: z.string(),
});
export type TimesheetSummary = z.infer<typeof timesheetSummary>;

export const timesheetResponse = z.object({
  entries: z.array(timesheetEntry),
  byPerson: z.array(timesheetSummary),
  totalMinutes: z.number().int(),
  totalDuration: z.string(),
});
export type TimesheetResponse = z.infer<typeof timesheetResponse>;

/**
 * Booking time.
 *
 * **There is no field for whose time it is.** It is always the caller's. The
 * legacy accepts `payload.userEmail` as a fallback, so anybody can book
 * anybody's hours by typing their address.
 */
export const bookTimeInput = z.object({
  workDate: z.iso.date(),
  minutes: z.number().int().min(1).max(960),
  stage: z.string().max(60).optional(),
  deliverableId: z.uuid().nullable().optional(),
  description: z.string().max(2000).optional(),
  additionalService: z.boolean().optional(),
});
export type BookTimeInput = z.infer<typeof bookTimeInput>;

// ── 11. Client action items ─────────────────────────────────────────────────

export const DECISION_CHANNEL_KEYS = ['meeting', 'whatsapp', 'email', 'phone', 'letter'] as const;
export const SUBJECT_KIND_KEYS = ['deliverable', 'selection', 'change_order'] as const;

export const clientActionItem = z.object({
  kind: z.enum(SUBJECT_KIND_KEYS),
  id: z.uuid(),
  title: z.string(),
  detail: z.string(),
  dueOn: z.string().nullable(),
});
export type ClientActionItem = z.infer<typeof clientActionItem>;

/**
 * A decision that arrived somewhere other than this system.
 *
 * **`channel` is a field.** The legacy has the same idea and nowhere to put it,
 * so it writes `[External via WhatsApp]` into a feedback string — which cannot
 * be filtered, counted or asked about.
 */
export const clientDecisionRecord = z.object({
  id: z.uuid(),
  subjectKind: z.enum(SUBJECT_KIND_KEYS),
  subjectId: z.uuid(),
  decision: z.string(),
  channel: z.enum(DECISION_CHANNEL_KEYS),
  saidBy: z.string(),
  note: z.string(),
  decidedOn: z.string(),
  recordedAt: z.string(),
});
export type ClientDecisionRecord = z.infer<typeof clientDecisionRecord>;

export const clientActionsResponse = z.object({
  items: z.array(clientActionItem),
  recorded: z.array(clientDecisionRecord),
});
export type ClientActionsResponse = z.infer<typeof clientActionsResponse>;

export const externalDecisionInput = z.object({
  subjectKind: z.enum(SUBJECT_KIND_KEYS),
  subjectId: z.uuid(),
  decision: z.string().min(1).max(60),
  channel: z.enum(DECISION_CHANNEL_KEYS),
  saidBy: z.string().max(200).optional(),
  note: z.string().max(4000).optional(),
  /** When they said it, which is not when it was typed. */
  decidedOn: z.iso.date(),
});
export type ExternalDecisionInput = z.infer<typeof externalDecisionInput>;
