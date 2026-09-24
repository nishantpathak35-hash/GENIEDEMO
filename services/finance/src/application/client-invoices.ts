import { randomUUID } from 'node:crypto';
import type { BasisPoints, TenantContext } from '@cog/contracts';
import { ZERO, compare, fromWire } from '@cog/money';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import { assertStatutoryOutputAllowed, type Environment, type ProvenancedRow } from '../domain/go-live-gate.js';
import { RateLookupError, rateOn } from '../domain/rate-table.js';
import { RATE_KEYS } from '../domain/statutory-catalogue.js';
import { buildVoucherXml } from '../domain/tally-xml.js';
import {
  TaxInvoiceRefused,
  invoiceLedgerEntries,
  invoiceTax,
  stateOfGstin,
  supplyTypeFor,
  type InvoiceTax,
} from '../domain/tax-invoice.js';
import { loadPaymentRules } from './payments.js';
import type { TxLike } from './tax-rates.js';

/**
 * Client billing: tax invoices, receipts against them, and what is still due.
 *
 * Raising an invoice is split like paying a bill. `prepareClientInvoice` reads
 * the rate, works out the tax and passes the go-live gate, writing nothing; the
 * host then takes a number from the tax-invoice series and
 * `recordClientInvoice` writes, in one savepoint. A refused invoice takes no
 * number (CA-09).
 *
 * An invoice is never deleted and its number never reused (CA-18). Cancelling
 * keeps both, and is refused once money has been received against it — that is
 * a credit note, which is not built.
 */

export class ClientInvoiceNotFound extends Error {
  override readonly name = 'ClientInvoiceNotFound';
}

export interface ClientInvoice {
  readonly id: string;
  readonly number: string;
  readonly projectId: string;
  readonly projectCode: string;
  readonly clientName: string;
  readonly clientGstin: string | null;
  readonly invoiceDate: string;
  readonly expectedOn: string;
  readonly certifiedOn: string | null;
  readonly description: string;
  readonly supplierState: string;
  readonly placeOfSupply: string;
  readonly supplyType: 'intra_state' | 'inter_state';
  readonly taxable: string;
  readonly gstRateBp: number;
  readonly cgst: string;
  readonly sgst: string;
  readonly igst: string;
  /** The difference rounding the total to the rupee made — its own line (CA-02). */
  readonly roundOff: string;
  readonly total: string;
  readonly received: string;
  /** What is still owed; nothing on a cancelled invoice. */
  readonly balance: string;
  readonly provisional: boolean;
  readonly state: 'issued' | 'cancelled';
  readonly cancelReason: string | null;
  readonly createdAt: string;
}

type InvoiceRow = {
  id: string;
  number: string;
  project_id: string;
  project_code: string;
  client_name: string;
  client_gstin: string | null;
  invoice_date: string;
  expected_on: string;
  certified_on: string | null;
  description: string;
  supplier_state: string;
  place_of_supply: string;
  supply_type: string;
  taxable: string;
  gst_rate_bp: number;
  cgst: string;
  sgst: string;
  igst: string;
  round_off: string;
  total: string;
  received: string;
  balance: string;
  provisional: boolean;
  state: string;
  cancel_reason: string | null;
  created_at: string;
};

const INVOICE_SELECT = `SELECT i.id, i.number, i.project_id, i.project_code, i.client_name, i.client_gstin,
         i.invoice_date::text AS invoice_date, i.expected_on::text AS expected_on,
         i.certified_on::text AS certified_on, i.description, i.supplier_state, i.place_of_supply,
         i.supply_type, i.taxable::text AS taxable, i.gst_rate_bp, i.cgst::text AS cgst,
         i.sgst::text AS sgst, i.igst::text AS igst, i.round_off::text AS round_off,
         i.total::text AS total,
         COALESCE(r.received, 0)::text AS received,
         (CASE WHEN i.state = 'cancelled' THEN 0 ELSE i.total - COALESCE(r.received, 0) END)::text AS balance,
         i.provisional, i.state, i.cancel_reason, i.created_at::text AS created_at
    FROM finance.client_invoices i
    LEFT JOIN (
      SELECT tenant_id, invoice_id, SUM(amount) AS received
        FROM finance.client_receipts
       GROUP BY tenant_id, invoice_id
    ) r ON r.tenant_id = i.tenant_id AND r.invoice_id = i.id`;

function toInvoice(r: InvoiceRow): ClientInvoice {
  return {
    id: r.id,
    number: r.number,
    projectId: r.project_id,
    projectCode: r.project_code,
    clientName: r.client_name,
    clientGstin: r.client_gstin,
    invoiceDate: r.invoice_date,
    expectedOn: r.expected_on,
    certifiedOn: r.certified_on,
    description: r.description,
    supplierState: r.supplier_state,
    placeOfSupply: r.place_of_supply,
    supplyType: r.supply_type === 'inter_state' ? 'inter_state' : 'intra_state',
    taxable: r.taxable,
    gstRateBp: r.gst_rate_bp,
    cgst: r.cgst,
    sgst: r.sgst,
    igst: r.igst,
    roundOff: r.round_off,
    total: r.total,
    received: r.received,
    balance: r.balance,
    provisional: r.provisional,
    state: r.state === 'cancelled' ? 'cancelled' : 'issued',
    cancelReason: r.cancel_reason,
    createdAt: r.created_at,
  };
}

export async function getClientInvoice(tx: TxLike, id: string): Promise<ClientInvoice> {
  const rows = await tx.query<InvoiceRow>(`${INVOICE_SELECT} WHERE i.id = $1`, [id]);
  const row = rows[0];
  if (row === undefined) throw new ClientInvoiceNotFound('No such invoice.');
  return toInvoice(row);
}

export interface InvoicePreparation {
  readonly supplierState: string;
  readonly placeOfSupply: string;
  readonly rate: BasisPoints;
  readonly tax: InvoiceTax;
  readonly provisional: boolean;
  readonly rowsUsed: readonly ProvenancedRow[];
}

/**
 * Work out a tax invoice and pass it through the go-live gate — writing
 * nothing. No invoice without the organisation's GSTIN, and none is invented.
 */
export async function prepareClientInvoice(
  tx: TxLike,
  input: {
    readonly taxableWire: string;
    readonly invoiceDate: string;
    readonly supplierGstin: string | null;
    readonly placeOfSupply: string;
  },
  environment: Environment,
): Promise<InvoicePreparation> {
  if (input.supplierGstin === null) {
    throw new TaxInvoiceRefused("A tax invoice carries the organisation's GSTIN, and none is recorded — Settings › Company.");
  }
  const taxable = fromWire(input.taxableWire);
  if (compare(taxable, ZERO) <= 0) throw new TaxInvoiceRefused('An invoice needs a taxable value above nothing.');

  const supplierState = stateOfGstin(input.supplierGstin);
  const supplyType = supplyTypeFor(supplierState, input.placeOfSupply);

  const { rates } = await loadPaymentRules(tx);
  let rateRow;
  try {
    rateRow = rateOn(rates, RATE_KEYS.gstWorksContract, input.invoiceDate);
  } catch (error) {
    if (error instanceof RateLookupError) {
      throw new TaxInvoiceRefused(`${error.message}. Load the provisional statutory values in Settings › Tax.`);
    }
    throw error;
  }
  const rowsUsed: ProvenancedRow[] = [{ key: rateRow.key, status: rateRow.status, questionRef: rateRow.questionRef }];
  const { provisional } = assertStatutoryOutputAllowed('tax_invoice', rowsUsed, environment);

  return {
    supplierState,
    placeOfSupply: input.placeOfSupply,
    rate: rateRow.rate,
    tax: invoiceTax(taxable, rateRow.rate, supplyType),
    provisional,
    rowsUsed,
  };
}

/** Record a prepared invoice. The caller supplies the number, taken in this transaction. */
export async function recordClientInvoice(
  tx: TxLike,
  ctx: TenantContext,
  prepared: InvoicePreparation,
  input: {
    readonly number: string;
    readonly project: { readonly id: string; readonly code: string; readonly clientName: string };
    readonly clientGstin: string | null;
    readonly invoiceDate: string;
    readonly expectedOn: string;
    readonly certifiedOn: string | null;
    readonly description: string;
    readonly tallyCompany: string;
  },
): Promise<ClientInvoice> {
  if (input.expectedOn < input.invoiceDate) {
    throw new TaxInvoiceRefused('Payment cannot be expected before the invoice is dated.');
  }
  const id = randomUUID();
  await tx.query(
    `INSERT INTO finance.client_invoices
       (tenant_id, id, number, project_id, project_code, client_name, client_gstin, invoice_date,
        expected_on, certified_on, description, supplier_state, place_of_supply, supply_type,
        taxable, gst_rate_bp, cgst, sgst, igst, round_off, total, provisional, rows_used, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10::date, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20, $21, $22, $23::jsonb, $24)`,
    [
      ctx.tenantId,
      id,
      input.number,
      input.project.id,
      input.project.code,
      input.project.clientName,
      input.clientGstin,
      input.invoiceDate,
      input.expectedOn,
      input.certifiedOn,
      input.description,
      prepared.supplierState,
      prepared.placeOfSupply,
      prepared.tax.supplyType,
      prepared.tax.taxable,
      prepared.rate,
      prepared.tax.cgst,
      prepared.tax.sgst,
      prepared.tax.igst,
      prepared.tax.roundOff,
      prepared.tax.invoiceTotal,
      prepared.provisional,
      JSON.stringify(prepared.rowsUsed.map((r) => ({ key: r.key, status: r.status, questionRef: r.questionRef ?? null }))),
      ctx.principal.id,
    ],
  );

  // A voucher computed from a provisional rate is never handed to a Tally
  // connector, draft or not (ADR-0014, addendums): the invoice is recorded and
  // shown as a draft, and its voucher is staged only when no provisional row is
  // behind it.
  if (!prepared.provisional) {
    const remoteId = `invoice:${id}`;
    const xml = buildVoucherXml({
      remoteId,
      voucherType: 'Sales',
      voucherNumber: input.number,
      date: input.invoiceDate,
      company: input.tallyCompany,
      partyLedger: input.project.clientName,
      narration: input.description === '' ? 'Tax invoice' : input.description,
      entries: invoiceLedgerEntries(input.project.clientName, prepared.tax),
    });
    await tx.query(
      `INSERT INTO finance.tally_vouchers (tenant_id, id, kind, xml, remote_id)
       VALUES ($1, $2, 'invoice', $3, $4)
       ON CONFLICT (tenant_id, remote_id) DO NOTHING`,
      [ctx.tenantId, randomUUID(), xml, remoteId],
    );
  }

  return getClientInvoice(tx, id);
}

/**
 * Record what the client paid. Refused on a cancelled invoice, for nothing, for
 * more than is still due, or dated before the invoice. The invoice row is
 * locked first, so two receipts at once cannot together pay more than the total.
 */
export async function recordClientReceipt(
  tx: TxLike,
  ctx: TenantContext,
  invoiceId: string,
  input: { readonly receivedOn: string; readonly amountWire: string; readonly reference: string },
): Promise<ClientInvoice> {
  await tx.query(`SELECT id FROM finance.client_invoices WHERE id = $1 FOR UPDATE`, [invoiceId]);
  const invoice = await getClientInvoice(tx, invoiceId);
  if (invoice.state === 'cancelled') throw new TaxInvoiceRefused('This invoice is cancelled.');
  const amount = fromWire(input.amountWire);
  if (compare(amount, ZERO) <= 0) throw new TaxInvoiceRefused('A receipt is for more than nothing.');
  if (compare(amount, fromWire(invoice.balance)) > 0) {
    throw new TaxInvoiceRefused('That is more than is still due on this invoice.');
  }
  if (input.receivedOn < invoice.invoiceDate) {
    throw new TaxInvoiceRefused('A receipt cannot be dated before its invoice.');
  }
  await tx.query(
    `INSERT INTO finance.client_receipts
       (tenant_id, id, invoice_id, received_on, amount, reference, created_by)
     VALUES ($1, $2, $3, $4::date, $5, $6, $7)`,
    [ctx.tenantId, randomUUID(), invoiceId, input.receivedOn, amount, input.reference, ctx.principal.id],
  );
  return getClientInvoice(tx, invoiceId);
}

/** Cancel an invoice, keeping its number (CA-18). Refused once anything is received against it. */
export async function cancelClientInvoice(
  tx: TxLike,
  ctx: TenantContext,
  invoiceId: string,
  reason: string,
): Promise<ClientInvoice> {
  const invoice = await getClientInvoice(tx, invoiceId);
  if (invoice.state === 'cancelled') throw new TaxInvoiceRefused('This invoice is already cancelled.');
  if (compare(fromWire(invoice.received), ZERO) > 0) {
    throw new TaxInvoiceRefused(
      'Money has been received against this invoice, so it cannot be cancelled — that needs a credit note, which is not built.',
    );
  }
  const updated = await tx.query<{ id: string }>(
    `UPDATE finance.client_invoices
        SET state = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancel_reason = $3
      WHERE id = $1 AND state = 'issued'
      RETURNING id`,
    [invoiceId, ctx.principal.id, reason],
  );
  if (updated.length === 0) throw new TaxInvoiceRefused('This invoice was cancelled by someone else first.');
  return getClientInvoice(tx, invoiceId);
}

export interface ClientInvoicePage {
  readonly items: readonly ClientInvoice[];
  readonly nextCursor: string | null;
  readonly prevCursor: string | null;
  readonly count: number;
}

/** Invoices, newest first. `projectIds` narrows to a client login's projects. */
export interface ClientInvoiceFilter {
  readonly projectIds?: readonly string[] | undefined;
  /** `issued` or `cancelled`. */
  readonly state?: string | undefined;
  /** ILIKE over the number, the client's name or the project code — the list's search box. */
  readonly q?: string | undefined;
}

export async function listClientInvoices(tx: TxLike, page: PageQuery, filter: ClientInvoiceFilter = {}): Promise<ClientInvoicePage> {
  const params: unknown[] = [
    filter.projectIds === undefined ? null : [...filter.projectIds],
    filter.state ?? null,
    filter.q === undefined || filter.q.trim() === '' ? null : `%${filter.q.trim()}%`,
  ];
  const where = `($1::uuid[] IS NULL OR i.project_id = ANY($1::uuid[]))
               AND ($2::text IS NULL OR i.state = $2)
               AND ($3::text IS NULL OR i.number ILIKE $3 OR i.client_name ILIKE $3 OR i.project_code ILIKE $3)`;
  const k = keyset(page, 'i.invoice_date', 'i.id', 'date', true, params.length + 1);
  const rows = await tx.query<InvoiceRow>(
    `${INVOICE_SELECT}
      WHERE ${where} AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${params.length + 1 + k.params.length}`,
    [...params, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM finance.client_invoices i WHERE ${where}`,
    params,
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.invoice_date, id: r.id }));
  return {
    items: paged.items.map(toInvoice),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

export interface ReceivablesSummary {
  readonly invoiced: string;
  readonly received: string;
  readonly balance: string;
  /** Owed on invoices whose expected date has passed. */
  readonly overdue: string;
  readonly openCount: number;
  /** The receivable expected soonest, with the date its work was certified when it was. */
  readonly nextExpected: {
    readonly number: string;
    readonly expectedOn: string;
    readonly certifiedOn: string | null;
    readonly balance: string;
  } | null;
}

/** Over every issued invoice, never over a page. `projectIds` narrows it the way the list is narrowed. */
export async function receivablesSummary(
  tx: TxLike,
  today: string,
  filter: { readonly projectIds?: readonly string[] | undefined } = {},
): Promise<ReceivablesSummary> {
  const projects = filter.projectIds === undefined ? null : [...filter.projectIds];
  const balances = (projectsParam: string): string => `SELECT i.number, i.expected_on, i.certified_on, i.total,
                           COALESCE(r.received, 0) AS received,
                           i.total - COALESCE(r.received, 0) AS balance
                      FROM finance.client_invoices i
                      LEFT JOIN (
                        SELECT tenant_id, invoice_id, SUM(amount) AS received
                          FROM finance.client_receipts
                         GROUP BY tenant_id, invoice_id
                      ) r ON r.tenant_id = i.tenant_id AND r.invoice_id = i.id
                     WHERE i.state = 'issued'
                       AND (${projectsParam}::uuid[] IS NULL OR i.project_id = ANY(${projectsParam}::uuid[]))`;
  const [totals] = await tx.query<{
    invoiced: string;
    received: string;
    balance: string;
    overdue: string;
    open_count: number;
  }>(
    `WITH balances AS (${balances('$2')})
     SELECT COALESCE(SUM(total), 0)::text AS invoiced,
            COALESCE(SUM(received), 0)::text AS received,
            COALESCE(SUM(balance), 0)::text AS balance,
            COALESCE(SUM(balance) FILTER (WHERE expected_on < $1::date AND balance > 0), 0)::text AS overdue,
            count(*) FILTER (WHERE balance > 0)::int AS open_count
       FROM balances`,
    [today, projects],
  );
  const [next] = await tx.query<{ number: string; expected_on: string; certified_on: string | null; balance: string }>(
    `WITH balances AS (${balances('$1')})
     SELECT number, expected_on::text AS expected_on, certified_on::text AS certified_on, balance::text AS balance
       FROM balances
      WHERE balance > 0
      ORDER BY expected_on, number
      LIMIT 1`,
    [projects],
  );
  return {
    invoiced: totals?.invoiced ?? '0',
    received: totals?.received ?? '0',
    balance: totals?.balance ?? '0',
    overdue: totals?.overdue ?? '0',
    openCount: totals?.open_count ?? 0,
    nextExpected:
      next === undefined
        ? null
        : { number: next.number, expectedOn: next.expected_on, certifiedOn: next.certified_on, balance: next.balance },
  };
}
