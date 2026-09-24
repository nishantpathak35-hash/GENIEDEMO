import { describe, expect, it } from 'vitest';
import { createPurchaseOrderFromBoqInput } from '@cog/contracts';
import { purchaseOrderLinesFromBoq } from '../src/application/from-boq.js';
import { purchaseOrderTotals } from '../src/domain/purchase-order.js';
import { toDomainLines } from '../src/application/purchase-order-writes.js';

/**
 * Mapping BOQ lines to purchase-order lines.
 *
 * The isolation suite proves the endpoint creates a draft order against real
 * Postgres. This proves the mapping itself, and the two absences the legacy
 * relies on: no caller-supplied order value, and no hardcoded tax rate.
 */

const LINE = {
  id: '66666666-6666-4666-8666-666666666666',
  description: 'Vitrified tile 600x600',
  uom: 'sqm',
  quantityMicros: 12_375_000n,
  costRate: 60_000n,
};

describe('a purchase-order line made from a BOQ line', () => {
  it('takes the cost rate, never the client-facing rate', () => {
    const [line] = purchaseOrderLinesFromBoq([LINE], 1800);
    // boq.js:233 is `item.cost_rate || item.rate || 0`, so an unknown cost is
    // priced at the selling rate. Here only the cost rate is ever read — the
    // client rate is not even a field on OrderableLine.
    expect(line!.unitRate).toBe('60000');
  });

  it('keeps the BOQ quantity exactly, in whole units and millionths', () => {
    const [line] = purchaseOrderLinesFromBoq([LINE], 1800);
    expect(line!.quantityWhole).toBe(12);
    expect(line!.quantityMillionths).toBe(375_000);
  });

  it('records which BOQ line it came from', () => {
    const [line] = purchaseOrderLinesFromBoq([LINE], 1800);
    expect(line!.boqItemId).toBe(LINE.id);
  });

  it('leaves the HSN/SAC empty rather than inventing one', () => {
    const [line] = purchaseOrderLinesFromBoq([LINE], 1800);
    // An HSN code decides a tax rate. A wrong one is a filing error, so an
    // absent one stays absent.
    expect(line!.hsnSac).toBe('');
  });

  it('uses the supplied GST rate — 18 is not hardcoded anywhere', () => {
    expect(purchaseOrderLinesFromBoq([LINE], 500)[0]!.gstRate).toBe(500);
    expect(purchaseOrderLinesFromBoq([LINE], 1200)[0]!.gstRate).toBe(1200);
    // boq.js:244 writes `tax_pct: 18` unconditionally. CA-16 is open on what
    // rate a works contract attracts, so it is an input here.
    expect(purchaseOrderLinesFromBoq([LINE], 1800)[0]!.gstRate).toBe(1800);
  });

  it('produces totals from the lines and nothing else', () => {
    const totals = purchaseOrderTotals(toDomainLines(purchaseOrderLinesFromBoq([LINE], 1800)));
    // 12.375 x Rs 600.00 = Rs 7,425.00 taxable; 18% = Rs 1,336.50.
    expect(totals.taxable).toBe(742_500n);
    expect(totals.gst).toBe(133_650n);
    expect(totals.gross).toBe(876_150n);
  });
});

describe('the request shape carries no money and no state', () => {
  const valid = {
    projectId: '55555555-5555-4555-8555-555555555555',
    vendorId: '44444444-4444-4444-8444-444444444444',
    boqItemIds: [LINE.id],
    gstRate: 1800,
  };

  it('strips a caller-supplied order value', () => {
    // boq.js:170 takes `payload.poValue` when present, so a caller decides what
    // the order is worth.
    const parsed = createPurchaseOrderFromBoqInput.parse({
      ...valid,
      poValue: '1',
      po_value: '1',
      total: '1',
    });
    expect(Object.keys(parsed).sort()).toEqual([
      'boqItemIds',
      'gstRate',
      'projectId',
      'vendorId',
    ]);
  });

  it('strips a caller-supplied state', () => {
    // The legacy INSERT hardcodes 'Approved' rather than reading it from the
    // caller, but neither belongs in a request.
    const parsed = createPurchaseOrderFromBoqInput.parse({
      ...valid,
      state: 'approved',
      status: 'Approved',
      approval_status: 'Approved',
    });
    expect(Object.keys(parsed)).not.toContain('state');
    expect(Object.keys(parsed)).not.toContain('status');
    expect(Object.keys(parsed)).not.toContain('approval_status');
  });

  it('refuses an empty selection', () => {
    expect(createPurchaseOrderFromBoqInput.safeParse({ ...valid, boqItemIds: [] }).success).toBe(
      false,
    );
  });

  it('requires a GST rate rather than defaulting one', () => {
    const { gstRate: _omitted, ...withoutRate } = valid;
    expect(createPurchaseOrderFromBoqInput.safeParse(withoutRate).success).toBe(false);
  });
});
