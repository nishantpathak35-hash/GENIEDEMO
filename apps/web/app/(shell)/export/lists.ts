import { API_ROUTES, type ApiClient } from '@cog/contracts';
import { load } from '@cog/design-system';
import { everyRow, quantity, rupees, text, type ExportResult } from '../../../lib/export';
import { termsFor } from '@cog/design-system';
import { REPORTS, exportListOf } from '../reports/catalogue';

/**
 * Every list the design draws an Export button on, and the columns it shows.
 *
 * The keys a list accepts are the SCREEN's URL parameters, translated here to
 * the API's names, so a file exported from a filtered screen holds what the
 * screen holds. A column set is the list's own — adding a column to a screen
 * without adding it here is a file that disagrees with the screen.
 */

type Params = URLSearchParams;
const LIMIT = '200';

function opt(params: Params, from: string, to: string = from): Record<string, string> {
  const value = params.get(from);
  return value === null || value === '' ? {} : { [to]: value };
}

function pageQuery(cursor: string | undefined): Record<string, string> {
  return { limit: LIMIT, ...(cursor === undefined ? {} : { cursor }) };
}

function projectIdOf(params: Params): string | null {
  const id = params.get('projectId');
  return id !== null && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

const MISSING_PROJECT = {
  kind: 'refused',
  error: { code: 'VALIDATION_FAILED', message: 'This export needs the project it is for.' },
} as const;

async function projectCodes(client: ApiClient): Promise<ReadonlyMap<string, string>> {
  const projects = await load(client, API_ROUTES.listProjects, { query: { limit: LIMIT } });
  return new Map(projects.kind === 'ok' ? projects.data.items.map((p) => [p.id, p.code] as const) : []);
}

export interface ExportList {
  readonly filename: string;
  readonly headers: readonly string[];
  readonly rows: (client: ApiClient, params: Params) => Promise<ExportResult>;
}

export const EXPORT_LISTS: Readonly<Record<string, ExportList>> = {
  leads: {
    filename: 'leads',
    headers: ['Client', 'Stage', 'Estimated value', 'Probability %', 'Next step on', 'Next step', 'Closed on'],
    async rows(client, params) {
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listLeads, {
          query: { ...pageQuery(cursor), ...opt(params, 'stage'), ...opt(params, 'sort'), ...opt(params, 'q') },
        }),
      );
      if (all.kind !== 'ok') return all;
      return {
        kind: 'ok',
        rows: all.data.map((l) => [
          text(l.clientName),
          l.stage,
          rupees(l.estimatedValue),
          String(l.probabilityPct),
          l.nextFollowupOn ?? '',
          l.nextFollowupKind ?? '',
          l.closedOn ?? '',
        ]),
      };
    },
  },

  projects: {
    filename: 'projects',
    headers: ['Code', 'Project', 'Client', 'State', 'Health', 'Contract', 'Ordered so far', 'Margin at risk', 'Margin status'],
    async rows(client, params) {
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listProjects, { query: { ...pageQuery(cursor), ...opt(params, 'state') } }),
      );
      if (all.kind !== 'ok') return all;
      // The rollup answers for at most 200 ids at a time.
      const figures = new Map<string, { health: string; committed: string; atRisk: string | null; status: string }>();
      for (let start = 0; start < all.data.length; start += 200) {
        const ids = all.data.slice(start, start + 200).map((p) => p.id);
        const rollup = await load(client, API_ROUTES.projectRollup, { query: { ids: ids.join(',') } });
        if (rollup.kind !== 'ok') return rollup;
        for (const r of rollup.data.items) {
          figures.set(r.id, { health: r.health, committed: r.committed, atRisk: r.margin.atRisk, status: r.margin.status });
        }
      }
      return {
        kind: 'ok',
        rows: all.data.map((p) => {
          const f = figures.get(p.id);
          return [
            text(p.code),
            text(p.name),
            text(p.clientName),
            p.state,
            f?.health ?? '',
            rupees(p.originalValue),
            rupees(f?.committed ?? null),
            rupees(f?.atRisk ?? null),
            f?.status ?? '',
          ];
        }),
      };
    },
  },

  orders: {
    filename: 'purchase-orders',
    headers: ['Number', 'Vendor', 'Project', 'State', 'Taxable', 'GST', 'Gross', 'Raised on'],
    async rows(client, params) {
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listPurchaseOrders, {
          query: {
            ...pageQuery(cursor),
            ...opt(params, 'sort'),
            ...opt(params, 'state'),
            ...opt(params, 'vendor', 'vendorId'),
            ...opt(params, 'project', 'projectId'),
            ...opt(params, 'q'),
          },
        }),
      );
      if (all.kind !== 'ok') return all;
      const codes = await projectCodes(client);
      return {
        kind: 'ok',
        rows: all.data.map((o) => [
          text(o.number),
          text(o.vendorName ?? ''),
          o.projectId === null ? '' : (codes.get(o.projectId) ?? ''),
          o.state,
          rupees(o.taxable),
          rupees(o.gst),
          rupees(o.gross),
          o.createdAt.slice(0, 10),
        ]),
      };
    },
  },

  vendors: {
    filename: 'vendors',
    headers: ['Code', 'Vendor', 'GSTIN', 'PAN', 'Status', 'Open orders', 'Open orders total', 'Agreed rates', 'Last ordered'],
    async rows(client, params) {
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listVendors, { query: { ...pageQuery(cursor), ...opt(params, 'q'), ...opt(params, 'sort') } }),
      );
      if (all.kind !== 'ok') return all;
      return {
        kind: 'ok',
        rows: all.data.map((v) => [
          text(v.code),
          text(v.name),
          v.gstin ?? '',
          v.pan ?? '',
          v.status,
          String(v.openOrders),
          rupees(v.openOrdersTotal),
          String(v.contractCount),
          v.lastOrderedAt?.slice(0, 10) ?? '',
        ]),
      };
    },
  },

  bills: {
    filename: 'bills',
    headers: ['Bill', 'Vendor', 'Order', 'Claimed', 'Taxable value', 'GST', 'State', 'Submitted', 'Due on', 'Paid on'],
    async rows(client, params) {
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listBills, { query: { ...pageQuery(cursor), ...opt(params, 'view') } }),
      );
      if (all.kind !== 'ok') return all;
      return {
        kind: 'ok',
        rows: all.data.map((b) => [
          text(b.billNumber),
          text(b.vendorName),
          text(b.orderNumber),
          rupees(b.amountClaimed),
          b.taxableAmount === null ? '' : rupees(b.taxableAmount),
          b.gstAmount === null ? '' : rupees(b.gstAmount),
          b.paidOn === null ? b.state : 'paid',
          b.submittedAt.slice(0, 10),
          b.dueOn ?? '',
          b.paidOn ?? '',
        ]),
      };
    },
  },

  payments: {
    filename: 'payments',
    headers: [
      'Voucher',
      'Paid on',
      'Paid to',
      'PAN',
      'Bill',
      'Gross',
      'Taxable value',
      'GST',
      'Section',
      'Rate (basis points)',
      'Tax deducted',
      'Retention withheld',
      'Net paid',
      'Reference',
      'Rates',
    ],
    async rows(client) {
      const all = await everyRow((cursor) => load(client, API_ROUTES.listPayments, { query: pageQuery(cursor) }));
      if (all.kind !== 'ok') return all;
      return {
        kind: 'ok',
        rows: all.data.map((p) => [
          text(p.number),
          p.paidOn,
          text(p.payeeName),
          p.payeePan ?? '',
          text(p.billNumber ?? ''),
          rupees(p.grossAmount),
          rupees(p.taxableAmount),
          rupees(p.gstAmount),
          p.tdsSection ?? '',
          p.tdsRateBp === null ? '' : String(p.tdsRateBp),
          rupees(p.tdsAmount),
          rupees(p.retentionWithheld),
          rupees(p.netPaid),
          text(p.reference),
          p.provisional ? 'provisional' : 'verified',
        ]),
      };
    },
  },

  retention: {
    filename: 'retention',
    headers: ['Order', 'Vendor', 'Rate (basis points)', 'Withheld', 'Released', 'Held now', 'Stage'],
    async rows(client) {
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listRetentionPositions, { query: pageQuery(cursor) }),
      );
      if (all.kind !== 'ok') return all;
      return {
        kind: 'ok',
        rows: all.data.map((p) => [
          text(p.orderNumber ?? ''),
          text(p.vendorName ?? ''),
          String(p.retentionRateBp),
          rupees(p.withheld),
          rupees(p.released),
          rupees(p.held),
          p.stage,
        ]),
      };
    },
  },

  'form-26q': {
    filename: 'form-26q',
    headers: [
      'Voucher',
      'Deductee',
      'PAN',
      'Section',
      'Nature of payment',
      'Paid on',
      'Amount paid',
      'Rate (basis points)',
      'Tax deducted',
      'Remark',
    ],
    async rows(client, params) {
      const statement = await load(client, API_ROUTES.form26Q, { query: opt(params, 'quarter') });
      if (statement.kind !== 'ok') return statement;
      if (statement.data.status === 'absent') {
        return { kind: 'refused', error: { code: 'CONFLICT', message: statement.data.why } };
      }
      return {
        kind: 'ok',
        rows: statement.data.rows.map((r) => [
          text(r.paymentNumber),
          text(r.deducteeName),
          r.pan,
          r.section,
          r.natureCode ?? '',
          r.paidOn,
          rupees(r.amountPaid),
          r.tdsRateBp === null ? '' : String(r.tdsRateBp),
          rupees(r.tdsAmount),
          r.remark ?? '',
        ]),
      };
    },
  },

  'client-invoices': {
    filename: 'client-invoices',
    headers: [
      'Invoice',
      'Dated',
      'Client',
      'Client GSTIN',
      'Project',
      'Place of supply',
      'Taxable value',
      'CGST',
      'SGST',
      'IGST',
      'Round off',
      'Total',
      'Received',
      'Due',
      'Expected',
      'Certified',
      'State',
      'Rates',
    ],
    async rows(client) {
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listClientInvoices, { query: pageQuery(cursor) }),
      );
      if (all.kind !== 'ok') return all;
      return {
        kind: 'ok',
        rows: all.data.map((i) => [
          text(i.number),
          i.invoiceDate,
          text(i.clientName),
          i.clientGstin ?? '',
          text(i.projectCode),
          i.placeOfSupply,
          rupees(i.taxable),
          rupees(i.cgst),
          rupees(i.sgst),
          rupees(i.igst),
          rupees(i.roundOff),
          rupees(i.total),
          rupees(i.received),
          rupees(i.balance),
          i.expectedOn,
          i.certifiedOn ?? '',
          i.state,
          i.provisional ? 'provisional' : 'verified',
        ]),
      };
    },
  },

  rates: {
    filename: 'rate-analysis',
    headers: ['Order', 'Vendor', 'Line', 'Description', 'Trade', 'Agreed rate', 'Paid rate', 'Above agreed (bp)'],
    async rows(client, params) {
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listRateDeviations, { query: { ...pageQuery(cursor), ...opt(params, 'trade', 'tradeCode') } }),
      );
      if (all.kind !== 'ok') return all;
      return {
        kind: 'ok',
        rows: all.data.map((d) => [
          text(d.purchaseOrderNumber),
          text(d.vendorName),
          String(d.lineNo),
          text(d.description),
          text(d.tradeCode),
          rupees(d.contractedUnitRatePaise),
          rupees(d.actualUnitRatePaise),
          String(d.excessBp),
        ]),
      };
    },
  },

  stock: {
    filename: 'stock',
    headers: ['Item', 'Warehouse', 'On hand', 'Unit', 'Reorder at', 'Level %', 'At the gate', 'Value'],
    async rows(client, params) {
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listStock, { query: { ...pageQuery(cursor), ...opt(params, 'site', 'warehouse'), ...opt(params, 'q') } }),
      );
      if (all.kind !== 'ok') return all;
      return {
        kind: 'ok',
        rows: all.data.map((s) => [
          text(s.name),
          text(s.warehouse),
          quantity(s.quantityMicros),
          text(s.uom),
          quantity(s.reorderLevel),
          s.levelPct === null ? '' : String(s.levelPct),
          quantity(s.awaitingCheckInMicros),
          rupees(s.valuePaise),
        ]),
      };
    },
  },

  documents: {
    filename: 'documents',
    headers: ['File', 'Folder', 'Type', 'Size (bytes)', 'Registered on'],
    async rows(client, params) {
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listDocuments, { query: { ...pageQuery(cursor), ...opt(params, 'q'), ...opt(params, 'folder') } }),
      );
      if (all.kind !== 'ok') return all;
      return {
        kind: 'ok',
        rows: all.data.map((d) => [
          text(d.fileName),
          d.entityType,
          d.contentType,
          String(d.sizeBytes),
          d.createdAt.slice(0, 10),
        ]),
      };
    },
  },

  'site-reports': {
    filename: 'daily-reports',
    headers: ['Day', 'Project', 'Filed', 'On site', 'Notes'],
    async rows(client, params) {
      const sort = params.get('sort') === 'date:asc' ? 'asc' : 'desc';
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listDailyReports, {
          query: { ...pageQuery(cursor), sort, ...opt(params, 'site', 'projectId') },
        }),
      );
      if (all.kind !== 'ok') return all;
      const codes = await projectCodes(client);
      return {
        kind: 'ok',
        rows: all.data.map((r) => [
          r.reportDate,
          codes.get(r.projectId) ?? '',
          r.submitted ? 'Filed' : 'Draft',
          r.headCount === null ? '' : String(r.headCount),
          text(r.notes),
        ]),
      };
    },
  },

  imprest: {
    filename: 'imprest',
    headers: ['Purpose', 'Requested', 'Sanctioned', 'Reconciled', 'Status'],
    async rows(client, params) {
      const projectId = projectIdOf(params);
      if (projectId === null) return MISSING_PROJECT;
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listImprest, { params: { projectId }, query: pageQuery(cursor) }),
      );
      if (all.kind !== 'ok') return all;
      return {
        kind: 'ok',
        rows: all.data.map((i) => [
          text(i.purpose),
          rupees(i.amountRequested),
          rupees(i.amountSanctioned),
          rupees(i.amountReconciled),
          i.status,
        ]),
      };
    },
  },

  measurements: {
    filename: 'measurements',
    headers: ['Measured on', 'Description', 'Location', 'Quantity', 'Unit', 'Signed by client', 'Signed by site'],
    async rows(client, params) {
      const projectId = projectIdOf(params);
      if (projectId === null) return MISSING_PROJECT;
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listMeasurements, { params: { projectId }, query: pageQuery(cursor) }),
      );
      if (all.kind !== 'ok') return all;
      return {
        kind: 'ok',
        rows: all.data.map((m) => [
          m.measuredOn,
          text(m.description),
          text(m.location),
          quantity(m.measuredMicros),
          text(m.uom),
          text(m.signedByClient),
          text(m.signedBySite),
        ]),
      };
    },
  },

  recces: {
    filename: 'site-surveys',
    headers: ['Surveyed on', 'Floor', 'Floors', 'Condition', 'Handover on', 'Status'],
    async rows(client, params) {
      const projectId = projectIdOf(params);
      if (projectId === null) return MISSING_PROJECT;
      const all = await everyRow((cursor) =>
        load(client, API_ROUTES.listRecces, { params: { projectId }, query: pageQuery(cursor) }),
      );
      if (all.kind !== 'ok') return all;
      return {
        kind: 'ok',
        rows: all.data.map((r) => [
          r.recceOn,
          text(r.floorNumber),
          String(r.numFloors),
          text(r.siteCondition),
          r.handoverOn ?? '',
          r.status,
        ]),
      };
    },
  },

  boq: {
    filename: 'boq',
    headers: ['Section', 'Item', 'Description', 'Unit', 'Quantity', 'Rate', 'Cost rate', 'Amount'],
    async rows(client, params) {
      const projectId = projectIdOf(params);
      if (projectId === null) return MISSING_PROJECT;
      // A BOQ is one schedule, returned whole with its computed amounts.
      const boq = await load(client, API_ROUTES.projectBoq, { params: { projectId } });
      if (boq.kind !== 'ok') return boq;
      return {
        kind: 'ok',
        rows: boq.data.items.map((l) => [
          text(l.section),
          String(l.itemNo),
          text(l.description),
          text(l.uom),
          quantity(l.quantityMicros),
          rupees(l.rate),
          rupees(l.costRate),
          rupees(l.amount),
        ]),
      };
    },
  },

  variations: {
    filename: 'variations',
    headers: ['Number', 'Title', 'Cost impact', 'State', 'Decided on'],
    async rows(client, params) {
      const projectId = projectIdOf(params);
      if (projectId === null) return MISSING_PROJECT;
      const variations = await load(client, API_ROUTES.listChangeOrders, { params: { projectId } });
      if (variations.kind !== 'ok') return variations;
      return {
        kind: 'ok',
        rows: variations.data.items.map((v) => [
          text(v.number),
          text(v.title),
          rupees(v.costImpact),
          v.state,
          v.decidedAt?.slice(0, 10) ?? '',
        ]),
      };
    },
  },
};

/**
 * The Reports Center's nine, on the same path as every list: `report-<key>`,
 * with the report's own parameters (`period`, `projectId`). The rows are the
 * run's, a money cell printed in rupees like every other export.
 */
for (const report of REPORTS) {
  (EXPORT_LISTS as Record<string, ExportList>)[exportListOf(report.key)] = {
    filename: exportListOf(report.key),
    headers: [],
    async rows(client, params) {
      const words = await load(client, API_ROUTES.terminology, {});
      const t = termsFor(words.kind === 'ok' ? words.data : null);
      const period = params.get('period') === 'q' ? 'q' : 'fy';
      const projectId = report.narrows ? projectIdOf(params) : null;
      const result = await report.run(client, { period, projectId }, t);
      if (result.kind !== 'ok') return result.kind === 'unreachable' ? { kind: 'unreachable' } : { kind: 'refused', error: result.error };
      return {
        kind: 'ok',
        headers: result.run.columns.map((c) => c.label),
        rows: result.run.rows.map((row) => row.map((cell) => (cell.money === undefined ? text(cell.text) : rupees(cell.money)))),
      };
    },
  };
}
