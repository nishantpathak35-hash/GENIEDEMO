import { z } from 'zod';
import { pageOf } from '../pagination.js';
import { basisPointsWire, paiseWire } from '../money.js';

/**
 * Purchase-order request and response shapes.
 *
 * These were declared inside `services/procurement/src/api/routes.ts`, which
 * meant no app could reference them: `eslint.config.mjs` forbids
 * `apps -> services`, and the client it directs apps to did not exist. So the
 * shapes lived in a place nothing outside the service was allowed to read.
 *
 * They live here now, and the service imports them from here — one declaration,
 * so the server and the client cannot drift. A generated client would have
 * needed the same move first, which is what settled that fork.
 */

/** A line as it travels. Money and rates are wire strings, never floats. */
export const purchaseOrderLineInput = z.object({
  description: z.string().min(1).max(500),
  hsnSac: z.string().max(16),
  /**
   * Whole units and millionths, so a quantity never travels as a float.
   * BOQ lines are genuinely fractional — 12.375 sqm — and a float here
   * re-enters money through the back door (M3).
   */
  quantityWhole: z.number().int().min(0),
  quantityMillionths: z.number().int().min(0).max(999_999),
  unitRate: paiseWire,
  gstRate: basisPointsWire,
  /**
   * Which trade this line buys, matching `projects.trade_packages.code`.
   *
   * Optional, and the only key the rate-contract check has. Supplying it means
   * the line is measured against what this vendor agreed for that trade;
   * omitting it means the line is measured against nothing, which the deviation
   * list reports as absence rather than as a pass.
   *
   * Uppercased server-side — `elec` would silently never match `ELEC`, and a
   * check that quietly finds nothing looks exactly like a feature nobody uses.
   */
  tradeCode: z.string().min(1).max(16).optional(),
});

export type PurchaseOrderLineInput = z.infer<typeof purchaseOrderLineInput>;

export const createPurchaseOrderInput = z.object({
  /**
   * Optional. Omit it and the server allocates the next number for the tenant,
   * inside the transaction that inserts the order.
   *
   * The legacy has no such path: `POsView.js:301` asks for a number when the
   * modal opens and `peekNextNumber` hands one back without reserving it, so
   * two users who open the form together are both shown the same number and the
   * second one collides on submit (PO-24). A number chosen before the write is
   * a guess about what will still be free when the write happens.
   */
  number: z.string().min(1).max(64).optional(),
  vendorId: z.uuid(),
  /** The project this order is for. Absent for a general purchase. */
  projectId: z.uuid().optional(),
  lines: z.array(purchaseOrderLineInput).min(1).max(500),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderInput>;

/** What the next number would be. A suggestion: nothing is reserved. */
export const FY_FORMAT_KEYS = ['YYYY-YY', 'YY-YY', 'YYYY', 'YY'] as const;

/**
 * How a document number is spelled.
 *
 * `startingNumber` is here and the COUNTER is not, deliberately. The counter
 * moves in one direction, from an allocation; no request shape in this file can
 * carry it. The legacy settings tab makes it an editable field, and lowering it
 * re-issues numbers already printed on orders sent to vendors.
 */
export const numberSeriesFormat = z.object({
  prefix: z.string(),
  separator: z.string(),
  padding: z.number().int(),
  /** Whether the financial year appears in the number: `PO/2026-27/0001`. */
  includeFy: z.boolean(),
  fyFormat: z.enum(FY_FORMAT_KEYS),
  /** Only legal with `includeFy`, or the same number is issued twice. */
  resetEachFy: z.boolean(),
  startingNumber: z.number().int(),
  /** 'provisional' — nobody has confirmed this tenant's numbering format. */
  status: z.string(),
});
export type NumberSeriesFormat = z.infer<typeof numberSeriesFormat>;

export const purchaseOrderNumberPreview = z.object({
  number: z.string(),
  sequence: z.number().int(),
  /** The financial year the number was filed under, spelled the tenant's way. */
  financialYear: z.string(),
  format: numberSeriesFormat,
});

export const numberSeriesRow = purchaseOrderNumberPreview.extend({
  moduleType: z.string(),
});
export type NumberSeriesRow = z.infer<typeof numberSeriesRow>;

export const numberSeriesListResponse = z.object({ items: z.array(numberSeriesRow) });
export type NumberSeriesListResponse = z.infer<typeof numberSeriesListResponse>;

/**
 * Changing the format of a series.
 *
 * No counter field, and no `status`: saving IS the confirmation, the way
 * saving a role's grants confirms them. A shape that could carry
 * `status: 'confirmed'` would let a caller mark somebody else's guess settled.
 */
export const saveNumberSeriesInput = z.object({
  prefix: z.string().min(1).max(16),
  separator: z.string().max(4),
  padding: z.number().int().min(1).max(12),
  includeFy: z.boolean(),
  fyFormat: z.enum(FY_FORMAT_KEYS),
  resetEachFy: z.boolean(),
  startingNumber: z.number().int().min(0),
});
export type SaveNumberSeriesInput = z.infer<typeof saveNumberSeriesInput>;

export type PurchaseOrderNumberPreview = z.infer<typeof purchaseOrderNumberPreview>;

/**
 * Editing an order.
 *
 * **`expectedVersion` is required, and that is the whole difference from the
 * legacy.** `write.js:96` reads `payload.expectedVersion` and takes the locked
 * branch only when the client sends one — so the client decides whether
 * concurrency control applies to its own write, and omitting the field is the
 * cheaper call. A control the caller can decline is not a control.
 *
 * The lines are sent in full rather than as a patch. A partial line edit needs
 * a merge, a merge needs the prior lines, and the only copy the client has is
 * the one it rendered — which is how a stale line total gets written back.
 */
export const updatePurchaseOrderInput = z.object({
  number: z.string().min(1).max(64),
  vendorId: z.uuid(),
  lines: z.array(purchaseOrderLineInput).min(1).max(500),
  expectedVersion: z.number().int().min(1),
});

export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderInput>;

/**
 * Renaming an order.
 *
 * Its own endpoint, and in the new model it updates **one row** — `number` is a
 * display attribute and `id` is what everything references. In the legacy the
 * number *is* the primary key, so `write.js:142` cascades a rename across
 * `po_items`, `payment_requests`, `system_payments`, `manual_payments` and
 * `po_approval_history` with five loose UPDATEs and no transaction — while
 * `boq_items` (`migrations.js:178`) and `vendor_retention_ledger`
 * (`migrations.js:273`) also carry `po_no` and are **not** in that list.
 *
 * See PO-19 in STACK-MIGRATION: that code has never executed, because the
 * statement above it references a column that does not exist.
 */
export const renamePurchaseOrderInput = z.object({
  number: z.string().min(1).max(64),
  expectedVersion: z.number().int().min(1),
});

export type RenamePurchaseOrderInput = z.infer<typeof renamePurchaseOrderInput>;

/**
 * Raising a purchase order against BOQ lines.
 *
 * **No monetary figure appears in this shape, and no state.** The legacy's
 * equivalent takes `poValue` (`boq.js:170`) and writes `status` and
 * `approval_status` as `'Approved'` (`:174`, `:253`), so a caller decides both
 * what the order is worth and that it is approved. Here the totals are computed
 * from the BOQ lines' cost rates and the order is created in `draft`.
 *
 * `gstRate` is supplied rather than inferred, exactly as on
 * `purchaseOrderLineInput`. BOQ lines carry no tax rate, so it cannot come from
 * them, and the legacy's hardcoded `tax_pct: 18` (`boq.js:244`) would be
 * answering CA-16 by inference. One rate for the selection is what the data
 * supports today; per-line rates become meaningful when CA-16 settles.
 */
export const createPurchaseOrderFromBoqInput = z.object({
  projectId: z.uuid(),
  vendorId: z.uuid(),
  boqItemIds: z.array(z.uuid()).min(1).max(500),
  gstRate: basisPointsWire,
  /** Optional, as on a direct create: omit and the server allocates one. */
  number: z.string().min(1).max(64).optional(),
});

export type CreatePurchaseOrderFromBoqInput = z.infer<typeof createPurchaseOrderFromBoqInput>;

/** What a write returns: the new version, so the next edit can send it back. */
export const purchaseOrderWriteResponse = z.object({
  id: z.uuid(),
  number: z.string(),
  state: z.string(),
  version: z.number().int(),
  taxable: paiseWire,
  gst: paiseWire,
  gross: paiseWire,
});

export type PurchaseOrderWriteResponse = z.infer<typeof purchaseOrderWriteResponse>;

/**
 * What pricing a draft returns.
 *
 * Every figure is a `PaiseWire` — a digit-only string — and **not displayable
 * as it stands**. That is deliberate, and it is the point: the caller must go
 * through `@cog/money` to parse and format, which is the only module permitted
 * to do arithmetic on money (ADR-0012). A screen that renders one of these
 * directly would be showing paise as though they were rupees, and would be
 * caught the moment anyone looked at it.
 */
export const purchaseOrderTotalsResponse = z.object({
  taxable: paiseWire,
  gst: paiseWire,
  gross: paiseWire,
});

export type PurchaseOrderTotalsResponse = z.infer<typeof purchaseOrderTotalsResponse>;

export const purchaseOrderListItem = z.object({
  id: z.uuid(),
  number: z.string(),
  state: z.string(),
  version: z.number().int(),
  vendorId: z.uuid(),
  /** `null` only if the vendor row is gone; the join is LEFT for that reason. */
  vendorName: z.string().nullable(),
  projectId: z.uuid().nullable(),
  taxable: paiseWire,
  gst: paiseWire,
  /** `taxable + gst`. NOT net of TDS — see PO-23 and migration 0020. */
  gross: paiseWire,
  createdAt: z.string(),
});

export const purchaseOrderListResponse = pageOf(purchaseOrderListItem);

export type PurchaseOrderListResponse = z.infer<typeof purchaseOrderListResponse>;

/**
 * What the middleware resolved for this request.
 *
 * Not diagnostics for their own sake: this is how a screen discovers which
 * tenant it is showing, and it is the endpoint that distinguishes "no
 * organisation could be determined" from "this organisation has no data".
 */
export const whoamiResponse = z.object({
  tenantId: z.string(),
  principalId: z.string(),
  principalKind: z.string(),
  requestId: z.string(),
});

export type WhoamiResponse = z.infer<typeof whoamiResponse>;

/**
 * What a vendor is in law. The CA's answer to CA-07 names "individual, HUF,
 * firm, company, etc."; `other` is the rest — a trust, a society, an AOP.
 */
export const VENDOR_CONSTITUTIONS = ['individual', 'huf', 'firm', 'company', 'other'] as const;
export type VendorConstitution = (typeof VENDOR_CONSTITUTIONS)[number];

/**
 * A vendor as it travels.
 *
 * **No bank account and no IFSC.** They are in `procurement.vendor_bank_accounts`
 * and no vendor read returns them. `vendors.js:42` does `SELECT *` and hands
 * back `accountNo` and `ifsc` to any authenticated caller (VEND-02); the shape
 * here is what makes that impossible rather than merely discouraged.
 */
export const vendor = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  status: z.string(),
  gstin: z.string().nullable(),
  pan: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  /** What a payment to this vendor is deducted under (CA-07); `null` means nothing is. */
  tdsSection: z.enum(['194C', '194I', '194J', '194Q']).nullable(),
  /** 194I: plant or building. 194J: technical or professional. Otherwise `null`. */
  tdsPayeeClass: z.enum(['plant_machinery', 'land_building', 'technical', 'professional']).nullable(),
  /** A PAN on file that is inoperative is treated as no PAN (CA-11). */
  panInoperative: z.boolean(),
  /** What the vendor is in law, as recorded; under 194C it decides 1% or 2% (CA-07). `null` is not recorded. */
  constitution: z.enum(VENDOR_CONSTITUTIONS).nullable(),
  /** What the PAN's fourth character reads as — a cross-check, never the rule. `null` without a PAN. */
  constitutionFromPan: z.enum(VENDOR_CONSTITUTIONS).nullable(),
  /** The recorded constitution and the PAN disagree: shown, never corrected (CA-07). */
  constitutionMismatch: z.boolean(),
  /** Send back as `expectedVersion` on the next edit. */
  version: z.number().int(),
});

export type Vendor = z.infer<typeof vendor>;

/**
 * Creating a vendor.
 *
 * GSTIN and PAN are format-checked and **optional**. Absent means not supplied;
 * there is no placeholder, because `tdsChallan281.js:54` fabricates a default
 * TAN into filed 26Q content and that is the failure this refuses to repeat.
 */
export const createVendorInput = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(64),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, "not a valid GSTIN")
    .optional(),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "not a valid PAN").optional(),
  email: z.email().max(320).optional(),
  phone: z.string().max(32).optional(),
  address: z.string().max(1000).optional(),
});

export type CreateVendorInput = z.infer<typeof createVendorInput>;

/** Editing a vendor. `expectedVersion` required, as everywhere else. */
export const updateVendorInput = createVendorInput.extend({
  status: z.enum(["active", "inactive"]),
  expectedVersion: z.number().int().min(1),
});

export type UpdateVendorInput = z.infer<typeof updateVendorInput>;

/**
 * A vendor's TDS profile (CA-07). A kind is required for rent (194I) and fees
 * (194J) and refused under any other section. The constitution is what the
 * vendor is in law, and under 194C it decides the rate (the CA's answer to
 * CA-07). A 194C(6) declaration is a record of its own, with its evidence
 * (`recordTransporterDeclarationInput`). Rates are finance's, and provisional.
 */
export const vendorTdsProfileInput = z
  .object({
    tdsSection: z.enum(['194C', '194I', '194J', '194Q']).nullable(),
    tdsPayeeClass: z.enum(['plant_machinery', 'land_building', 'technical', 'professional']).nullable(),
    panInoperative: z.boolean(),
    constitution: z.enum(VENDOR_CONSTITUTIONS).nullable(),
  })
  .refine(
    (v) =>
      v.tdsSection === '194I'
        ? v.tdsPayeeClass === 'plant_machinery' || v.tdsPayeeClass === 'land_building'
        : v.tdsSection === '194J'
          ? v.tdsPayeeClass === 'technical' || v.tdsPayeeClass === 'professional'
          : v.tdsPayeeClass === null,
    {
      message:
        'Rent (194I) needs plant or building, fees (194J) technical or professional, and no other section takes a kind.',
      path: ['tdsPayeeClass'],
    },
  );
export type VendorTdsProfileInput = z.infer<typeof vendorTdsProfileInput>;

/**
 * Recording a transporter's 194C(6) declaration — the CA's answer to CA-07: "the
 * vendor's name, PAN, financial year, confirmation that the statutory
 * goods-carriage ownership condition is satisfied, date and authorised
 * signature/declaration evidence". The name and PAN are the vendor's, copied
 * when it is recorded; the evidence is a document registered in the vault
 * against this vendor.
 */
export const recordTransporterDeclarationInput = z.object({
  financialYear: z.string().regex(/^[0-9]{4}-[0-9]{2}$/, 'a financial year, as 2026-27'),
  declaredOn: z.iso.date(),
  goodsCarriageConfirmed: z.literal(true, {
    message: 'The declaration has to confirm the goods-carriage condition of s.194C(6).',
  }),
  evidenceDocumentId: z.uuid(),
});
export type RecordTransporterDeclarationInput = z.infer<typeof recordTransporterDeclarationInput>;

export const transporterDeclaration = z.object({
  id: z.uuid(),
  vendorId: z.uuid(),
  vendorName: z.string(),
  pan: z.string(),
  financialYear: z.string(),
  goodsCarriageConfirmed: z.boolean(),
  declaredOn: z.string(),
  evidenceDocumentId: z.uuid(),
  /** The evidence's file name, or `null` when the vault no longer holds it against this vendor. */
  evidenceFileName: z.string().nullable(),
  recordedAt: z.string(),
});
export type TransporterDeclaration = z.infer<typeof transporterDeclaration>;

/**
 * A vendor's declarations, newest year first; the documents registered against
 * it, which are what a declaration's evidence may be; and the financial year it
 * is today, in India.
 */
export const transporterDeclarationListResponse = z.object({
  items: z.array(transporterDeclaration),
  count: z.number().int().nonnegative(),
  evidence: z.array(z.object({ id: z.uuid(), fileName: z.string() })),
  currentFinancialYear: z.string(),
});
export type TransporterDeclarationListResponse = z.infer<typeof transporterDeclarationListResponse>;

/**
 * A vendor as it appears in the LIST — `vendor` plus the per-vendor figures
 * the screen used to compute client-side by joining the whole order and
 * contract lists against every row (`apps/web/.../vendors/page.tsx`, before
 * this moved server-side). Computed once, server-side, over the whole table —
 * never derived from `items` on the page the client happens to be looking at.
 */
export const vendorListItem = vendor.extend({
  /** Orders in draft, pending_approval or approved — the screen's OPEN_STATES. */
  openOrders: z.number().int(),
  /** Gross of those open orders, summed. `'0'` when there are none. */
  openOrdersTotal: paiseWire,
  /** Rate contracts naming this vendor. */
  contractCount: z.number().int(),
  /** This vendor's bills submitted and not yet checked. */
  billsWaiting: z.number().int(),
  /** The most recent order raised against this vendor, or `null` if none ever was. */
  lastOrderedAt: z.string().nullable(),
});
export type VendorListItem = z.infer<typeof vendorListItem>;

/**
 * The vendors screen's stat row, computed over every vendor — never over one
 * page of them. `billsWaiting` counts `vendor_bills` in `submitted` state:
 * there is no decision column, so "submitted" is the whole of "waiting".
 */
export const vendorListSummary = z.object({
  registered: z.number().int(),
  active: z.number().int(),
  /** Rate contracts recorded, across every vendor. */
  agreedRates: z.number().int(),
  openOrders: z.object({
    count: z.number().int(),
    vendors: z.number().int(),
    total: paiseWire,
  }),
  billsWaiting: z.object({ count: z.number().int() }),
  /** Rate-contract ITEMS whose validity ends within 30 days, one count per contract — and the first five named, soonest first. */
  contractsExpiringIn30Days: z.object({
    count: z.number().int(),
    contracts: z.array(z.object({ id: z.uuid(), number: z.string(), vendorName: z.string(), validTo: z.string() })),
  }),
  /** Active vendors with no PAN or no GSTIN on file — the header's chip; the first three named. */
  withoutTaxIds: z.object({ count: z.number().int(), names: z.array(z.string()) }),
});
export type VendorListSummary = z.infer<typeof vendorListSummary>;

export const vendorListResponse = pageOf(vendorListItem).extend({ summary: vendorListSummary });
export type VendorListResponse = z.infer<typeof vendorListResponse>;

// ------------------------------------------------------------- inventory --

/**
 * A quantity, as whole units and millionths.
 *
 * Never a decimal string and never a float. The legacy stores stock as `REAL`
 * and multiplies it by a unit price for valuation (`InventoryView.js:79`),
 * which puts a float on the money path.
 */
const quantityFields = {
  quantityWhole: z.number().int().min(0),
  quantityMillionths: z.number().int().min(0).max(999_999),
};

export const createStockItemInput = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(80).optional(),
  uom: z.string().min(1).max(24),
  reorderWhole: z.number().int().min(0).optional(),
});
export type CreateStockItemInput = z.infer<typeof createStockItemInput>;

/** A receipt or an issue. One movement, one warehouse. */
export const stockMovementInput = z.object({
  stockItemId: z.uuid(),
  warehouse: z.string().min(1).max(120),
  ...quantityFields,
  reference: z.string().max(200).optional(),
  /**
   * Price per unit, in paise, on a RECEIPT only.
   *
   * The issue endpoint parses the same schema and ignores this, deliberately:
   * an issue is valued at what the stock already cost. If an issue could name
   * its own rate, somebody could write inventory down by issuing it cheaply and
   * receiving it back — and `write.js:55` in the legacy already shows what
   * happens when a client-supplied monetary figure is trusted.
   *
   * Optional, and absent is honest. A receipt with no price recorded makes the
   * balance unvaluable rather than free.
   */
  unitRatePaise: paiseWire.optional(),
  /**
   * On a RECEIPT only: whether the goods were counted into the store as they
   * arrived. `false` records a delivery at the gate — it is on the ledger, it
   * is NOT in the balance, and it waits on the storekeeper's count
   * (`checkInReceipt`) so a short or damaged delivery is caught before
   * anybody issues against it. Absent means counted, which is how every
   * receipt was recorded before this field existed.
   */
  checkedIn: z.boolean().optional(),
});
export type StockMovementInput = z.infer<typeof stockMovementInput>;

/**
 * A transfer between warehouses.
 *
 * Two movements, written together. `createTransfer` in the legacy
 * (`inventory.js:143`) records a transfer and never touches stock at all, so
 * the source keeps its quantity and the destination never gains it (INV-01).
 */
export const stockTransferInput = z.object({
  stockItemId: z.uuid(),
  fromWarehouse: z.string().min(1).max(120),
  toWarehouse: z.string().min(1).max(120),
  ...quantityFields,
  reference: z.string().max(200).optional(),
});
export type StockTransferInput = z.infer<typeof stockTransferInput>;

/**
 * A stock balance.
 *
 * **Value, at last, and still no unit price.** The legacy keeps one
 * `unit_price` column that each goods receipt overwrites — the last price paid
 * rather than a cost basis — and `InventoryView.js:79` multiplies it by
 * quantity in the browser to show a total. INV-03 is now answered provisionally
 * (moving weighted average, from `inventory.js:61`), so a real value is
 * returned. It is still not a unit price: a stored quotient rounds, and a
 * ledger whose rounded unit costs no longer multiply back to its own total is
 * worse than one with no unit cost at all. Divide on display if a screen wants
 * one.
 */
export const stockBalance = z.object({
  id: z.uuid(),
  name: z.string(),
  category: z.string(),
  uom: z.string(),
  warehouse: z.string(),
  quantityMicros: z.string(),
  reorderLevel: z.string(),
  belowReorder: z.boolean(),
  /**
   * On hand as a whole percent of the reorder level, for the level bar —
   * computed by the server from two quantities, never in a browser. `null`
   * when the reorder level is zero (no level to measure against). Capped at
   * 999 so a well-stocked item cannot overflow the column it is drawn in.
   */
  levelPct: z.number().int().min(0).max(999).nullable(),
  /** Received at the gate and not yet counted in, in millionths; `"0"` when none. */
  awaitingCheckInMicros: z.string(),
  /**
   * `null` means UNVALUABLE, not zero.
   *
   * A balance whose ledger holds a movement recorded before valuation existed
   * cannot be valued, and a screen must render that as an absence rather than
   * as a total. `formatIndianRupeesOrDash` exists for exactly this and prints a
   * dash, never a confident zero.
   */
  valuePaise: paiseWire.nullable(),
});
export type StockBalance = z.infer<typeof stockBalance>;

/**
 * How a tenant values stock, and whether anybody agreed to it.
 *
 * `provisional` is the honest default: INV-03's answer was read out of a legacy
 * tree at `inventory.js:61`, not chosen by a finance director. A screen showing
 * a valuation says so.
 */
export const costingPolicyResponse = z.object({
  method: z.enum(['weighted_average']),
  status: z.enum(['provisional', 'confirmed']),
});
export type CostingPolicyResponse = z.infer<typeof costingPolicyResponse>;

/**
 * A stock item as defined, before anything has moved.
 *
 * `stockBalance` is a balance and only exists once a movement does;
 * this is the definition, and it is what a receipt form has to choose from.
 */
export const stockItem = z.object({
  id: z.uuid(),
  name: z.string(),
  category: z.string(),
  uom: z.string(),
  reorderLevel: z.string(),
});
export type StockItem = z.infer<typeof stockItem>;

export const stockItemListResponse = pageOf(stockItem);
export type StockItemListResponse = z.infer<typeof stockItemListResponse>;

/** The site picker's options, and the below-reorder count over every balance. */
export const stockListSummary = z.object({
  balances: z.number().int(),
  belowReorder: z.number().int(),
  /** Receipts recorded at the gate and not yet counted into a store. */
  awaitingCheckIn: z.number().int(),
  warehouses: z.array(z.string()),
});
export type StockListSummary = z.infer<typeof stockListSummary>;

export const stockListResponse = pageOf(stockBalance).extend({ summary: stockListSummary });

/**
 * A store or a site store stock is kept in (0091). The register the movement
 * forms offer; the ledger still names its warehouse as text. Retired, never
 * deleted — movements still name it.
 */
export const stockLocation = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(['store', 'site']),
  projectId: z.uuid().nullable(),
  retired: z.boolean(),
});
export type StockLocation = z.infer<typeof stockLocation>;

export const stockLocationListResponse = pageOf(stockLocation);
export type StockLocationListResponse = z.infer<typeof stockLocationListResponse>;

export const createStockLocationInput = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['store', 'site']).default('store'),
  projectId: z.uuid().optional(),
});
export type CreateStockLocationInput = z.infer<typeof createStockLocationInput>;

/** A receipt at the gate: on the ledger, not yet in any balance. */
export const awaitingReceipt = z.object({
  id: z.uuid(),
  stockItemId: z.uuid(),
  name: z.string(),
  uom: z.string(),
  warehouse: z.string(),
  quantityMicros: z.string(),
  reference: z.string(),
  receivedAt: z.string(),
});
export type AwaitingReceipt = z.infer<typeof awaitingReceipt>;

export const awaitingReceiptListResponse = pageOf(awaitingReceipt);
export type AwaitingReceiptListResponse = z.infer<typeof awaitingReceiptListResponse>;
export type StockListResponse = z.infer<typeof stockListResponse>;

// ------------------------------------------------------------- retention --

/**
 * Recording retention against a purchase order.
 *
 * The **rate** is the input; the amount is computed from the order gross and
 * never supplied. `retention_pct REAL DEFAULT 5` in the legacy is a float and a
 * default nobody chose; basis points here, so 5% is 500 and exact.
 *
 * There is no release endpoint. A release is a payment (CA-01..CA-08), and the
 * legacy release writes no payment record at all (RET-02).
 */
export const recordRetentionInput = z.object({
  purchaseOrderId: z.uuid(),
  retentionRateBp: z.number().int().min(0).max(10_000),
});
export type RecordRetentionInput = z.infer<typeof recordRetentionInput>;

export const retentionHolding = z.object({
  id: z.uuid(),
  purchaseOrderId: z.uuid(),
  vendorId: z.uuid(),
  grossAmount: paiseWire,
  retainedAmount: paiseWire,
  retentionRateBp: z.number().int(),
  stage: z.enum(["held", "released"]),
  version: z.number().int(),
});
export type RetentionHolding = z.infer<typeof retentionHolding>;
// --- read shapes the screens need ---------------------------------------

export const retentionListResponse = pageOf(retentionHolding);
export type RetentionListResponse = z.infer<typeof retentionListResponse>;

/** A created stock item. The id, and nothing derived from it. */
export const createdId = z.object({ id: z.uuid() });
export type CreatedId = z.infer<typeof createdId>;

/**
 * A completed transfer.
 *
 * The id links the two movements that must sum to zero. INV-01 is what this
 * shape is about: `createTransfer` in the legacy writes a transfer row and
 * never touches the stock, so the source keeps its quantity and the
 * destination never gains it.
 */
export const stockTransferResponse = z.object({ transferId: z.uuid() });
export type StockTransferResponse = z.infer<typeof stockTransferResponse>;

/**
 * An order raised from BOQ lines.
 *
 * `state` is always `draft` — that is the property BOQ-03 was about, and the
 * isolation suite asserts it. The BOQ lines it consumed come back so the screen
 * can say which ones were ordered without re-deriving it.
 */
export const purchaseOrderFromBoqResponse = purchaseOrderWriteResponse.extend({
  boqItemIds: z.array(z.uuid()),
});
export type PurchaseOrderFromBoqResponse = z.infer<typeof purchaseOrderFromBoqResponse>;


// --- the vendor portal ---------------------------------------------------

/**
 * An order as its VENDOR sees it.
 *
 * `gross` is `taxable + gst` and is not net of anything. There is deliberately
 * no TDS field, no retention field and no paid or outstanding figure: those are
 * CA-01..CA-08, and a figure nobody has verified must not reach an outside
 * party. An isolation test asserts on the response's KEYS that none appears.
 */
export const vendorPortalOrder = z.object({
  id: z.uuid(),
  number: z.string(),
  state: z.string(),
  taxable: paiseWire,
  gst: paiseWire,
  gross: paiseWire,
  createdAt: z.string(),
  /** The vendor's own last answer to this order, or `null` if they have not answered. */
  acceptance: z.enum(['accepted', 'rejected']).nullable(),
});
export type VendorPortalOrder = z.infer<typeof vendorPortalOrder>;

/**
 * Who is signed in to a portal, for its bar and its head (`10-portals.html`):
 * the person's name, the organisation they belong to (the vendor, or the
 * client's projects), and whose portal it is — the firm's name. Nothing
 * internal: no codes, no ids beyond the project's for its link.
 */
export const portalWhoamiResponse = z.object({
  kind: z.enum(['vendor', 'client']),
  /** What a colleague calls them, or their address when nobody gave a name. */
  name: z.string(),
  email: z.string(),
  /** The vendor's name for a vendor; the client's name on the first project for a client. */
  organisation: z.string(),
  /** The firm whose portal this is. */
  firm: z.string(),
  /** A client's projects, by the name a client knows them by. Empty for a vendor. */
  projects: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type PortalWhoamiResponse = z.infer<typeof portalWhoamiResponse>;

export const vendorPortalOrderListResponse = pageOf(vendorPortalOrder);
export type VendorPortalOrderListResponse = z.infer<typeof vendorPortalOrderListResponse>;

export const vendorPortalLine = z.object({
  lineNo: z.number().int(),
  description: z.string(),
  hsnSac: z.string(),
  quantityMicros: z.string(),
  unitRate: paiseWire,
  gstRate: z.number().int(),
});

export const vendorPortalLineListResponse = z.object({
  items: z.array(vendorPortalLine),
});
export type VendorPortalLineListResponse = z.infer<typeof vendorPortalLineListResponse>;

export const acceptOrderInput = z.object({
  decision: z.enum(['accepted', 'rejected']),
  remarks: z.string().max(2000).optional(),
});
export type AcceptOrderInput = z.infer<typeof acceptOrderInput>;

export const orderAcceptanceResponse = z.object({
  id: z.uuid(),
  decision: z.string(),
});
export type OrderAcceptanceResponse = z.infer<typeof orderAcceptanceResponse>;

/**
 * A running-account bill, as submitted.
 *
 * `amountClaimed` is what the vendor said the work is worth, stored exactly.
 * **A claim is not a payable**: nothing deducts from it, nothing nets it, and
 * there is no approved-amount field for a later step to fill in.
 */
export const vendorBill = z.object({
  id: z.uuid(),
  purchaseOrderId: z.uuid(),
  billNumber: z.string(),
  amountClaimed: paiseWire,
  periodFrom: z.string().nullable(),
  periodTo: z.string().nullable(),
  narrative: z.string(),
  state: z.enum(['submitted', 'acknowledged', 'returned']),
  submittedAt: z.string(),
  /** When it is payable, once acknowledged — a date, never a figure. */
  dueOn: z.string().nullable(),
  /** When it was paid. What was deducted is on the payments read. */
  paidOn: z.string().nullable(),
});
export type VendorBill = z.infer<typeof vendorBill>;

export const vendorBillListResponse = pageOf(vendorBill);
export type VendorBillListResponse = z.infer<typeof vendorBillListResponse>;

export const submitBillInput = z.object({
  purchaseOrderId: z.uuid(),
  billNumber: z.string().min(1).max(64),
  /** A positive amount of paise. A zero-value claim is not a claim. */
  amountClaimed: paiseWire.regex(/^[1-9][0-9]*$/, 'a claim must be a positive amount'),
  periodFrom: z.iso.date().optional(),
  periodTo: z.iso.date().optional(),
  narrative: z.string().max(4000).optional(),
});
export type SubmitBillInput = z.infer<typeof submitBillInput>;

export const submittedBillResponse = z.object({
  id: z.uuid(),
  billNumber: z.string(),
});
export type SubmittedBillResponse = z.infer<typeof submittedBillResponse>;

/**
 * Sending a draft order for approval.
 *
 * `expectedVersion` is required and has no default: submitting an order
 * somebody has edited under you sends a different order for approval than the
 * one that was read, and the approver would be signing off on something the
 * submitter never saw.
 */
export const submitPurchaseOrderInput = z.object({
  expectedVersion: z.number().int().min(1),
});
export type SubmitPurchaseOrderInput = z.infer<typeof submitPurchaseOrderInput>;

export const purchaseOrderStateResponse = z.object({
  id: z.uuid(),
  state: z.enum(['draft', 'pending_approval', 'approved', 'cancelled']),
  version: z.number().int(),
});
export type PurchaseOrderStateResponse = z.infer<typeof purchaseOrderStateResponse>;

// ------------------------------------------------------- rate contracts ----

/**
 * What a vendor agreed to charge for a trade, over a period.
 *
 * The rung between the trade catalogue and a purchase order price. Every field
 * the legacy defaulted is absent here instead: no `gst_pct 18`, no `min_qty 1`,
 * no `lead_days 3`, no `payment_terms '30 Days Net'`, no `valid_to
 * '2026-12-31'`.
 */
export const rateContractItemInput = z.object({
  tradeCode: z.string().min(1).max(16),
  description: z.string().min(1).max(500),
  uom: z.string().min(1).max(24),
  /** PAISE. Commercial, not statutory — no CA gate, still an exact integer. */
  contractRate: paiseWire,
  validFrom: z.iso.date(),
  validTo: z.iso.date(),
});

export const rateContractInput = z.object({
  vendorId: z.uuid(),
  number: z.string().min(1).max(40),
  title: z.string().min(1).max(200),
  status: z.enum(['draft', 'active', 'withdrawn']).default('draft'),
  /** NULL rather than a default nobody negotiated. */
  paymentTerms: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(rateContractItemInput).max(200).default([]),
});

export type RateContractInputWire = z.infer<typeof rateContractInput>;

export const rateContractSummary = z.object({
  id: z.uuid(),
  vendorId: z.uuid(),
  vendorName: z.string(),
  number: z.string(),
  title: z.string(),
  status: z.string(),
  paymentTerms: z.string().nullable(),
  notes: z.string(),
});

export const rateContractsResponse = pageOf(rateContractSummary).extend({
  /** In-force count over every contract, never over one page of them. */
  summary: z.object({ active: z.number().int() }),
});

export const rateContractDetail = rateContractSummary.extend({
  items: z.array(
    z.object({
      id: z.uuid(),
      tradeCode: z.string(),
      description: z.string(),
      uom: z.string(),
      contractRatePaise: paiseWire,
      validFrom: z.string(),
      validTo: z.string(),
    }),
  ),
});

/**
 * A purchase-order line priced above its contracted rate.
 *
 * The reason the tables exist. `excessBp` is computed server-side in
 * `packages/money` — it is a division of money, which `apps/` may not do.
 */
export const rateDeviation = z.object({
  purchaseOrderId: z.uuid(),
  purchaseOrderNumber: z.string(),
  vendorName: z.string(),
  lineNo: z.number().int(),
  description: z.string(),
  tradeCode: z.string(),
  contractedUnitRatePaise: paiseWire,
  actualUnitRatePaise: paiseWire,
  excessBp: z.number().int(),
});

export const rateDeviationsResponse = pageOf(rateDeviation);

/**
 * An order's own lines, staff-side — the full order page's table. `amount`
 * and `gst` are the server's, from the same arithmetic that made the order's
 * totals. `contractedUnitRate` is the agreed rate the line was priced against
 * when it was written, null where there was none; `excessBp` is signed and
 * null where there is nothing to measure against.
 */
export const purchaseOrderLine = z.object({
  lineNo: z.number().int(),
  description: z.string(),
  hsnSac: z.string(),
  tradeCode: z.string().nullable(),
  boqItemId: z.uuid().nullable(),
  quantityMicros: z.string(),
  unitRate: paiseWire,
  gstRate: z.number().int(),
  contractedUnitRate: paiseWire.nullable(),
  amount: paiseWire,
  gst: paiseWire,
  excessBp: z.number().int().nullable(),
});

export const purchaseOrderLinesResponse = z.object({ items: z.array(purchaseOrderLine) });
export type PurchaseOrderLine = z.infer<typeof purchaseOrderLine>;
export type PurchaseOrderLinesResponse = z.infer<typeof purchaseOrderLinesResponse>;
