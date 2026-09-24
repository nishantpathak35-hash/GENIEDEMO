import { z } from 'zod';
import { pageOf } from '../pagination.js';
import { paiseWire } from '../money.js';

/**
 * Project and bill-of-quantities shapes.
 *
 * A project has an **id**. That sentence is the whole point of the schema: in
 * the legacy system a project is a name string, matched with
 * `LOWER(TRIM(project)) LIKE '%…%'`, which is TOPOLOGY's defect #1 and the
 * reason tenancy could not be layered onto it. Every route here takes a
 * `projectId`, and there is no endpoint that resolves a project by name.
 */

export const projectState = z.enum([
  'lead',
  'won',
  'in_progress',
  'handed_over',
  'closed',
  'lost',
]);

export type ProjectState = z.infer<typeof projectState>;

export const project = z.object({
  id: z.uuid(),
  /** A short human key, unique within the tenant. Quoted on the phone; correctable. */
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  clientName: z.string().min(1).max(200),
  state: projectState,
  /** Stamped by the server on the move to `in_progress`; the day work began. */
  startedOn: z.string().nullable(),
  /** Stamped by the server on the move to `handed_over`. */
  handedOverOn: z.string().nullable(),
  /** The states this project may move to next — the server's rule, so a
   *  screen offers exactly those and computes nothing. Empty when final. */
  moves: z.array(projectState),
  /**
   * The **originally signed** contract value, never overwritten.
   *
   * `CO-02` records that the legacy rewrites this in place when a change order
   * is approved, so the figure that was actually signed is lost. The current
   * value is derived from this plus approved variations, and is a different
   * field for that reason.
   */
  originalValue: paiseWire.nullable(),
});

export type Project = z.infer<typeof project>;

export const createProjectInput = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  clientName: z.string().min(1).max(200),
  originalValue: paiseWire.nullable().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectInput>;

/**
 * Move a project to its next state. The server holds the rule for which
 * moves exist (`lead → won | lost`, `won → in_progress | lost`,
 * `in_progress → handed_over | closed`, `handed_over → closed`; `closed` and
 * `lost` are final) and refuses the rest with CONFLICT. The two dates on the
 * project are stamped by the move, never sent.
 */
export const setProjectStateInput = z.object({ state: projectState });
export type SetProjectStateInput = z.infer<typeof setProjectStateInput>;

export const projectListResponse = pageOf(project);

export type ProjectListResponse = z.infer<typeof projectListResponse>;

export const boqItem = z.object({
  id: z.uuid(),
  section: z.string(),
  itemNo: z.number().int(),
  description: z.string(),
  uom: z.string(),
  quantityMicros: z.string(),
  rate: paiseWire,
  /** `null` means the cost is UNKNOWN. It is never coerced to a number (TAKE-01). */
  costRate: paiseWire.nullable(),
  /** Server-computed. There is no field a caller can assert a line amount into (BOQ-01). */
  amount: paiseWire,
  /** Send this back as `expectedVersion` on the next edit (BOQ-04). */
  version: z.number().int(),
});

/**
 * Totals for a bill of quantities.
 *
 * `cost` and `margin` are `null` unless **every** line carries a cost rate. A
 * partial cost total is worse than none — it reads as a margin figure while
 * being computed over a subset, so it silently overstates profitability by
 * however many lines were missing.
 */
export const boqResponse = z.object({
  projectId: z.uuid(),
  items: z.array(boqItem),
  totals: z.object({
    lineCount: z.number().int(),
    value: paiseWire,
    cost: paiseWire.nullable(),
    margin: paiseWire.nullable(),
  }),
});

export type BoqResponse = z.infer<typeof boqResponse>;

/**
 * A BOQ line as it is written.
 *
 * **There is no `amount` and no `costRate` derivation, and both absences are
 * the point.** `boq.js:114` accepts `Number(realPayload.amount)` when the
 * caller sends one, so a client can assert a line total that is not quantity x
 * rate (BOQ-01). `boq.js:110` invents a missing cost rate as `rate * 0.8`
 * while `BoqView.js:137` invents it as 78% of the rate — two different
 * fabrications of the same unknown, neither with a stated basis (BOQ-02, PO-15).
 *
 * `rate` is **pre-tax** (migration `0022`). Whether tenant #1 quoted their
 * historic BOQs tax-inclusive is PO-16 and is about importing their data, not
 * about this field.
 */
export const boqLineInput = z.object({
  section: z.string().min(1).max(120),
  itemNo: z.number().int().min(1),
  description: z.string().min(1).max(500),
  uom: z.string().min(1).max(24),
  /** Whole units and millionths, so a quantity never travels as a float. */
  quantityWhole: z.number().int().min(0),
  quantityMillionths: z.number().int().min(0).max(999_999),
  rate: paiseWire,
  /** Omit when unknown. Omitted stays NULL; it is never derived from the rate. */
  costRate: paiseWire.optional(),
});

export type BoqLineInput = z.infer<typeof boqLineInput>;

/** Adding lines. Sent as a set, because a BOQ is entered as one. */
export const addBoqLinesInput = z.object({
  lines: z.array(boqLineInput).min(1).max(1000),
});

export type AddBoqLinesInput = z.infer<typeof addBoqLinesInput>;

/**
 * Editing one line.
 *
 * `expectedVersion` is **required**, and the client cannot decline it — the
 * same shape as `updatePurchaseOrderInput` and for the same reason. It was
 * absent while `projects.boq_items` had no version column (BOQ-04); migration
 * `0030` added it.
 *
 * The whole line is sent, not a patch. A partial edit needs a merge, a merge
 * needs the prior line, and the only copy the client has is the one it
 * rendered — which is how a stale rate gets written back.
 */
export const updateBoqLineInput = boqLineInput.extend({
  expectedVersion: z.number().int().min(1),
});

export type UpdateBoqLineInput = z.infer<typeof updateBoqLineInput>;

// ----------------------------------------------------------------- leads --

export const LEAD_STAGES = [
  "lead",
  "qualified",
  "proposal_shared",
  "negotiation",
  "won",
  "unqualified",
  "rejected",
] as const;

/**
 * A lead.
 *
 * `probabilityPct` is **supplied, never derived from the stage**. The legacy has
 * four different stage-to-probability ladders that disagree by up to 15 points
 * — `CrmView.js:402-407`, `crm.js:131-139`, the column default of 40 and the
 * read fallback of 40 — so the weighted pipeline a director reads is a mix of
 * ladders nobody chose (CRM-01). Inventing a fifth is the move that produced
 * the first four.
 */
export const createLeadInput = z.object({
  clientName: z.string().min(1).max(200),
  contactName: z.string().max(200).optional(),
  phone: z.string().max(32).optional(),
  email: z.string().max(320).optional(),
  stage: z.enum(LEAD_STAGES),
  estimatedValue: paiseWire,
  probabilityPct: z.number().int().min(0).max(100),
  projectType: z.string().max(120).optional(),
  source: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  consultant: z.string().max(200).optional(),
  ownerId: z.uuid().optional(),
  /** NULL when unknown. The legacy defaults to the literal "15 Dec 2026". */
  expectedClose: z.iso.date().optional(),
  notes: z.string().max(4000).optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadInput>;

export const updateLeadInput = createLeadInput.extend({
  expectedVersion: z.number().int().min(1),
});
export type UpdateLeadInput = z.infer<typeof updateLeadInput>;

/**
 * Converting a lead.
 *
 * The project is created first and its id passed in. `convertLeadToProject`
 * (`crm.js:165`) creates the project itself with
 * `code = "PRJ-" + Math.floor(2000 + Math.random() * 8000)` — a random primary
 * key nobody chose (CRM-03).
 */
export const convertLeadInput = z.object({
  projectId: z.uuid(),
  expectedVersion: z.number().int().min(1),
});
export type ConvertLeadInput = z.infer<typeof convertLeadInput>;

export const lead = z.object({
  id: z.uuid(),
  clientName: z.string(),
  contactName: z.string(),
  phone: z.string(),
  email: z.string(),
  stage: z.enum(LEAD_STAGES),
  estimatedValue: paiseWire,
  probabilityPct: z.number().int(),
  projectType: z.string(),
  source: z.string(),
  city: z.string(),
  consultant: z.string(),
  ownerId: z.uuid().nullable(),
  expectedClose: z.string().nullable(),
  notes: z.string(),
  /**
   * The next date somebody committed to.
   *
   * `null` means no next step, which is a different and more useful answer than
   * a date in the past — a lead with nothing scheduled is the one that goes
   * cold, and the two want different treatment on a screen.
   */
  nextFollowupOn: z.string().nullable(),
  /** What the next step IS — a site visit, a call. `null` when unset (0086). */
  nextFollowupKind: z.enum(['call', 'meeting', 'email', 'site_visit', 'note']).nullable(),
  /**
   * The day the lead was won or closed as lost, stamped by the server on the
   * stage change. `null` while open — and for a lead closed before migration
   * 0086, which recorded no date.
   */
  closedOn: z.string().nullable(),
  /**
   * Why it was lost. Empty unless the stage is a closed-lost one, and a
   * database constraint holds that both ways.
   *
   * The single most valuable field in a CRM, because it is the only one that
   * changes what the company does next: "lost on price" and "lost because we
   * never followed up" call for opposite responses.
   */
  lostReason: z.string(),
  convertedProjectId: z.uuid().nullable(),
  version: z.number().int(),
});
export type Lead = z.infer<typeof lead>;

// ---------------------------------------------------------- lead depth --

export const leadContact = z.object({
  id: z.uuid(),
  leadId: z.uuid(),
  name: z.string(),
  /** The contact's job title at the client. Not an authorisation role. */
  designation: z.string(),
  phone: z.string(),
  email: z.string(),
  isPrimary: z.boolean(),
});
export type LeadContact = z.infer<typeof leadContact>;

export const leadContactListResponse = z.object({ items: z.array(leadContact) });
export type LeadContactListResponse = z.infer<typeof leadContactListResponse>;

export const addLeadContactInput = z.object({
  name: z.string().min(1).max(120),
  designation: z.string().max(80).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(160).optional(),
  isPrimary: z.boolean().optional(),
});
export type AddLeadContactInput = z.infer<typeof addLeadContactInput>;

const ACTIVITY_KINDS = [
  'call',
  'meeting',
  'email',
  'site_visit',
  'note',
  'stage_change',
  'lost',
] as const;

export const leadActivity = z.object({
  id: z.uuid(),
  leadId: z.uuid(),
  kind: z.enum(ACTIVITY_KINDS),
  summary: z.string(),
  detail: z.string(),
  /** When it HAPPENED, not when it was typed. */
  occurredOn: z.string(),
  recordedBy: z.uuid(),
});
export type LeadActivity = z.infer<typeof leadActivity>;

export const leadActivityListResponse = z.object({ items: z.array(leadActivity) });
export type LeadActivityListResponse = z.infer<typeof leadActivityListResponse>;

/**
 * Recording something that happened, and optionally the next thing that will.
 *
 * `stage_change` and `lost` are written by the server, not by this input — a
 * timeline entry claiming a stage moved, when none did, would be a lie the
 * timeline cannot detect.
 */
export const recordLeadActivityInput = z.object({
  kind: z.enum(['call', 'meeting', 'email', 'site_visit', 'note']),
  summary: z.string().min(1).max(200),
  detail: z.string().max(4000).optional(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date is required.'),
  nextFollowupOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  /** What kind of step the next one is. Kept only with a `nextFollowupOn` date. */
  nextFollowupKind: z.enum(['call', 'meeting', 'email', 'site_visit', 'note']).optional(),
});
export type RecordLeadActivityInput = z.infer<typeof recordLeadActivityInput>;

/**
 * Closing a lead as lost.
 *
 * The reason is required by the schema, by the application and by a database
 * constraint. Three places, because a lost lead with no reason is the default
 * outcome of every CRM that makes it optional.
 */
export const markLeadLostInput = z.object({
  stage: z.enum(['unqualified', 'rejected']),
  reason: z.string().min(1).max(500),
  expectedVersion: z.number().int().min(1),
});
export type MarkLeadLostInput = z.infer<typeof markLeadLostInput>;

/**
 * Leads sharing a client name.
 *
 * **A warning that decides nothing.** Matched on an exact, case-insensitive
 * name — never a `LIKE '%…%'`, which is the legacy's central defect. Nothing
 * links, merges or blocks on this; a person looks at both and forms a view.
 */
export const possibleDuplicateResponse = z.object({
  items: z.array(z.object({ id: z.uuid(), clientName: z.string(), stage: z.string() })),
});
export type PossibleDuplicateResponse = z.infer<typeof possibleDuplicateResponse>;

/**
 * Pipeline totals, computed on the server.
 *
 * `CrmView.js:53` multiplies a float value by a probability in the browser and
 * `:157` divides by 10,000,000 for crores — money arithmetic in a client, twice
 * (CRM-02). `winRatePct` is null rather than 0 when nothing has been decided.
 */
export const pipelineResponse = pageOf(lead).extend({
  totals: z.object({
    openCount: z.number().int(),
    total: paiseWire,
    weighted: paiseWire,
    /** Weighted by the stage's own weight — 10% lead, 25% qualified, 40% proposal shared, 70% negotiation — the design's ladder, shown beside `total`. */
    weightedByStage: paiseWire,
    winRatePct: z.number().int().nullable(),
    /**
     * Per open stage, in ladder order, empty stages included.
     *
     * The board renders a count and a value at the head of each column, and it
     * must not compute either — a screen never sums a column of money.
     */
    byStage: z.array(
      z.object({
        stage: z.string(),
        count: z.number().int(),
        value: paiseWire,
        weighted: paiseWire,
      }),
    ),
    /**
     * Leads won in the current quarter (Asia/Kolkata calendar), by `closedOn`.
     * Over the whole pipeline, never the window and never the stage filter.
     */
    wonThisQuarter: z.object({
      since: z.iso.date(),
      count: z.number().int().min(0),
      value: paiseWire,
    }),
    /** The earliest scheduled step on an open lead whose kind is a site visit, today or later. */
    nextSiteVisit: z
      .object({ leadId: z.uuid(), clientName: z.string(), on: z.iso.date() })
      .nullable(),
  }),
});
export type PipelineResponse = z.infer<typeof pipelineResponse>;

// -------------------------------------------------------- change orders --

const CO_STATES = [
  "draft",
  "pending_client",
  "client_approved",
  "client_rejected",
  "withdrawn",
] as const;

/**
 * A variation.
 *
 * `costImpact` is **signed** — positive an addition, negative an omission —
 * matching `domain/change-order.ts`, which sums it directly. It travels as a
 * paise wire string, so the sign is part of the string.
 */
export const createChangeOrderInput = z.object({
  projectId: z.uuid(),
  number: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  costImpact: paiseWire,
});
export type CreateChangeOrderInput = z.infer<typeof createChangeOrderInput>;

export const submitChangeOrderInput = z.object({
  expectedVersion: z.number().int().min(1),
});
export type SubmitChangeOrderInput = z.infer<typeof submitChangeOrderInput>;

/**
 * The client's decision.
 *
 * An explicit closed union and a **required** signatory. 
 * `approveChangeOrderAsClient` (`change-orders.js:96-118`) decides by
 * `decision === "Reject"` and treats everything else — a typo, an empty string,
 * a missing field — as approval. A contract variation approved by default is
 * not a signature (CO-03).
 */
export const decideChangeOrderInput = z.object({
  decision: z.enum(["approve", "reject"]),
  signedBy: z.string().min(1).max(200),
  expectedVersion: z.number().int().min(1),
});
export type DecideChangeOrderInput = z.infer<typeof decideChangeOrderInput>;

export const changeOrder = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  number: z.string(),
  title: z.string(),
  description: z.string(),
  costImpact: paiseWire,
  state: z.enum(CO_STATES),
  /** When it was sent to the client; `null` while a draft, and for a variation sent before migration 0101 recorded the moment. */
  submittedAt: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
  version: z.number().int(),
});
export type ChangeOrder = z.infer<typeof changeOrder>;

/**
 * Variations sent to a client and not yet signed — firm-wide, or one project's
 * with `?projectId=`. Work that cannot be billed until they are. `oldest` is
 * the one that has waited longest, by `submittedAt`; a pending variation with
 * no recorded send is listed but never "oldest", because a wait nobody dated
 * is not a number.
 */
export const unsignedVariation = z.object({
  id: z.uuid(),
  number: z.string(),
  title: z.string(),
  projectId: z.uuid(),
  projectCode: z.string(),
  clientName: z.string(),
  costImpact: paiseWire,
  submittedAt: z.string().nullable(),
  /** Whole days since it was sent, the server's count; `null` without a send date. */
  daysWaiting: z.number().int().nonnegative().nullable(),
});
export const unsignedVariationsResponse = z.object({
  count: z.number().int().nonnegative(),
  total: paiseWire,
  /** Longest-waiting first; at most twenty. */
  items: z.array(unsignedVariation),
  oldest: unsignedVariation.nullable(),
});
export type UnsignedVariationsResponse = z.infer<typeof unsignedVariationsResponse>;

/**
 * The pipeline as Today reads it: the quotes a client is sitting on
 * (`proposal_shared`), the leads with a next step dated this month, the leads
 * whose expected close falls this month, and the whole open pipeline
 * unweighted. `month` is the India month it was computed for. Names are
 * client names, the ones a director recognises, at most five each.
 */
export const pipelineSlice = z.object({
  count: z.number().int().nonnegative(),
  total: paiseWire,
  names: z.array(z.string()),
});
export const pipelineSummaryResponse = z.object({
  month: z.string(),
  quoted: pipelineSlice,
  nextStepThisMonth: pipelineSlice,
  closingThisMonth: pipelineSlice,
  open: pipelineSlice,
});
export type PipelineSummaryResponse = z.infer<typeof pipelineSummaryResponse>;

/**
 * The contract value, derived.
 *
 * `original` is what was signed and is never overwritten — CO-02 is that the
 * legacy has no such figure after the first approved variation. `null` when no
 * contract value has been entered: a derived value over an absent original is
 * PROJ-01 in a new place.
 */
export const contractValueResponse = z.object({
  items: z.array(changeOrder),
  contract: z.object({
    original: paiseWire.nullable(),
    current: paiseWire.nullable(),
    approvedVariations: z.number().int(),
    pendingVariations: z.number().int(),
  }),
});
export type ContractValueResponse = z.infer<typeof contractValueResponse>;

// ------------------------------------------------------------- drawings --

/**
 * Issuing a GFC drawing revision.
 *
 * **There is no `fileUrl`.** `DesignView.js:117` invents
 * `https://luxeworx-vault.s3.amazonaws.com/gfc/<no>.pdf` when no file is chosen
 * (GFC-01) and `:87-100` base64-encodes a chosen one into the same field
 * (GFC-02). A drawing references a vault document, or nothing — and "nothing"
 * is an honest state the legacy cannot represent.
 */
export const issueDrawingInput = z.object({
  projectId: z.uuid(),
  drawingNo: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  category: z.enum(["architectural", "structural", "mep", "interior", "other"]).optional(),
  revision: z.string().min(1).max(32),
  documentId: z.uuid().optional(),
});
export type IssueDrawingInput = z.infer<typeof issueDrawingInput>;

export const gfcDrawing = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  drawingNo: z.string(),
  title: z.string(),
  category: z.string(),
  revision: z.string(),
  status: z.enum(["active", "superseded", "withdrawn"]),
  documentId: z.uuid().nullable(),
  uploadedBy: z.uuid(),
});
export type GfcDrawing = z.infer<typeof gfcDrawing>;

// ------------------------------------------------- estimation and takeoff --
// ----------------------------------------------------------- estimation --

/**
 * An estimation item.
 *
 * The four factors and two rates are the inputs; the rate is the answer, and
 * **no field carries it**. Rates are basis points, exact — the legacy stores
 * `overhead_pct` and `margin_pct` as REAL percentages.
 *
 * There is **no `gstPct`**: `rate-analysis.ts` fixes RATE-03 by omission —
 * there is no GST here to default to 18% — and whether a rate carries tax is
 * PO-16 and open.
 */
export const createEstimationItemInput = z.object({
  itemName: z.string().min(1).max(300),
  trade: z.string().max(120).optional(),
  uom: z.string().min(1).max(24),
  materialCost: paiseWire,
  labourCost: paiseWire,
  equipmentCost: paiseWire,
  overheadBp: z.number().int().min(0).max(100_000),
  marginBp: z.number().int().min(0).max(100_000),
  benchmark: z.string().max(200).optional(),
});
export type CreateEstimationItemInput = z.infer<typeof createEstimationItemInput>;

/** The breakdown, recomputed from the stored factors on every read (EST-02). */
export const rateAnalysis = z.object({
  directCost: paiseWire,
  overhead: paiseWire,
  costWithOverhead: paiseWire,
  margin: paiseWire,
  /** PRE-TAX. Composing tax onto it is left to the caller, and PO-16 is open. */
  baseRate: paiseWire,
});
export type RateAnalysisResponse = z.infer<typeof rateAnalysis>;

export const estimationItem = z.object({
  id: z.uuid(),
  itemName: z.string(),
  trade: z.string(),
  uom: z.string(),
  materialCost: paiseWire,
  labourCost: paiseWire,
  equipmentCost: paiseWire,
  overheadBp: z.number().int(),
  marginBp: z.number().int(),
  benchmark: z.string(),
  version: z.number().int(),
  analysis: rateAnalysis,
});
export type EstimationItem = z.infer<typeof estimationItem>;

// -------------------------------------------------------------- takeoff --

/**
 * A takeoff sheet.
 *
 * The scale is an **exact rational** — `scalePxNum` pixels per `scalePxDen`
 * units — not a decimal. `takeoff.js:78` stores `scale_px_per_unit` as REAL and
 * every measured quantity on the sheet is divided by it, so the float reaches
 * every figure.
 *
 * The drawing is a vault document, not a URL. `takeoff.js:78` requires a
 * `drawing_url TEXT NOT NULL` that the view fills with an attachment path.
 */
export const createTakeoffSheetInput = z.object({
  projectId: z.uuid(),
  title: z.string().min(1).max(300),
  floorName: z.string().max(120).optional(),
  documentId: z.uuid().optional(),
  scalePxNum: z.number().int().min(1).optional(),
  scalePxDen: z.number().int().min(1).optional(),
  scaleUnit: z.string().max(16).optional(),
});
export type CreateTakeoffSheetInput = z.infer<typeof createTakeoffSheetInput>;

/**
 * One measured item.
 *
 * `costRate` and `clientRate` are **both optional and neither is derived**.
 * `takeoff.js:337` builds a client rate as `(costRate || 100) * 1.25`, so an
 * uncosted item silently acquires a price resting on a fallback of 100 that
 * nobody chose (TAKE-01).
 */
export const takeoffItemInput = z.object({
  description: z.string().min(1).max(500),
  category: z.string().max(120).optional(),
  uom: z.string().min(1).max(24),
  quantityWhole: z.number().int().min(0),
  quantityMillionths: z.number().int().min(0).max(999_999),
  /** Wastage in basis points of the measured quantity. Explicit, not folded in. */
  wastageBp: z.number().int().min(0).max(100_000).optional(),
  costRate: paiseWire.optional(),
  clientRate: paiseWire.optional(),
  geometry: z.array(z.unknown()).optional(),
});
export type TakeoffItemInput = z.infer<typeof takeoffItemInput>;

/** Items are saved as a set — the sheet is replaced, not patched. */
export const saveTakeoffItemsInput = z.object({
  items: z.array(takeoffItemInput).max(2000),
});
export type SaveTakeoffItemsInput = z.infer<typeof saveTakeoffItemsInput>;

/**
 * Sheet totals.
 *
 * `cost` and `value` are **null unless every item carries the matching rate**,
 * and the items that are missing one are **named**. A total computed over the
 * priced subset looks complete and is not, which is how an under-priced
 * quotation goes out.
 */
export const takeoffSummary = z.object({
  itemCount: z.number().int(),
  /** Ids of items with no client rate. Named, not silently excluded. */
  unpricedItems: z.array(z.uuid()),
  /** Ids of items with no cost rate. */
  uncostedItems: z.array(z.uuid()),
  value: paiseWire.nullable(),
  cost: paiseWire.nullable(),
});
export type TakeoffSummary = z.infer<typeof takeoffSummary>;
// --- read shapes the screens need ---------------------------------------

/**
 * The band a project's committed spend falls in.
 *
 * Computed by `projectHealth` in `services/projects`, never in a browser. The
 * legacy computes it at `ProjectsSidebar.js:10` as `poIssued / pv` — and
 * PROJ-01 makes those two figures identical for every project without a
 * hand-entered budget, so the ratio is exactly 1 and every such project has
 * read "At Risk" permanently.
 */
export const projectHealthBand = z.enum(['no-budget', 'over-budget', 'at-risk', 'on-track']);
export type ProjectHealthBand = z.infer<typeof projectHealthBand>;

/**
 * The bar a project draws on the "ordered against contract" chart, as four
 * widths on ONE scale across the whole list: the largest contract (or, for a
 * project with none, the largest commitment) is 100. Percent with two
 * decimals, computed by `projects` from exact ratios and truncated — a
 * browser never divides money to draw a bar.
 */
export const rollupMeter = z.object({
  /** The contract's width; `0` when there is no contract value. */
  trackPct: z.number().min(0).max(100),
  /** Committed, on the same scale. */
  fillPct: z.number().min(0).max(100),
  /** Where the at-risk band starts; `null` without a contract value. */
  thresholdPct: z.number().min(0).max(100).nullable(),
  /** The run past the contract; `0` unless committed exceeds it. */
  overPct: z.number().min(0).max(100),
});
export type RollupMeter = z.infer<typeof rollupMeter>;

export const projectRollupItem = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  state: projectState,
  contractValue: paiseWire.nullable(),
  committed: paiseWire,
  orderCount: z.number().int(),
  health: projectHealthBand,
  /** Committed as a whole percent of the contract, truncated; `null` without a contract. */
  orderedPct: z.number().int().min(0).nullable(),
  /** Billed to the client so far — every tax invoice issued on the project, gross — summed by finance. `"0"` when none. */
  billed: paiseWire,
  /** Billed as a whole percent of the contract, truncated; `null` without a contract. */
  billedPct: z.number().int().min(0).nullable(),
  meter: rollupMeter,
  /**
   * Approved orders against the BOQ's derived cost budget. `no-boq` carries no
   * figure; `partial` carries one computed over the priced lines, with the
   * count of lines that have no cost rate.
   */
  margin: z.object({
    status: z.enum(['complete', 'partial', 'no-boq']),
    costBudget: paiseWire.nullable(),
    committedApproved: paiseWire,
    atRisk: paiseWire.nullable(),
    unpricedLines: z.number().int().min(0),
    /** The bar: the budget's share of budget plus what is past it, two decimals, truncated; `null` without a BOQ. */
    coveredPct: z.number().min(0).max(100).nullable(),
  }),
});

/**
 * Committed spend against contract value, per project.
 *
 * `threshold.provisional` travels with the answer on purpose: 85 is inherited
 * from `ProjectsSidebar.js:12` and nobody has confirmed it (PO-18), so a screen
 * can say the band was inherited rather than agreed.
 *
 * **Six figures are absent rather than zero** — inflow, outflow, TDS, actual
 * margin, planned margin and balance. All come from the payment path, which is
 * CA-gated. `outflow: 0` would be a claim that nothing has been paid.
 *
 * **Not cursor-paged.** `items` is a ranking, not a stable order over an
 * insert-ordered table, and it is assembled by composing two services' whole-
 * tenant reads (`services/host/src/api/approvals.ts`). `count` is how many
 * projects the ranking holds before `ids` or `limit` narrowed it — the total
 * a screen prints, the same job `count` does on a cursor page.
 */
export const projectRollupResponse = z.object({
  items: z.array(projectRollupItem),
  threshold: z.object({ atRiskPct: z.number().int(), provisional: z.boolean() }),
  unattached: z.object({ committed: paiseWire, orderCount: z.number().int() }),
  /** Every project's committed spend, summed by the server — "ordered so far, all projects". */
  orderedSoFar: paiseWire,
  /** The number of projects in the rollup before `ids` or `limit` narrowed `items`. */
  count: z.number().int().nonnegative(),
});
export type ProjectRollupResponse = z.infer<typeof projectRollupResponse>;

/** What a BOQ write returns: the lines as they were stored. */
export const boqWriteResponse = z.object({
  projectId: z.uuid(),
  items: z.array(boqItem),
});
export type BoqWriteResponse = z.infer<typeof boqWriteResponse>;

export const drawingListResponse = z.object({ items: z.array(gfcDrawing) });
export type DrawingListResponse = z.infer<typeof drawingListResponse>;

export const estimationListResponse = pageOf(estimationItem);
export type EstimationListResponse = z.infer<typeof estimationListResponse>;

/**
 * A takeoff sheet.
 *
 * The scale is an exact rational — `scalePxNum` per `scalePxDen` — and both
 * halves are strings because either may be absent. A sheet has both or neither:
 * half a scale reads as calibrated.
 */
export const takeoffSheet = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  title: z.string(),
  floorName: z.string(),
  documentId: z.uuid().nullable(),
  scalePxNum: z.string().nullable(),
  scalePxDen: z.string().nullable(),
  scaleUnit: z.string(),
  version: z.number().int(),
});
export type TakeoffSheet = z.infer<typeof takeoffSheet>;

export const takeoffSheetListResponse = z.object({ items: z.array(takeoffSheet) });
export type TakeoffSheetListResponse = z.infer<typeof takeoffSheetListResponse>;


// --- the client portal ---------------------------------------------------

/**
 * A project as its CLIENT sees it.
 *
 * `contractValue` is what the client itself signed. There is deliberately no
 * committed spend, no BOQ cost, no margin and **no billing percentage** —
 * TOPOLOGY: a client may never reach vendor pricing, internal margin, or any
 * other project. An isolation test asserts on the response's KEYS that none
 * appears.
 *
 * The legacy portal computes a billing percentage as billed over contract and
 * caps it with `Math.min(100, …)`, so an over-billed project reads as exactly
 * complete. Progress here is counts and a date.
 */
export const clientPortalProject = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  state: z.string(),
  contractValue: paiseWire.nullable(),
  drawingsIssued: z.number().int(),
  reportedDays: z.number().int(),
  lastReportOn: z.string().nullable(),
  measurementsRecorded: z.number().int(),
});
export type ClientPortalProject = z.infer<typeof clientPortalProject>;

export const clientPortalProjectListResponse = z.object({
  items: z.array(clientPortalProject),
});
export type ClientPortalProjectListResponse = z.infer<typeof clientPortalProjectListResponse>;

/** A variation the client is being asked to sign, with its own cost impact only. */
export const clientPortalVariation = z.object({
  id: z.uuid(),
  number: z.string(),
  title: z.string(),
  description: z.string(),
  costImpact: paiseWire,
  state: z.string(),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
  version: z.number().int(),
});
export type ClientPortalVariation = z.infer<typeof clientPortalVariation>;

export const clientPortalVariationListResponse = z.object({
  items: z.array(clientPortalVariation),
});
export type ClientPortalVariationListResponse = z.infer<
  typeof clientPortalVariationListResponse
>;

// ------------------------------------------------------------- project team --

/**
 * One person on one project.
 *
 * `designation` is a job title on this project — "Site engineer" — and is NOT
 * an authorisation role. The distinction is the same one migration 0061 made
 * for lead contacts: what somebody may do is a tenant-wide grant, what they are
 * called on a job is a label somebody typed.
 */
export const projectMember = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  principalId: z.uuid(),
  email: z.string(),
  designation: z.string(),
  addedAt: z.string(),
});
export type ProjectMember = z.infer<typeof projectMember>;

export const projectTeamResponse = z.object({ items: z.array(projectMember) });
export type ProjectTeamResponse = z.infer<typeof projectTeamResponse>;

export const addProjectMemberInput = z.object({
  principalId: z.uuid(),
  designation: z.string().max(80).optional(),
});
export type AddProjectMemberInput = z.infer<typeof addProjectMemberInput>;

/**
 * Trade packages — the list a trade or a BOQ section is supposed to come from.
 *
 * `defaultMarginBp` is nullable and nothing seeds it. A margin is a commercial
 * position, not a fact about masonry; the legacy ships ten of them (18%, 22%,
 * 25%) as demo data and they would otherwise land in the rate of every item
 * created under that trade.
 */
export const tradePackage = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  defaultMarginBp: z.number().int().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type TradePackage = z.infer<typeof tradePackage>;

export const tradePackageListResponse = z.object({ items: z.array(tradePackage) });
export type TradePackageListResponse = z.infer<typeof tradePackageListResponse>;

export const tradePackageInput = z.object({
  code: z.string().min(1).max(16),
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  /** Basis points. Absent means this organisation has not said. */
  defaultMarginBp: z.number().int().min(0).max(9999).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type TradePackageInput = z.infer<typeof tradePackageInput>;

/** Editing carries `isActive`, because retiring one is the only way to remove it. */
export const updateTradePackageInput = tradePackageInput.extend({ isActive: z.boolean() });
export type UpdateTradePackageInput = z.infer<typeof updateTradePackageInput>;

export const tradePackageCreated = z.object({ id: z.uuid() });
export type TradePackageCreated = z.infer<typeof tradePackageCreated>;

/**
 * Folding one opportunity into another.
 *
 * Two ids and nothing else. There is no field for which record's values
 * win: the surviving record's values always win and only its GAPS are
 * filled. Letting a caller choose would mean a merge can silently change a
 * figure somebody quoted from.
 *
 * There is no `sumValues` either. The legacy's project merge adds financial
 * figures together, which is right only if the two records describe
 * different work — and a merge is the assertion that they describe the
 * same work. Two records of one job are not a job of twice the value.
 */
export const mergeLeadsInput = z.object({ secondaryId: z.uuid() });
export type MergeLeadsInput = z.infer<typeof mergeLeadsInput>;

export const mergeLeadsResponse = z.object({
  mergeId: z.uuid(),
  /** How many contacts and timeline entries moved across. */
  repointed: z.number().int(),
  /** Which empty fields on the surviving record were filled, by name. */
  filled: z.array(z.string()),
});
export type MergeLeadsResponse = z.infer<typeof mergeLeadsResponse>;

/**
 * What was merged into this record.
 *
 * `losingBefore` and `primaryBefore` are snapshots, so they are passed
 * through as recorded rather than given a shape here — a schema that
 * validated the snapshot's fields would start rejecting older rows the first
 * time a lead column changed, which is the opposite of what a record is for.
 */
export const leadMerge = z.object({
  id: z.uuid(),
  primaryId: z.uuid(),
  secondaryId: z.uuid(),
  mergedAt: z.string(),
  mergedBy: z.string().nullable(),
  losingBefore: z.record(z.string(), z.unknown()),
  primaryBefore: z.record(z.string(), z.unknown()),
  /**
   * Every child row that moved. `demoted` marks a contact that lost its
   * primary flag on the way across — a change to the row, and therefore part
   * of what putting the merge back would have to undo.
   */
  repointed: z.array(
    z.object({ table: z.string(), id: z.string(), demoted: z.literal(true).optional() }),
  ),
});
export type LeadMerge = z.infer<typeof leadMerge>;

export const leadMergeListResponse = z.object({ items: z.array(leadMerge) });
export type LeadMergeListResponse = z.infer<typeof leadMergeListResponse>;

/**
 * Handing a won opportunity to the people who will build it.
 *
 * The two confirmations are `z.literal(true)`, not `z.boolean()`. A handover
 * with `scopeConfirmed: false` is not a handover with a box unticked — it is
 * a request that cannot succeed, and the type says so before the server does.
 * The database says so too, so a caller added later cannot write one.
 *
 * `loiReceived` is a plain boolean, because starting work on a verbal
 * commitment while the paperwork follows is an ordinary commercial judgement
 * in this trade. What it may not be is unrecorded.
 */
export const handoverLeadInput = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  /** Absent when the value is not settled. Absent is not zero. */
  originalValue: paiseWire.optional(),
  scopeConfirmed: z.literal(true),
  commercialsConfirmed: z.literal(true),
  loiReceived: z.boolean(),
  loiDate: z.iso.date().optional(),
  notes: z.string().max(4000).optional(),
  expectedVersion: z.number().int().min(1),
});
export type HandoverLeadInput = z.infer<typeof handoverLeadInput>;

export const handoverLeadResponse = z.object({
  projectId: z.uuid(),
  handoverId: z.uuid(),
});
export type HandoverLeadResponse = z.infer<typeof handoverLeadResponse>;

/**
 * The Rates screen's measured half: how much was ordered at an agreed rate,
 * and agreed rates against the BOQ cost budget over the lines that can be
 * compared by id (an order line raised from a BOQ line AND priced under a
 * contract). `agreedBpOfBoqCost` above 10000 means vendors were agreed above
 * budget; `null` when no line compares.
 */
export const rateCoverageResponse = z.object({
  orderLines: z.number().int().min(0),
  withoutAgreedRate: z.number().int().min(0),
  withoutTradeCode: z.number().int().min(0),
  linkedLines: z.number().int().min(0),
  comparedLines: z.number().int().min(0),
  unpricedBoqLines: z.number().int().min(0),
  agreedBpOfBoqCost: z.number().int().min(0).nullable(),
});
export type RateCoverageResponse = z.infer<typeof rateCoverageResponse>;

/**
 * The rate library, one row per agreed rate on file: the rate, what was last
 * ordered against it (the newest live order line naming the same vendor and
 * trade), and the BOQ cost rate that line was raised from when it was raised
 * from one. `excessBp` is last ordered against agreed; `agreedBpOfBoqCost`
 * is agreed against the BOQ cost rate — both signed, both the server's, null
 * where there is nothing to compare.
 */
export const rateLibraryRow = z.object({
  itemId: z.uuid(),
  contractId: z.uuid(),
  contractNumber: z.string(),
  vendorId: z.uuid(),
  vendorName: z.string(),
  tradeCode: z.string(),
  description: z.string(),
  uom: z.string(),
  agreedRate: paiseWire,
  validFrom: z.string(),
  validTo: z.string(),
  lastOrdered: z
    .object({ orderId: z.uuid(), orderNumber: z.string(), unitRate: paiseWire, on: z.string() })
    .nullable(),
  excessBp: z.number().int().nullable(),
  boqCostRate: paiseWire.nullable(),
  agreedBpOfBoqCost: z.number().int().nullable(),
});
export const rateLibraryResponse = z.object({
  items: z.array(rateLibraryRow),
  count: z.number().int().min(0),
  /** Over every row, never over a filtered set: rows ordered above their agreed rate, rows never ordered. */
  summary: z.object({ above: z.number().int().min(0), neverOrdered: z.number().int().min(0), contracts: z.number().int().min(0) }),
});
export type RateLibraryRow = z.infer<typeof rateLibraryRow>;
export type RateLibraryResponse = z.infer<typeof rateLibraryResponse>;
