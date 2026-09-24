import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  HTTP_STATUS,
  cancelClientInvoiceInput,
  moneyPeriod,
  payBillInput,
  raiseClientInvoiceInput,
  recordClientReceiptInput,
  releaseRetentionInput,
  type ErrorCode,
} from '@cog/contracts';
import { projectForInvoice } from '@cog/projects';
import { financialWindow, readPage, tenantOf, txOf } from '@cog/service-kit';
import { loadEntitlements, loadPrincipalRoles } from '@cog/identity';
import {
  BillNotFound,
  BillRefused,
  NumberSeriesError,
  RetentionNotFound,
  RetentionRefused,
  allocateNumber,
  billForPayment,
  listRetention,
  markBillPaid,
  markRetentionReleased,
  orderIdsOfProject,
  retentionForRelease,
  todayInIndia,
} from '@cog/procurement';
import { currentTenantName, getCompanyProfile, getTaxSetup } from '@cog/tenancy';
import {
  PaymentRuleMissing,
  ProvisionalOutputRefused,
  RetentionReleaseRefused,
  StatementPeriodInvalid,
  ClientInvoiceNotFound,
  TaxInvoiceRefused,
  cancelClientInvoice,
  listClientInvoices,
  moneyByMonth,
  prepareClientInvoice,
  receivablesAgeing,
  receivablesSummary,
  recordClientInvoice,
  recordClientReceipt,
  challanFor,
  form26QFor,
  parseQuarter,
  quarterOf,
  type Quarter,
  listVendorPayments,
  paymentsSummary,
  prepareBillPayment,
  prepareRetentionRelease,
  recordBillPayment,
  recordRetentionRelease,
  retentionByOrder,
  retentionTotals,
} from '@cog/finance';

/**
 * Money — paying vendors (§5). Composition: the bill and the payee are
 * procurement's, the tax answers tenancy's, the rules and the payment finance's.
 * The host takes a number and hands each service what it needs; it computes
 * nothing.
 *
 * **Order matters here, and the reason is the transaction.** The tenant
 * middleware rolls a request back only when it answers 5xx; a 409 commits what
 * was written before it. So everything that can refuse a payment — a bill not
 * payable, a rule not loaded, the go-live gate — runs before the
 * first write, and the writes run inside one savepoint that is rolled back
 * before any refusal is answered. A refused payment takes no voucher number.
 */

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

function refuse(c: Context, code: ErrorCode, message: string): Response {
  return c.json({ code, message, requestId: requestId(c) }, HTTP_STATUS[code] as 400);
}

async function mayPay(c: Context): Promise<boolean> {
  const tx = txOf(c);
  const roles = await loadPrincipalRoles(tx, tenantOf(c).principal.id);
  const { actions } = await loadEntitlements(tx, roles);
  return actions.includes('approve_payment');
}

export function moneyRoutes(options: { readonly draftStatutoryOutputs: boolean }): Hono {
  const app = new Hono();
  const environment = { draftStatutoryOutputs: options.draftStatutoryOutputs };

  app.get('/money/payments', async (c) => {
    const page = readPage(c);
    if ('error' in page) return refuse(c, 'VALIDATION_FAILED', page.error);
    const vendorId = c.req.query('vendorId');
    if (vendorId !== undefined && !z.uuid().safeParse(vendorId).success) return refuse(c, 'VALIDATION_FAILED', 'vendorId must be a uuid');
    const tx = txOf(c);
    const paged = await listVendorPayments(tx, page, vendorId === undefined ? {} : { vendorIds: [vendorId] });
    return c.json({ ...paged, summary: await paymentsSummary(tx, todayInIndia(new Date())) });
  });

  app.post('/money/bills/:billId/pay', async (c) => {
    const billId = c.req.param('billId');
    if (!z.uuid().safeParse(billId).success) return refuse(c, 'NOT_FOUND', 'No such bill.');
    const parsed = payBillInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return refuse(c, 'VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'That payment was not recorded.');
    }
    if (!(await mayPay(c))) return refuse(c, 'FORBIDDEN', 'You cannot pay bills.');

    const ctx = tenantOf(c);
    const tx = txOf(c);
    const { paidOn, reference } = parsed.data;

    // Every refusal first, with nothing written.
    const { bill, payee, retentionRateBp } = await billForPayment(tx, billId);
    if (bill.taxableAmount === null || bill.gstAmount === null) {
      return refuse(
        c,
        'CONFLICT',
        'This bill was acknowledged without its taxable value and GST, so the tax on it cannot be worked out.',
      );
    }
    const facts = {
      bill: {
        id: bill.id,
        billNumber: bill.billNumber,
        purchaseOrderId: bill.purchaseOrderId,
        vendorId: bill.vendorId,
        amountClaimed: bill.amountClaimed,
        taxableAmount: bill.taxableAmount,
        gstAmount: bill.gstAmount,
      },
      payee,
      retentionRateBp,
      paidOn,
      buyerCoveredBy194Q: (await getTaxSetup(tx)).buyerTurnoverOver10Crore,
    };
    const prepared = await prepareBillPayment(tx, facts, environment);
    const company = await currentTenantName(tx);

    // Then the writes, as one: a refusal among them rolls all of them back.
    await tx.query('SAVEPOINT pay_bill');
    try {
      const voucher = await allocateNumber(tx, ctx, 'payment_voucher', new Date(`${paidOn}T12:00:00+05:30`));
      const payment = await recordBillPayment(tx, ctx, facts, prepared, {
        number: voucher.number,
        reference,
        tallyCompany: company,
      });
      await markBillPaid(tx, bill.id, payment.id, paidOn);
      await tx.query('RELEASE SAVEPOINT pay_bill');
      return c.json(payment, 201);
    } catch (error) {
      await tx.query('ROLLBACK TO SAVEPOINT pay_bill');
      throw error;
    }
  });

  /**
   * Retention per order: procurement's holding — the rate and the stage — beside
   * finance's figures from the payments. Host sets them side by side.
   */
  app.get('/money/retention', async (c) => {
    const page = readPage(c);
    if ('error' in page) return refuse(c, 'VALIDATION_FAILED', page.error);
    const stage = c.req.query('stage');
    if (stage !== undefined && stage !== 'held' && stage !== 'released') return refuse(c, 'VALIDATION_FAILED', 'stage must be held or released');
    const tx = txOf(c);
    const paged = await listRetention(tx, page, stage === undefined ? {} : { stage });
    const totals = await retentionByOrder(tx, paged.items.map((h) => h.purchaseOrderId));
    const overall = await retentionTotals(tx);
    return c.json({
      items: paged.items.map((h) => {
        const figures = totals.get(h.purchaseOrderId);
        const stage = h.stage === 'released' ? ('released' as const) : ('held' as const);
        return {
          id: h.id,
          purchaseOrderId: h.purchaseOrderId,
          orderNumber: h.orderNumber,
          vendorId: h.vendorId,
          vendorName: h.vendorName,
          retentionRateBp: h.retentionRateBp,
          stage,
          withheld: figures?.withheld ?? '0',
          released: figures?.released ?? '0',
          held: figures?.held ?? '0',
          canRelease: stage === 'held' && figures !== undefined && figures.hasHeld,
        };
      }),
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: paged.count,
      summary: { held: overall.held, released: overall.released, holdings: paged.count },
    });
  });

  /**
   * Release what is held against an order — a payment, not an edit (RET-02).
   * The same order as paying a bill: every refusal first, then the writes in
   * one savepoint.
   */
  app.post('/money/retention/:holdingId/release', async (c) => {
    const holdingId = c.req.param('holdingId');
    if (!z.uuid().safeParse(holdingId).success) return refuse(c, 'NOT_FOUND', 'No such retention holding.');
    const parsed = releaseRetentionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return refuse(c, 'VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'That release was not recorded.');
    }
    if (!(await mayPay(c))) return refuse(c, 'FORBIDDEN', 'You cannot release retention.');

    const ctx = tenantOf(c);
    const tx = txOf(c);
    const { releasedOn, reference } = parsed.data;

    const { holding, payee } = await retentionForRelease(tx, holdingId);
    const prepared = await prepareRetentionRelease(tx, holding.purchaseOrderId);
    const company = await currentTenantName(tx);

    await tx.query('SAVEPOINT release_retention');
    try {
      const voucher = await allocateNumber(tx, ctx, 'payment_voucher', new Date(`${releasedOn}T12:00:00+05:30`));
      const payment = await recordRetentionRelease(tx, ctx, {
        number: voucher.number,
        purchaseOrderId: holding.purchaseOrderId,
        vendorId: holding.vendorId,
        payeeName: payee.name,
        payeePan: payee.pan,
        releasedOn,
        reference,
        amount: prepared.amount,
        tallyCompany: company,
      });
      await markRetentionReleased(tx, holdingId);
      await tx.query('RELEASE SAVEPOINT release_retention');
      return c.json(payment, 201);
    } catch (error) {
      await tx.query('ROLLBACK TO SAVEPOINT release_retention');
      throw error;
    }
  });

  /** Client billing: invoices, newest first, and what is invoiced, received and due over all of them. */
  app.get('/money/client-invoices', async (c) => {
    const page = readPage(c);
    if ('error' in page) return refuse(c, 'VALIDATION_FAILED', page.error);
    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success) return refuse(c, 'VALIDATION_FAILED', 'projectId must be a uuid');
    const tx = txOf(c);
    const state = c.req.query('state');
    if (state !== undefined && state !== 'issued' && state !== 'cancelled') return refuse(c, 'VALIDATION_FAILED', 'state must be issued or cancelled');
    const paged = await listClientInvoices(tx, page, { ...(projectId === undefined ? {} : { projectIds: [projectId] }), state, q: c.req.query('q') });
    // the stats are the firm's, or the project's inside one — never the page's
    return c.json({ ...paged, summary: await receivablesSummary(tx, todayInIndia(new Date()), projectId === undefined ? {} : { projectIds: [projectId] }) });
  });

  /** What clients owe, in ageing buckets; one project's with `?projectId=`. */
  app.get('/money/client-invoices/ageing', async (c) => {
    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success) {
      return refuse(c, 'VALIDATION_FAILED', 'projectId must be a uuid');
    }
    return c.json(
      await receivablesAgeing(txOf(c), todayInIndia(new Date()), projectId === undefined ? {} : { projectIds: [projectId] }),
    );
  });

  /**
   * Money in and out by month. Finance holds the receipts and the payments;
   * which orders are a project's is procurement's, so for one project the
   * host asks procurement for the order ids and hands them to finance. The
   * window is the financial year to date, or the quarter with `?period=q`.
   */
  app.get('/money/by-month', async (c) => {
    const period = moneyPeriod.safeParse(c.req.query('period') ?? 'fy');
    if (!period.success) return refuse(c, 'VALIDATION_FAILED', 'period must be fy or q');
    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success) {
      return refuse(c, 'VALIDATION_FAILED', 'projectId must be a uuid');
    }
    const tx = txOf(c);
    const window = financialWindow(todayInIndia(new Date()), period.data);
    const filter =
      projectId === undefined ? {} : { projectIds: [projectId], orderIds: await orderIdsOfProject(tx, projectId) };
    const series = await moneyByMonth(tx, window, filter);
    return c.json({ period: window.period, label: window.label, from: window.from, to: window.to, ...series });
  });

  /**
   * Raise a tax invoice. The project is projects', the GSTIN tenancy's, the tax
   * finance's. Every refusal first — no GSTIN, no rate, the go-live gate — then
   * the number and the invoice in one savepoint.
   */
  app.post('/money/client-invoices', async (c) => {
    const parsed = raiseClientInvoiceInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return refuse(c, 'VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'That invoice was not raised.');
    }
    if (!(await mayPay(c))) return refuse(c, 'FORBIDDEN', 'You cannot raise invoices.');

    const ctx = tenantOf(c);
    const tx = txOf(c);
    const input = parsed.data;
    const project = await projectForInvoice(tx, input.projectId);
    if (project === null) return refuse(c, 'NOT_FOUND', 'No such project.');
    const profile = await getCompanyProfile(tx);
    const prepared = await prepareClientInvoice(
      tx,
      {
        taxableWire: input.taxableAmount,
        invoiceDate: input.invoiceDate,
        supplierGstin: profile.gstin,
        placeOfSupply: input.placeOfSupply,
      },
      environment,
    );

    await tx.query('SAVEPOINT raise_invoice');
    try {
      const allocated = await allocateNumber(tx, ctx, 'tax_invoice', new Date(`${input.invoiceDate}T12:00:00+05:30`));
      const invoice = await recordClientInvoice(tx, ctx, prepared, {
        number: allocated.number,
        project: { id: project.id, code: project.code, clientName: project.clientName },
        clientGstin: input.clientGstin,
        invoiceDate: input.invoiceDate,
        expectedOn: input.expectedOn,
        certifiedOn: input.certifiedOn,
        description: input.description,
        tallyCompany: await currentTenantName(tx),
      });
      await tx.query('RELEASE SAVEPOINT raise_invoice');
      return c.json(invoice, 201);
    } catch (error) {
      await tx.query('ROLLBACK TO SAVEPOINT raise_invoice');
      throw error;
    }
  });

  app.post('/money/client-invoices/:invoiceId/receipts', async (c) => {
    const invoiceId = c.req.param('invoiceId');
    if (!z.uuid().safeParse(invoiceId).success) return refuse(c, 'NOT_FOUND', 'No such invoice.');
    const parsed = recordClientReceiptInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return refuse(c, 'VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'That receipt was not recorded.');
    }
    if (!(await mayPay(c))) return refuse(c, 'FORBIDDEN', 'You cannot record receipts.');
    const receipt = await recordClientReceipt(txOf(c), tenantOf(c), invoiceId, {
      receivedOn: parsed.data.receivedOn,
      amountWire: parsed.data.amount,
      reference: parsed.data.reference,
    });
    return c.json(receipt, 201);
  });

  app.post('/money/client-invoices/:invoiceId/cancel', async (c) => {
    const invoiceId = c.req.param('invoiceId');
    if (!z.uuid().safeParse(invoiceId).success) return refuse(c, 'NOT_FOUND', 'No such invoice.');
    const parsed = cancelClientInvoiceInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return refuse(c, 'VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'That invoice was not cancelled.');
    }
    if (!(await mayPay(c))) return refuse(c, 'FORBIDDEN', 'You cannot cancel invoices.');
    return c.json(await cancelClientInvoice(txOf(c), tenantOf(c), invoiceId, parsed.data.reason));
  });

  /**
   * The TDS challan for a month. The deductor is tenancy's — the TAN on the
   * company profile and the registered name — and the figures finance's.
   */
  app.get('/money/tds/challan', async (c) => {
    const period = c.req.query('period') ?? todayInIndia(new Date()).slice(0, 7);
    const tx = txOf(c);
    const profile = await getCompanyProfile(tx);
    return c.json(await challanFor(tx, period, { tan: profile.tan, name: await currentTenantName(tx) }, environment));
  });

  /** The 26Q deductee lines for a quarter; the current one when none is asked for. */
  app.get('/money/tds/26q', async (c) => {
    const asked = c.req.query('quarter');
    const quarter: Quarter = asked === undefined ? quarterOf(todayInIndia(new Date())) : parseQuarter(asked);
    const tx = txOf(c);
    const profile = await getCompanyProfile(tx);
    return c.json(await form26QFor(tx, quarter, { tan: profile.tan, name: await currentTenantName(tx) }, environment));
  });

  app.onError((error, c) => {
    if (error instanceof ProvisionalOutputRefused) return refuse(c, error.code, error.message);
    if (error instanceof StatementPeriodInvalid) return refuse(c, 'VALIDATION_FAILED', error.message);
    if (error instanceof ClientInvoiceNotFound) return refuse(c, 'NOT_FOUND', 'No such invoice.');
    if (error instanceof TaxInvoiceRefused) return refuse(c, 'CONFLICT', error.message);
    if (error instanceof BillNotFound) return refuse(c, 'NOT_FOUND', 'No such bill.');
    if (error instanceof RetentionNotFound) return refuse(c, 'NOT_FOUND', 'No such retention holding.');
    if (
      error instanceof RetentionRefused ||
      error instanceof RetentionReleaseRefused ||
      error instanceof BillRefused ||
      error instanceof PaymentRuleMissing ||
      error instanceof NumberSeriesError
    ) {
      return refuse(c, 'CONFLICT', error.message);
    }
    throw error;
  });

  return app;
}
