import { asConstitution, constitutionFromPan, constitutionMismatch } from '../domain/vendor-constitution.js';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  HTTP_STATUS,
  createPurchaseOrderInput,
  createStockItemInput,
  createVendorInput,
  rateContractInput,
  recordRetentionInput,
  stockMovementInput,
  createStockLocationInput,
  stockTransferInput,
  updateVendorInput,
  vendorTdsProfileInput,
  acknowledgeBillInput,
  billView,
  renamePurchaseOrderInput,
  updatePurchaseOrderInput,
} from '@cog/contracts';
import { bp, fromWire, toWire } from '@cog/money';
import { finishPage, keyset, readPage, tenantOf, txOf, type KeyType } from '@cog/service-kit';
import type { TxLike } from '../application/approval-subject.js';
import { purchaseOrderLines } from '../application/purchase-order-lines.js';
import {
  DuplicateContractNumber,
  OverlappingContractRate,
  RateContractNotFound,
  UnknownVendor,
  activeRateContractCount,
  createRateContract,
  deleteRateContract,
  getRateContract,
  listRateContracts,
  listRateDeviations,
  updateRateContract,
} from '../application/rate-contracts.js';
import { PO_STATES, PurchaseOrderError, purchaseOrderTotals, quantity } from '../domain/purchase-order.js';
import {
  PurchaseOrderNotFound,
  PurchaseOrderStaleWrite,
} from '../application/approval-subject.js';
import { previewNumber } from '../application/number-series.js';
import {
  RetentionRefused,
  listRetention,
  recordRetention,
} from '../application/retention.js';
import {
  DuplicateStockItem,
  InsufficientStock,
  InvalidMovement,
  StockItemNotFound,
  createStockItem,
  issueStock,
  listStock,
  loadCostingPolicy,
  listStockItems,
  receiveStock,
  stockSummary,
  listAwaitingReceipts,
  checkInReceipt,
  ReceiptNotAwaitingCheckIn,
  transferStock,
} from '../application/inventory.js';
import {
  DuplicateStockLocation,
  StockLocationNotFound,
  createStockLocation,
  listStockLocations,
  retireStockLocation,
} from '../application/stock-locations.js';
import {
  DuplicateVendorCode,
  VendorInUse,
  VendorNotFound,
  VendorStaleWrite,
  createVendor,
  deleteVendor,
  getVendor,
  updateVendor,
  setVendorTdsProfile,
  VendorTdsProfileRefused,
} from '../application/vendors.js';
import {
  BillNotFound,
  BillRefused,
  acknowledgeBill,
  listStaffBills,
  payablesSummary,
} from '../application/payables.js';
import { todayInIndia } from '../domain/payables.js';
import { payablesAgeing } from '../application/dashboard.js';
import {
  DuplicatePurchaseOrderNumber,
  createPurchaseOrder,
  renamePurchaseOrder,
  updatePurchaseOrder,
  toWriteResponse,
} from '../application/purchase-order-writes.js';

/**
 * Purchase-order HTTP surface.
 *
 * Mounted by `services/host` **behind the tenant middleware**, so every handler
 * here already has a `TenantContext` and an open transaction. Nothing in this
 * file reads a tenant id from the request — it comes from the authenticated
 * principal, and there is no parameter by which a caller could supply one.
 *
 * This replaces part of the 217-name RPC allowlist. The difference is not the
 * transport: it is that authorisation happens in one place before the handler
 * runs, rather than being each of 216 functions' own responsibility.
 */

/**
 * The request and response shapes live in `packages/contracts`, and this
 * service mounts from the same declaration the client calls with. They were
 * declared here, which put them somewhere no app was permitted to read — the
 * boundary rule forbids `apps -> services`, so a shape that only existed in a
 * service could not be shared with the screen that had to produce it.
 */

function contractNotFound(c: Context): Response {
  return c.json(
    {
      code: 'NOT_FOUND' as const,
      message: 'No such rate contract.',
      requestId: tenantOf(c).requestId,
    },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

/**
 * A refusal that names what to do about it.
 *
 * `OverlappingContractRate` is the exclusion constraint speaking, and it is the
 * one refusal a person will actually hit: revising a rate mid-contract means
 * closing the old period and opening a new one, not adding a second row over
 * the same days.
 */
/** A 400 for a page, filter or sort the list cannot honour. */
function pageRefused(c: Context, message: string): Response {
  return c.json(
    { code: 'VALIDATION_FAILED' as const, message, requestId: tenantOf(c).requestId },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

/**
 * The list's filters, as SQL over the order and its vendor. Each is optional;
 * `q` matches the number or the vendor's name, case-insensitively. The
 * predicate is shared by the page query and the count query so the two can
 * never disagree about what "N orders" means.
 */
function orderListFilter(c: Context): { where: string; params: unknown[] } | { error: string } {
  const state = c.req.query('state');
  const vendorId = c.req.query('vendorId');
  const projectId = c.req.query('projectId');
  const q = c.req.query('q');
  if (state !== undefined && !PO_STATES.includes(state as (typeof PO_STATES)[number])) {
    return { error: 'state is not an order state' };
  }
  for (const [name, value] of [['vendorId', vendorId], ['projectId', projectId]] as const) {
    if (value !== undefined && !z.uuid().safeParse(value).success) return { error: `${name} must be a uuid` };
  }
  const params: unknown[] = [state ?? null, vendorId ?? null, projectId ?? null, q === undefined || q === '' ? null : `%${q}%`];
  return {
    where: `($1::text IS NULL OR o.state = $1)
          AND ($2::uuid IS NULL OR o.vendor_id = $2)
          AND ($3::uuid IS NULL OR o.project_id = $3)
          AND ($4::text IS NULL OR o.number ILIKE $4 OR v.name ILIKE $4)`,
    params,
  };
}

/** `sort=raised:desc` (the default) or `sort=amount:asc` — the key the cursor is cut on. */
function orderListSort(
  c: Context,
): { column: string; keyType: 'timestamptz' | 'numeric'; desc: boolean } | { error: string } {
  const [key = 'raised', dir = 'desc'] = (c.req.query('sort') ?? 'raised:desc').split(':');
  if (dir !== 'asc' && dir !== 'desc') return { error: 'sort direction must be asc or desc' };
  if (key === 'raised') return { column: 'o.created_at', keyType: 'timestamptz', desc: dir === 'desc' };
  if (key === 'amount') return { column: 'o.gross', keyType: 'numeric', desc: dir === 'desc' };
  return { error: 'sort key must be raised or amount' };
}

/**
 * Orders that still count as outstanding — everything but a cancelled one.
 * The same set `apps/web/.../vendors/page.tsx` calls `OPEN_STATES`, now
 * computed here instead of by filtering a client-side join of every order.
 */
const VENDOR_OPEN_ORDER_STATES = ['draft', 'pending_approval', 'approved'] as const;

/** `q` over name, code, GSTIN and PAN; `status` an exact match. */
function vendorListFilter(c: Context): { where: string; params: unknown[] } | { error: string } {
  const status = c.req.query('status');
  if (status !== undefined && status !== 'active' && status !== 'inactive') {
    return { error: 'status must be active or inactive' };
  }
  const q = c.req.query('q');
  const params: unknown[] = [status ?? null, q === undefined || q === '' ? null : `%${q}%`];
  return {
    where: `($1::text IS NULL OR vendor_stats.status = $1)
          AND ($2::text IS NULL OR vendor_stats.name ILIKE $2 OR vendor_stats.code ILIKE $2
               OR vendor_stats.gstin ILIKE $2 OR vendor_stats.pan ILIKE $2)`,
    params,
  };
}

/**
 * `sort=lastOrder:desc` (the default, matching the screen's own) or
 * `name`/`openOrders`/`agreedRates`, either direction. The three computed
 * sorts key on the CTE column the route builds below, not a raw table column.
 */
function vendorListSort(
  c: Context,
): { column: string; keyType: KeyType; desc: boolean } | { error: string } {
  const [key = 'lastOrder', dir = 'desc'] = (c.req.query('sort') ?? 'lastOrder:desc').split(':');
  if (dir !== 'asc' && dir !== 'desc') return { error: 'sort direction must be asc or desc' };
  if (key === 'name') return { column: 'vendor_stats.name', keyType: 'text', desc: dir === 'desc' };
  if (key === 'lastOrder') {
    return { column: 'vendor_stats.last_ordered_sort', keyType: 'timestamptz', desc: dir === 'desc' };
  }
  if (key === 'openOrders') return { column: 'vendor_stats.open_orders', keyType: 'int', desc: dir === 'desc' };
  if (key === 'agreedRates') {
    return { column: 'vendor_stats.contract_count', keyType: 'int', desc: dir === 'desc' };
  }
  return { error: 'sort key must be name, lastOrder, openOrders or agreedRates' };
}

function rateContractError(c: Context, error: unknown): Response {
  if (error instanceof OverlappingContractRate) {
    return c.json(
      {
        code: 'VALIDATION_FAILED' as const,
        message:
          `${error.message}. Close the existing period first — two rates for one ` +
          'vendor, trade and day would make "the contracted rate" ambiguous.',
        requestId: tenantOf(c).requestId,
      },
      HTTP_STATUS.VALIDATION_FAILED as 400,
    );
  }
  if (error instanceof DuplicateContractNumber) {
    return c.json(
      {
        code: 'VALIDATION_FAILED' as const,
        message: `A rate contract numbered "${error.message}" already exists.`,
        requestId: tenantOf(c).requestId,
      },
      HTTP_STATUS.VALIDATION_FAILED as 400,
    );
  }
  if (error instanceof UnknownVendor) return contractNotFound(c);
  throw error;
}

/**
 * Somebody who can say whether a trade code names a real trade package.
 *
 * **procurement cannot answer this itself.** The catalogue is
 * `projects.trade_packages`, `services/procurement` may not import
 * `services/projects`, and the reference in the schema is deliberately soft —
 * a `trade_code text` column with no foreign key, because a composite FK across
 * two services' schemas would couple their migrations forever.
 *
 * A soft reference still has to be checked somewhere, or it is not a reference
 * at all. Before this port existed, nothing checked it: the only other
 * occurrence of `trade_code` in the codebase was an `ORDER BY`. A typo
 * (`ELEC` for `ELECT`) produced no match, and `resolveContractedRate` reports
 * no match as "this line is measured against nothing" — so a mistyped code read
 * as *an order with no contract* rather than as an error. That is the legacy
 * dashboard's `|| []` and the Tally sync's HTTP 200: a failure wearing the
 * shape of an ordinary empty result.
 *
 * So the check is injected. `services/host` is the only layer that may read
 * both, and it supplies this — the same shape as `connectorRoutes(authenticator)`
 * and `platformRoutes({ … })`. What does NOT change is
 * `resolveContractedRate`, which still reads no other service: the codes are
 * validated on the way IN, at write time, and the deviation query keeps
 * comparing two procurement rows and nothing else.
 */
export interface TradeCatalogue {
  /**
   * Every trade code this tenant has declared, uppercase.
   *
   * The whole set rather than one `has(code)` call per line: an order may carry
   * 500 lines, and 500 round trips to answer one question is the kind of thing
   * that only shows up in production.
   *
   * Reads within the caller's transaction, so it sees the tenant's rows under
   * the same RLS context as the write it is about to authorise.
   */
  knownCodes(tx: TxLike): Promise<ReadonlySet<string>>;
}

/**
 * The routes.
 *
 * `catalogue` is REQUIRED and has no default. An optional port with a
 * permissive fallback would mean a caller that forgot it silently gets no
 * validation — which is the defect this parameter exists to close, reintroduced
 * as a default value.
 */
export function purchaseOrderRoutes(catalogue: TradeCatalogue): Hono {
  const app = new Hono();

  /**
   * Refuse the write if any trade code on it is not in the catalogue.
   *
   * Uppercased before the lookup, because both write paths uppercase before
   * storing — `elec` must resolve to `ELEC` here or a line would be accepted
   * and then stored under a code this just refused.
   *
   * Names the offending codes. "Unknown trade code" without saying which one,
   * on a 500-line order, is a message that cannot be acted on.
   */
  const unknownTradeCodes = async (
    c: Context,
    codes: readonly (string | undefined)[],
  ): Promise<Response | null> => {
    const wanted = [...new Set(codes.filter((v): v is string => v !== undefined && v !== ''))].map(
      (v) => v.toUpperCase(),
    );
    if (wanted.length === 0) return null;

    const known = await catalogue.knownCodes(txOf(c));
    const missing = wanted.filter((code) => !known.has(code));
    if (missing.length === 0) return null;

    return c.json(
      {
        code: 'VALIDATION_FAILED' as const,
        message:
          `No trade package is coded ${missing.map((m) => `"${m}"`).join(', ')}. ` +
          'Add it under Settings › Trade packages, or correct the code.',
        requestId: tenantOf(c).requestId,
      },
      HTTP_STATUS.VALIDATION_FAILED as 400,
    );
  };

  /**
   * Price a draft without saving it.
   *
   * Exists because the alternative is what the legacy does: the browser
   * computes the totals for display (`POsView.js`) and the server computes them
   * again on save, and the two disagree. One endpoint, one answer — the client
   * displays what the server returns and never derives it.
   */
  app.post('/price', async (c) => {
    const parsed = createPurchaseOrderInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    const totals = purchaseOrderTotals(
      parsed.data.lines.map((l) => ({
        description: l.description,
        hsnSac: l.hsnSac,
        quantity: quantity(BigInt(l.quantityWhole), BigInt(l.quantityMillionths)),
        unitRate: fromWire(l.unitRate),
        gstRate: bp(l.gstRate),
      })),
    );

    return c.json({
      taxable: toWire(totals.taxable),
      gst: toWire(totals.gst),
      gross: toWire(totals.gross),
    });
  });

  /**
   * What the next number would be — a suggestion, not a reservation.
   *
   * Mounted before `/:id` would ever see it, and named so a caller cannot read
   * it as a claim on the number. The legacy `getNextPONumber` peeks without
   * incrementing (`read.js:189`) and the screen treats the result as settled,
   * so two users who open the form together are shown the same number (PO-24).
   * Here the stored number is allocated at submit; this only fills a field.
   */
  app.get('/next-number', async (c) => {
    const preview = await previewNumber(txOf(c), tenantOf(c));
    return c.json(preview);
  });

  /**
   * Create an order.
   *
   * The body carries lines; it does not carry totals, and there is no field by
   * which it could. Every figure in the response was computed here.
   */
  app.post('/', async (c) => {
    const parsed = createPurchaseOrderInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    const refusal = await unknownTradeCodes(c, parsed.data.lines.map((l) => l.tradeCode));
    if (refusal !== null) return refusal;

    const result = await createPurchaseOrder(txOf(c), tenantOf(c), parsed.data);
    return c.json(toWriteResponse(result), 201);
  });

  /**
   * Edit an order.
   *
   * `expectedVersion` is required by the schema, so a client cannot opt out of
   * concurrency control by omitting it — which is what `write.js:96` permits.
   */
  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    if (!z.uuid().safeParse(id).success) return notFound(c);

    const parsed = updatePurchaseOrderInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    const refusal = await unknownTradeCodes(c, parsed.data.lines.map((l) => l.tradeCode));
    if (refusal !== null) return refusal;

    const result = await updatePurchaseOrder(txOf(c), tenantOf(c), id, parsed.data);
    return c.json(toWriteResponse(result));
  });

  /**
   * Rename an order — one row, because the number is not the key.
   */
  // `POST /:id/submit` MOVED to `services/host/src/api/approvals.ts`.
  //
  // Submitting has to notify the people it lands on, and the approvers are
  // whoever holds the first stage's role — a question spanning `workflow` (the
  // chain) and `identity` (who holds a role). Procurement may import neither,
  // so the route lives in the composition root beside `approve`, which needs
  // the same three services for the same reason.
  //
  // `submitForApproval` itself stays here: the state transition is
  // procurement's rule. Only the composition moved.

  app.patch('/:id/number', async (c) => {
    const id = c.req.param('id');
    if (!z.uuid().safeParse(id).success) return notFound(c);

    const parsed = renamePurchaseOrderInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    const result = await renamePurchaseOrder(
      txOf(c),
      id,
      parsed.data.number,
      parsed.data.expectedVersion,
    );
    return c.json(toWriteResponse(result));
  });

  /**
   * Orders for the resolved tenant.
   *
   * Returns the vendor's name and the three money columns, because a screen
   * that has only an id and a number has to go and get them — and the shape
   * that produces is a per-row fetch, or a browser join, or a total added up in
   * the client. `POListTable.js:87` is what that becomes:
   * `Math.max(0, Number(po_value) - Number(paid))`, in a table cell.
   *
   * `gross` is `taxable + gst` and is NOT net of TDS (PO-23). The join to
   * vendors is a LEFT JOIN so an order whose vendor row is gone still lists.
   */
  app.get('/', async (c) => {
    const tx = txOf(c);
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    const filter = orderListFilter(c);
    if ('error' in filter) return pageRefused(c, filter.error);
    const sort = orderListSort(c);
    if ('error' in sort) return pageRefused(c, sort.error);
    const k = keyset(page, sort.column, 'o.id', sort.keyType, sort.desc, filter.params.length + 1);
    // No `WHERE tenant_id` — the RLS policy applies it. Writing it here too
    // would mean two places to keep in step, and the one that drifts is the
    // one nothing tests. The join is safe for the same reason: the vendors
    // table carries the same policy, so a cross-tenant row cannot match.
    const rows = await tx.query<{
      id: string;
      number: string;
      state: string;
      version: number;
      vendor_id: string;
      vendor_name: string | null;
      project_id: string | null;
      taxable: string;
      gst: string;
      gross: string;
      created_at: string;
    }>(
      `SELECT o.id, o.number, o.state, o.version,
              o.vendor_id, v.name AS vendor_name, o.project_id,
              o.taxable::text AS taxable, o.gst::text AS gst, o.gross::text AS gross,
              o.created_at::text AS created_at
         FROM procurement.purchase_orders o
         LEFT JOIN procurement.vendors v
                ON v.tenant_id = o.tenant_id AND v.id = o.vendor_id
        WHERE ${filter.where}
          AND ${k.where}
        ORDER BY ${k.orderBy}
        LIMIT $${filter.params.length + k.params.length + 1}`,
      [...filter.params, ...k.params, page.limit + 1],
    );
    const [counted] = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM procurement.purchase_orders o
         LEFT JOIN procurement.vendors v
                ON v.tenant_id = o.tenant_id AND v.id = o.vendor_id
        WHERE ${filter.where}`,
      filter.params,
    );
    const paged = finishPage(rows, page, (r) => ({
      key: sort.column === 'o.gross' ? r.gross : r.created_at,
      id: r.id,
    }));
    return c.json({
      items: paged.items.map((r) => ({
        id: r.id,
        number: r.number,
        state: r.state,
        version: r.version,
        vendorId: r.vendor_id,
        vendorName: r.vendor_name,
        projectId: r.project_id,
        taxable: r.taxable,
        gst: r.gst,
        gross: r.gross,
        createdAt: r.created_at,
      })),
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: counted?.n ?? 0,
    });
  });

  app.get('/whoami', (c) => {
    // Proves the middleware ran and what it resolved. Used by the route audit
    // and useful when diagnosing a 403 in an environment.
    const ctx = tenantOf(c);
    return c.json({
      tenantId: ctx.tenantId,
      principalId: ctx.principal.id,
      principalKind: ctx.principal.kind,
      requestId: ctx.requestId,
    });
  });

  // ------------------------------------------------------------- vendors ----

  /**
   * Vendors.
   *
   * Mounted here rather than at `/api/v1/vendors` so the whole procurement
   * surface hangs off one prefix. `VendorsView.js` is blocked on exactly these
   * four.
   *
   * **No response below carries a bank account or an IFSC.** They live in
   * `procurement.vendor_bank_accounts` and no read here touches that table.
   * `vendors.js:42` does `SELECT *` and returns `accountNo` and `ifsc` to any
   * authenticated caller (VEND-02).
   */
  app.get('/vendors', async (c) => {
    const tx = txOf(c);
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    const filter = vendorListFilter(c);
    if ('error' in filter) return pageRefused(c, filter.error);
    const sort = vendorListSort(c);
    if ('error' in sort) return pageRefused(c, sort.error);
    const k = keyset(page, sort.column, 'vendor_stats.id', sort.keyType, sort.desc, filter.params.length + 1);

    // The per-vendor figures the screen used to compute by joining the whole
    // order and contract lists against every row, client-side — a lateral
    // subquery per vendor instead, wrapped in a CTE so ORDER BY, the keyset
    // comparison and the count query below can all use the same column names.
    // A GROUP BY cannot be referenced from a WHERE clause, which is what rules
    // that shape out here.
    const rows = await tx.query<{
      id: string;
      name: string;
      code: string;
      status: string;
      gstin: string | null;
      pan: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      version: number;
      tds_section: string | null;
      tds_payee_class: string | null;
      pan_inoperative: boolean;
      constitution: string | null;
      open_orders: number;
      open_orders_total: string;
      contract_count: number;
      bills_waiting: number;
      last_ordered_at: string | null;
      last_ordered_sort: string;
    }>(
      `WITH vendor_stats AS (
         SELECT v.id, v.name, v.code, v.status, v.gstin, v.pan, v.email, v.phone, v.address, v.version,
                v.tds_section, v.tds_payee_class, v.pan_inoperative, v.constitution,
                COALESCE(oo.n, 0)::int AS open_orders,
                COALESCE(oo.total, '0') AS open_orders_total,
                COALESCE(rc.n, 0)::int AS contract_count,
                COALESCE(bw.n, 0)::int AS bills_waiting,
                lo.last_ordered_at,
                COALESCE(lo.last_ordered_at, '-infinity'::timestamptz) AS last_ordered_sort
           FROM procurement.vendors v
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS n, SUM(o.gross)::text AS total
               FROM procurement.purchase_orders o
              WHERE o.vendor_id = v.id AND o.state = ANY($${filter.params.length + k.params.length + 2}::text[])
           ) oo ON TRUE
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS n FROM procurement.rate_contracts c WHERE c.vendor_id = v.id
           ) rc ON TRUE
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS n FROM procurement.vendor_bills b WHERE b.vendor_id = v.id AND b.state = 'submitted'
           ) bw ON TRUE
           LEFT JOIN LATERAL (
             SELECT max(o.created_at) AS last_ordered_at
               FROM procurement.purchase_orders o WHERE o.vendor_id = v.id
           ) lo ON TRUE
       )
       SELECT vendor_stats.id, vendor_stats.name, vendor_stats.code, vendor_stats.status,
              vendor_stats.gstin, vendor_stats.pan, vendor_stats.email, vendor_stats.phone,
              vendor_stats.address, vendor_stats.version,
              vendor_stats.tds_section, vendor_stats.tds_payee_class, vendor_stats.pan_inoperative,
              vendor_stats.constitution,
              vendor_stats.open_orders, vendor_stats.open_orders_total, vendor_stats.contract_count,
              vendor_stats.bills_waiting,
              vendor_stats.last_ordered_at::text AS last_ordered_at,
              vendor_stats.last_ordered_sort::text AS last_ordered_sort
         FROM vendor_stats
        WHERE ${filter.where}
          AND ${k.where}
        ORDER BY ${k.orderBy}
        LIMIT $${filter.params.length + k.params.length + 1}`,
      [...filter.params, ...k.params, page.limit + 1, VENDOR_OPEN_ORDER_STATES],
    );
    const [counted] = await tx.query<{ n: number }>(
      `WITH vendor_stats AS (
         SELECT v.id, v.name, v.code, v.status, v.gstin, v.pan FROM procurement.vendors v
       )
       SELECT count(*)::int AS n FROM vendor_stats WHERE ${filter.where}`,
      filter.params,
    );
    const paged = finishPage(rows, page, (r) => ({
      key:
        sort.column === 'vendor_stats.name'
          ? r.name
          : sort.column === 'vendor_stats.last_ordered_sort'
            ? r.last_ordered_sort
            : sort.column === 'vendor_stats.open_orders'
              ? String(r.open_orders)
              : String(r.contract_count),
      id: r.id,
    }));

    // The stat row's figures — over every vendor, order, bill and contract,
    // never over the window above. `billsWaiting` counts `submitted`: the
    // table has no decision column, so "submitted" IS "waiting".
    const [summary] = await tx.query<{
      registered: number;
      active: number;
      agreed_rates: number;
      open_orders_count: number;
      open_orders_vendors: number;
      open_orders_total: string;
      bills_waiting: number;
      contracts_expiring: number;
    }>(
      `SELECT
         (SELECT count(*) FROM procurement.vendors)::int AS registered,
         (SELECT count(*) FROM procurement.vendors WHERE status = 'active')::int AS active,
         (SELECT count(*) FROM procurement.rate_contracts)::int AS agreed_rates,
         (SELECT count(*) FROM procurement.purchase_orders WHERE state = ANY($1::text[]))::int
           AS open_orders_count,
         (SELECT count(DISTINCT vendor_id) FROM procurement.purchase_orders WHERE state = ANY($1::text[]))::int
           AS open_orders_vendors,
         COALESCE(
           (SELECT SUM(gross)::text FROM procurement.purchase_orders WHERE state = ANY($1::text[])), '0'
         ) AS open_orders_total,
         (SELECT count(*) FROM procurement.vendor_bills WHERE state = 'submitted')::int AS bills_waiting,
         (SELECT count(DISTINCT contract_id) FROM procurement.rate_contract_items
            WHERE valid_to BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)::int AS contracts_expiring`,
      [VENDOR_OPEN_ORDER_STATES],
    );
    // the expiring contracts, named — the stat has a deadline and a name
    // attached, or it is a count nobody acts on (VALUE-MAP, Buying › Vendors)
    const expiring = await tx.query<{ id: string; number: string; vendor_name: string; valid_to: string }>(
      `SELECT c.id, c.number, v.name AS vendor_name, min(i.valid_to)::text AS valid_to
         FROM procurement.rate_contract_items i
         JOIN procurement.rate_contracts c ON c.tenant_id = i.tenant_id AND c.id = i.contract_id
         JOIN procurement.vendors v ON v.tenant_id = c.tenant_id AND v.id = c.vendor_id
        WHERE i.valid_to BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
        GROUP BY c.id, c.number, v.name
        ORDER BY min(i.valid_to), c.number
        LIMIT 5`,
    );
    // vendors the firm cannot deduct or bill correctly for: no PAN, or no GSTIN
    const [noTaxIds] = await tx.query<{ n: number; names: string[] }>(
      `SELECT count(*)::int AS n,
              COALESCE((array_agg(name ORDER BY name))[1:3], '{}') AS names
         FROM procurement.vendors
        WHERE status = 'active' AND (pan IS NULL OR gstin IS NULL)`,
    );

    return c.json({
      items: paged.items.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        status: r.status,
        gstin: r.gstin,
        pan: r.pan,
        email: r.email,
        phone: r.phone,
        address: r.address,
        tdsSection: r.tds_section,
        tdsPayeeClass: r.tds_payee_class,
        panInoperative: r.pan_inoperative,
        constitution: asConstitution(r.constitution),
        constitutionFromPan: constitutionFromPan(r.pan),
        constitutionMismatch: constitutionMismatch(r.constitution, r.pan),
        version: r.version,
        openOrders: r.open_orders,
        openOrdersTotal: r.open_orders_total,
        contractCount: r.contract_count,
        billsWaiting: r.bills_waiting,
        lastOrderedAt: r.last_ordered_at,
      })),
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: counted?.n ?? 0,
      summary: {
        registered: summary?.registered ?? 0,
        active: summary?.active ?? 0,
        agreedRates: summary?.agreed_rates ?? 0,
        openOrders: {
          count: summary?.open_orders_count ?? 0,
          vendors: summary?.open_orders_vendors ?? 0,
          total: summary?.open_orders_total ?? '0',
        },
        billsWaiting: { count: summary?.bills_waiting ?? 0 },
        contractsExpiringIn30Days: {
          count: summary?.contracts_expiring ?? 0,
          contracts: expiring.map((e) => ({ id: e.id, number: e.number, vendorName: e.vendor_name, validTo: e.valid_to })),
        },
        withoutTaxIds: { count: noTaxIds?.n ?? 0, names: noTaxIds?.names ?? [] },
      },
    });
  });

  app.get('/vendors/:vendorId', async (c) => {
    const id = c.req.param('vendorId');
    if (!z.uuid().safeParse(id).success) return vendorNotFound(c);
    return c.json(await getVendor(txOf(c), id));
  });

  // ------------------------------------------------------ rate contracts ----
  //
  // What a vendor agreed to charge for a trade, and the check that compares a
  // purchase order against it. The deviation check itself lives in the write
  // path, not here: it runs on every priced line whether or not anybody visits
  // this screen, because a control you have to ask for is not a control.

  app.get('/rate-contracts', async (c) => {
    const tx = txOf(c);
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    const vendorId = c.req.query('vendorId');
    if (vendorId !== undefined && !z.uuid().safeParse(vendorId).success) {
      return pageRefused(c, 'vendorId must be a uuid');
    }
    const status = c.req.query('status');
    // Uppercased here, not asked of the caller — the stored codes are, and a
    // lowercase filter would silently match nothing.
    const tradeCode = c.req.query('tradeCode')?.toUpperCase();
    const [paged, active] = await Promise.all([
      listRateContracts(tx, page, {
        ...(vendorId === undefined ? {} : { vendorId }),
        ...(status === undefined ? {} : { status }),
        ...(tradeCode === undefined ? {} : { tradeCode }),
      }),
      activeRateContractCount(tx),
    ]);
    return c.json({
      items: paged.items,
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: paged.count,
      summary: { active },
    });
  });

  app.get('/rate-contracts/:contractId', async (c) => {
    const id = c.req.param('contractId');
    if (!z.uuid().safeParse(id).success) return contractNotFound(c);
    try {
      return c.json(await getRateContract(txOf(c), id));
    } catch (error) {
      if (error instanceof RateContractNotFound) return contractNotFound(c);
      throw error;
    }
  });

  app.post('/rate-contracts', async (c) => {
    const parsed = rateContractInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    const refusal = await unknownTradeCodes(c, parsed.data.items.map((i) => i.tradeCode));
    if (refusal !== null) return refusal;

    const tx = txOf(c);
    try {
      const { id } = await createRateContract(tx, tenantOf(c), parsed.data);
      return c.json(await getRateContract(tx, id), 201);
    } catch (error) {
      return rateContractError(c, error);
    }
  });

  app.put('/rate-contracts/:contractId', async (c) => {
    const id = c.req.param('contractId');
    if (!z.uuid().safeParse(id).success) return contractNotFound(c);

    const parsed = rateContractInput.omit({ vendorId: true }).safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return validationFailed(c, parsed.error);

    const refusal = await unknownTradeCodes(c, parsed.data.items.map((i) => i.tradeCode));
    if (refusal !== null) return refusal;

    const tx = txOf(c);
    try {
      await updateRateContract(tx, tenantOf(c), id, parsed.data);
      return c.json(await getRateContract(tx, id));
    } catch (error) {
      if (error instanceof RateContractNotFound) return contractNotFound(c);
      return rateContractError(c, error);
    }
  });

  app.delete('/rate-contracts/:contractId', async (c) => {
    const id = c.req.param('contractId');
    if (!z.uuid().safeParse(id).success) return contractNotFound(c);
    try {
      await deleteRateContract(txOf(c), id);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof RateContractNotFound) return contractNotFound(c);
      throw error;
    }
  });

  /**
   * Every purchase-order line priced above its contracted rate.
   *
   * A line with no contracted rate is ABSENT from this list rather than listed
   * as compliant. "There was nothing to compare" and "the price was fine" are
   * different statements and only one of them is evidence.
   */
  app.get('/rate-deviations', async (c) => {
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    const vendorId = c.req.query('vendorId');
    if (vendorId !== undefined && !z.uuid().safeParse(vendorId).success) {
      return pageRefused(c, 'vendorId must be a uuid');
    }
    const tradeCode = c.req.query('tradeCode')?.toUpperCase();
    const purchaseOrderId = c.req.query('purchaseOrderId');
    if (purchaseOrderId !== undefined && !z.uuid().safeParse(purchaseOrderId).success) {
      return pageRefused(c, 'purchaseOrderId must be a uuid');
    }
    const paged = await listRateDeviations(txOf(c), page, {
      ...(vendorId === undefined ? {} : { vendorId }),
      ...(tradeCode === undefined ? {} : { tradeCode }),
      ...(purchaseOrderId === undefined ? {} : { purchaseOrderId }),
    });
    return c.json({
      items: paged.items,
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: paged.count,
    });
  });

  app.post('/vendors', async (c) => {
    const parsed = createVendorInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(await createVendor(txOf(c), tenantOf(c), parsed.data), 201);
  });

  app.patch('/vendors/:vendorId', async (c) => {
    const id = c.req.param('vendorId');
    if (!z.uuid().safeParse(id).success) return vendorNotFound(c);

    const parsed = updateVendorInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(await updateVendor(txOf(c), id, parsed.data));
  });

  /**
   * The vendor's TDS profile — what a payment to it is deducted under (CA-07).
   * Its own route rather than fields on the vendor edit: saving a vendor's name
   * must never clear what its payments are deducted under.
   */
  app.put('/vendors/:vendorId/tds-profile', async (c) => {
    const id = c.req.param('vendorId');
    if (!z.uuid().safeParse(id).success) return vendorNotFound(c);
    const parsed = vendorTdsProfileInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(await setVendorTdsProfile(txOf(c), id, parsed.data));
  });

  /**
   * Remove a vendor.
   *
   * Refuses when purchase orders reference it — `0033`'s FK is
   * `ON DELETE RESTRICT` — and says to deactivate instead, which is what
   * `status` is for.
   */
  app.delete('/vendors/:vendorId', async (c) => {
    const id = c.req.param('vendorId');
    if (!z.uuid().safeParse(id).success) return vendorNotFound(c);
    await deleteVendor(txOf(c), id);
    return c.body(null, 204);
  });

  // ----------------------------------------------------------- inventory ----

  /**
   * Stock balances, per item per warehouse.
   *
   * `SUM` over the movement ledger, for both the quantity and the value. There
   * is no stored balance column to drift from the movements that produced it,
   * and no stored unit cost to round — the average is derived, never kept.
   */
  app.get('/stock', async (c) => {
    const tx = txOf(c);
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    const belowReorderRaw = c.req.query('belowReorder');
    if (belowReorderRaw !== undefined && belowReorderRaw !== 'true' && belowReorderRaw !== 'false') {
      return pageRefused(c, 'belowReorder must be true or false');
    }
    const warehouse = c.req.query('warehouse');
    const q = c.req.query('q');
    const [paged, summary] = await Promise.all([
      listStock(tx, page, {
        ...(warehouse === undefined ? {} : { warehouse }),
        ...(q === undefined ? {} : { q }),
        ...(belowReorderRaw === 'true' ? { belowReorder: true } : {}),
      }),
      stockSummary(tx),
    ]);
    return c.json({
      items: paged.items,
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: paged.count,
      summary,
    });
  });

  /**
   * The costing method behind every valuation on the inventory screen.
   *
   * Returned as its own route rather than repeated on each balance: it is one
   * fact about the tenant, and a screen showing rupees needs to say whether the
   * method producing them was chosen or inherited (INV-03).
   */
  app.get('/stock/costing-policy', async (c) => {
    return c.json(await loadCostingPolicy(txOf(c)));
  });

  /** The register of stores and site stores, by name. */
  app.get('/stock/locations', async (c) => {
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    const includeRetired = c.req.query('includeRetired') === 'true';
    return c.json(await listStockLocations(txOf(c), page, { includeRetired }));
  });

  app.post('/stock/locations', async (c) => {
    const parsed = createStockLocationInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(await createStockLocation(txOf(c), tenantOf(c), parsed.data), 201);
  });

  app.post('/stock/locations/:locationId/retire', async (c) => {
    const locationId = c.req.param('locationId');
    if (!z.uuid().safeParse(locationId).success) throw new StockLocationNotFound('No such active location.');
    await retireStockLocation(txOf(c), locationId);
    return c.body(null, 204);
  });

  /** Item definitions, including those nothing has moved yet. */
  app.get('/stock/items', async (c) => {
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    const q = c.req.query('q');
    const paged = await listStockItems(txOf(c), page, q === undefined ? {} : { q });
    return c.json({
      items: paged.items,
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: paged.count,
    });
  });

  app.post('/stock/items', async (c) => {
    const parsed = createStockItemInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(await createStockItem(txOf(c), tenantOf(c), parsed.data), 201);
  });

  /** Goods received. One positive movement. */
  app.post('/stock/receipts', async (c) => {
    const parsed = stockMovementInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    await receiveStock(txOf(c), tenantOf(c), parsed.data);
    return c.body(null, 204);
  });

  /** Receipts at the gate: on the ledger, out of every balance until counted in. */
  app.get('/stock/receipts/awaiting', async (c) => {
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    return c.json(await listAwaitingReceipts(txOf(c), page));
  });

  /** The storekeeper's count. The receipt joins its store's balance from here. */
  app.post('/stock/receipts/:movementId/check-in', async (c) => {
    const movementId = c.req.param('movementId');
    if (!z.uuid().safeParse(movementId).success) {
      return c.json(
        { code: 'NOT_FOUND' as const, message: 'No receipt with that id is waiting to be checked in.', requestId: requestId(c) },
        HTTP_STATUS.NOT_FOUND as 404,
      );
    }
    await checkInReceipt(txOf(c), tenantOf(c), movementId);
    return c.body(null, 204);
  });

  /** Material issued. One negative movement, refused if it would go below zero. */
  app.post('/stock/issues', async (c) => {
    const parsed = stockMovementInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    // `unitRatePaise` is DROPPED here, visibly, rather than merely ignored
    // downstream. An issue is valued at what the stock cost; one that could
    // name its own rate would let somebody write inventory down by issuing it
    // cheaply and receiving it back.
    const { unitRatePaise: _priceIsNotTheCallers, ...issue } = parsed.data;
    await issueStock(txOf(c), tenantOf(c), issue);
    return c.body(null, 204);
  });

  /**
   * Move stock between warehouses.
   *
   * Two movements sharing a transfer id, in one transaction. **This is the one
   * that INV-01 is about**: the legacy writes a transfer record and moves no
   * stock, so the source keeps its quantity and the destination never gains it.
   */
  app.post('/stock/transfers', async (c) => {
    const parsed = stockTransferInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(await transferStock(txOf(c), tenantOf(c), parsed.data), 201);
  });

  // ------------------------------------------------------------ retention --

  /**
   * Retention withheld from vendors.
   *
   * **There is no release endpoint, and that is the decision.** A release is a
   * payment, and payments are gated on CA-01..CA-08. The legacy
   * `releaseRetentionAmount` (`site-controls.js:168`) moves `released_amount`
   * and writes **no payment record of any kind** (RET-02), so porting it would
   * produce a ledger saying a vendor was paid when they were not.
   *
   * Recording what is held is new, not ported: nothing in the legacy ever
   * INSERTs into `vendor_retention_ledger` (RET-01).
   */
  // ---------------------------------------------------------------- bills ----
  //
  // A vendor's bill as the office sees it: a claim until acknowledged with its
  // split and due date, a payable until paid. Gross throughout (§5).

  app.get('/bills', async (c) => {
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    const view = billView.safeParse(c.req.query('view') ?? 'due');
    if (!view.success) return pageRefused(c, 'view must be due, to_acknowledge, paid, returned or all');
    const projectId = c.req.query('projectId');
    const vendorId = c.req.query('vendorId');
    for (const [name, value] of [['projectId', projectId], ['vendorId', vendorId]] as const) {
      if (value !== undefined && !z.uuid().safeParse(value).success) return pageRefused(c, `${name} must be a uuid`);
    }
    const q = c.req.query('q');
    const tx = txOf(c);
    const paged = await listStaffBills(tx, page, view.data, { projectId, vendorId, q });
    // the stats are the firm's, or the project's inside one — never the page's
    return c.json({ ...paged, summary: await payablesSummary(tx, todayInIndia(new Date()), { projectId }) });
  });

  /** What the firm owes, in ageing buckets — every acknowledged, unpaid bill, gross; one project's with `?projectId=`. */
  app.get('/bills/ageing', async (c) => {
    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success) {
      return pageRefused(c, 'projectId must be a uuid');
    }
    return c.json(await payablesAgeing(txOf(c), todayInIndia(new Date()), { projectId }));
  });

  app.post('/bills/:billId/acknowledge', async (c) => {
    const billId = c.req.param('billId');
    if (!z.uuid().safeParse(billId).success) return notFound(c);
    const parsed = acknowledgeBillInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);
    return c.json(
      await acknowledgeBill(txOf(c), tenantOf(c), billId, {
        taxableAmountWire: parsed.data.taxableAmount,
        gstAmountWire: parsed.data.gstAmount,
        dueOn: parsed.data.dueOn,
      }),
    );
  });

  app.get('/retention', async (c) => {
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    const vendorId = c.req.query('vendorId');
    const projectId = c.req.query('projectId');
    for (const [name, value] of [['vendorId', vendorId], ['projectId', projectId]] as const) {
      if (value !== undefined && !z.uuid().safeParse(value).success) {
        return pageRefused(c, `${name} must be a uuid`);
      }
    }
    const paged = await listRetention(txOf(c), page, {
      ...(vendorId === undefined ? {} : { vendorId }),
      ...(projectId === undefined ? {} : { projectId }),
    });
    return c.json({
      items: paged.items.map((r) => ({
        id: r.id,
        purchaseOrderId: r.purchaseOrderId,
        vendorId: r.vendorId,
        grossAmount: toWire(r.grossAmount),
        retainedAmount: toWire(r.retainedAmount),
        retentionRateBp: r.retentionRateBp,
        stage: r.stage,
        version: r.version,
      })),
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: paged.count,
    });
  });

  /** The rate is the input; the retained amount is computed from the order. */
  app.post('/retention', async (c) => {
    const parsed = recordRetentionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    const held = await recordRetention(txOf(c), tenantOf(c), parsed.data);
    return c.json(
      {
        id: held.id,
        purchaseOrderId: held.purchaseOrderId,
        vendorId: held.vendorId,
        grossAmount: toWire(held.grossAmount),
        retainedAmount: toWire(held.retainedAmount),
        retentionRateBp: held.retentionRateBp,
        stage: held.stage,
        version: held.version,
      },
      201,
    );
  });
  app.onError((error, c) => {
    if (error instanceof PurchaseOrderNotFound) return notFound(c);
    if (error instanceof VendorNotFound) return vendorNotFound(c);
    if (error instanceof BillNotFound) return notFound(c);
    if (error instanceof BillRefused) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof VendorTdsProfileRefused) {
      return c.json(
        { code: 'VALIDATION_FAILED' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }
    if (error instanceof RetentionRefused) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof StockLocationNotFound) {
      return c.json(
        { code: 'NOT_FOUND' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.NOT_FOUND as 404,
      );
    }
    if (error instanceof DuplicateStockLocation) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof ReceiptNotAwaitingCheckIn) {
      return c.json(
        { code: 'NOT_FOUND' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.NOT_FOUND as 404,
      );
    }
    if (error instanceof StockItemNotFound) {
      return c.json(
        { code: 'NOT_FOUND' as const, message: 'No such stock item.', requestId: requestId(c) },
        HTTP_STATUS.NOT_FOUND as 404,
      );
    }
    if (
      error instanceof DuplicateStockItem ||
      error instanceof InsufficientStock ||
      error instanceof InvalidMovement
    ) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (
      error instanceof DuplicateVendorCode ||
      error instanceof VendorStaleWrite ||
      error instanceof VendorInUse ||
      error instanceof PurchaseOrderStaleWrite
    ) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof DuplicatePurchaseOrderNumber) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof PurchaseOrderError) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    throw error;
  });

  // An order's own lines, with the server's amount and rate check on each.
  app.get('/:id/lines', async (c) => {
    const id = c.req.param('id');
    if (!z.uuid().safeParse(id).success) return notFound(c);
    const items = await purchaseOrderLines(txOf(c), id);
    if (items === null) return notFound(c);
    return c.json({ items });
  });

  // Last, so every fixed path above (`/vendors`, `/stock`, `/rate-contracts`…)
  // is matched before the parameter can swallow it.
  app.get('/:id', async (c) => {
    const id = c.req.param('id');
    if (!z.uuid().safeParse(id).success) return notFound(c);
    const [row] = await txOf(c).query<{
      id: string;
      number: string;
      state: string;
      version: number;
      vendor_id: string;
      vendor_name: string | null;
      project_id: string | null;
      taxable: string;
      gst: string;
      gross: string;
      created_at: string;
    }>(
      `SELECT o.id, o.number, o.state, o.version,
              o.vendor_id, v.name AS vendor_name, o.project_id,
              o.taxable::text AS taxable, o.gst::text AS gst, o.gross::text AS gross,
              o.created_at::text AS created_at
         FROM procurement.purchase_orders o
         LEFT JOIN procurement.vendors v
                ON v.tenant_id = o.tenant_id AND v.id = o.vendor_id
        WHERE o.id = $1`,
      [id],
    );
    if (row === undefined) return notFound(c);
    return c.json({
      id: row.id,
      number: row.number,
      state: row.state,
      version: row.version,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      projectId: row.project_id,
      taxable: row.taxable,
      gst: row.gst,
      gross: row.gross,
      createdAt: row.created_at,
    });
  });

  return app;
}

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

function validationFailed(c: Context, error: z.ZodError): Response {
  return c.json(
    {
      code: 'VALIDATION_FAILED' as const,
      message: 'Some of the submitted values are not valid.',
      requestId: requestId(c),
      // Field paths only. Echoing the rejected VALUE back is how a vendor's
      // bank account number ends up in a browser console.
      details: error.issues.map((i) => ({
        path: i.path.join('.'),
        reason: i.message,
      })),
    },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

function notFound(c: Context): Response {
  return c.json(
    { code: 'NOT_FOUND' as const, message: 'No such purchase order.', requestId: requestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

function vendorNotFound(c: Context): Response {
  return c.json(
    { code: 'NOT_FOUND' as const, message: 'No such vendor.', requestId: requestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}
