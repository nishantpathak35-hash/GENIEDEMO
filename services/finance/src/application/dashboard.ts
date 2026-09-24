import { fromWire } from '@cog/money';
import type { FinancialWindow } from '@cog/service-kit';
import type { TxLike } from './tax-rates.js';
import { ageing, monthSeries, type Ageing, type MonthSeries } from '../domain/ageing.js';

/**
 * The reads behind Today's money panels: receivables in ageing buckets, and
 * money in and out by month. Both are whole-tenant aggregates — over every
 * issued invoice, every receipt and every payment, never over a page — and
 * both narrow to one project with `projectIds`, the way `receivablesSummary`
 * and `listClientInvoices` narrow for a client login. RLS scopes the tenant;
 * no `WHERE tenant_id`.
 */

/** Every project's tax invoices issued, gross, summed — what has been billed to each client so far. Cancelled invoices owe nothing and count nothing. */
export async function invoicedByProject(tx: TxLike): Promise<ReadonlyMap<string, ReturnType<typeof fromWire>>> {
  const rows = await tx.query<{ project_id: string; total: string }>(
    `SELECT project_id, SUM(total)::text AS total
       FROM finance.client_invoices
      WHERE state = 'issued'
      GROUP BY project_id`,
  );
  return new Map(rows.map((r) => [r.project_id, fromWire(r.total)]));
}

export interface ReceivablesAgeing extends Ageing {
  readonly today: string;
  readonly oldest: {
    readonly number: string;
    readonly clientName: string;
    readonly projectCode: string;
    readonly balance: string;
    readonly expectedOn: string;
    readonly daysPast: number;
  } | null;
}

/**
 * What clients still owe — each open balance bucketed by how long past its
 * expected date — and the invoice longest past it. The balance is the
 * invoice's total less its receipts, as `receivablesSummary` computes it; the
 * day count is Postgres's, against `today` on India's calendar.
 */
export async function receivablesAgeing(
  tx: TxLike,
  today: string,
  filter: { readonly projectIds?: readonly string[] | undefined } = {},
): Promise<ReceivablesAgeing> {
  const projects = filter.projectIds === undefined ? null : [...filter.projectIds];
  const rows = await tx.query<{
    number: string;
    client_name: string;
    project_code: string;
    expected_on: string;
    balance: string;
    days_past: number;
  }>(
    `SELECT i.number, i.client_name, i.project_code, i.expected_on::text AS expected_on,
            (i.total - COALESCE(r.received, 0))::text AS balance,
            ($1::date - i.expected_on)::int AS days_past
       FROM finance.client_invoices i
       LEFT JOIN (
         SELECT tenant_id, invoice_id, SUM(amount) AS received
           FROM finance.client_receipts
          GROUP BY tenant_id, invoice_id
       ) r ON r.tenant_id = i.tenant_id AND r.invoice_id = i.id
      WHERE i.state = 'issued'
        AND i.total - COALESCE(r.received, 0) > 0
        AND ($2::uuid[] IS NULL OR i.project_id = ANY($2::uuid[]))
      ORDER BY days_past DESC, i.number`,
    [today, projects],
  );
  const aged = ageing(rows.map((r) => ({ daysPast: r.days_past, amount: fromWire(r.balance) })));
  const first = rows[0];
  return {
    today,
    ...aged,
    oldest:
      first === undefined || first.days_past <= 0
        ? null
        : {
            number: first.number,
            clientName: first.client_name,
            projectCode: first.project_code,
            balance: first.balance,
            expectedOn: first.expected_on,
            daysPast: first.days_past,
          },
  };
}

/**
 * Money in and out by month over a window: receipts recorded against tax
 * invoices, by the day they were received, and payments recorded against
 * bills by the day they were paid — `net_paid`, what actually left, net of
 * TDS and retention, a retention release included because that left too.
 *
 * `projectIds` narrows the receipts (an invoice names its project);
 * `orderIds` narrows the payments (a payment names its order, and which
 * orders are a project's is procurement's to say — the host passes the
 * answer here). Both absent means the whole tenant.
 */
export async function moneyByMonth(
  tx: TxLike,
  window: FinancialWindow,
  filter: { readonly projectIds?: readonly string[] | undefined; readonly orderIds?: readonly string[] | undefined } = {},
): Promise<MonthSeries> {
  const projects = filter.projectIds === undefined ? null : [...filter.projectIds];
  const orders = filter.orderIds === undefined ? null : [...filter.orderIds];
  const received = await tx.query<{ month: string; total: string }>(
    `SELECT to_char(r.received_on, 'YYYY-MM') AS month, SUM(r.amount)::text AS total
       FROM finance.client_receipts r
       JOIN finance.client_invoices i ON i.tenant_id = r.tenant_id AND i.id = r.invoice_id
      WHERE r.received_on >= $1::date AND r.received_on < $2::date
        AND ($3::uuid[] IS NULL OR i.project_id = ANY($3::uuid[]))
      GROUP BY 1`,
    [window.start, window.end, projects],
  );
  const paid = await tx.query<{ month: string; total: string }>(
    `SELECT to_char(paid_on, 'YYYY-MM') AS month, SUM(net_paid)::text AS total
       FROM finance.vendor_payments
      WHERE paid_on >= $1::date AND paid_on < $2::date
        AND ($3::uuid[] IS NULL OR purchase_order_id = ANY($3::uuid[]))
      GROUP BY 1`,
    [window.start, window.end, orders],
  );
  const inBy = new Map(received.map((r) => [r.month, fromWire(r.total)]));
  const outBy = new Map(paid.map((r) => [r.month, fromWire(r.total)]));
  return monthSeries(
    window.months.map((m) => ({
      month: m.month,
      label: m.label,
      collected: inBy.get(m.month) ?? fromWire('0'),
      paidOut: outBy.get(m.month) ?? fromWire('0'),
    })),
  );
}
