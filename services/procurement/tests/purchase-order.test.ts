import { describe, expect, it } from 'vitest';
import { bp, paise, toRupeeString } from '@cog/money';
import {
  PurchaseOrderError,
  applyEdit,
  canTransition,
  lineTotals,
  purchaseOrderTotals,
  quantity,
  requiresReapproval,
  transition,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from '../src/index.js';

const line = (over: Partial<PurchaseOrderLine> = {}): PurchaseOrderLine => ({
  description: 'Vitrified tile 600x600',
  hsnSac: '6907',
  quantity: quantity(10n),
  unitRate: paise(50_000n), // ₹500.00
  gstRate: bp(1800),
  ...over,
});

const po = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  number: 'PO-2026-0001',
  state: 'draft',
  vendorId: 'v_1',
  lines: [line()],
  version: 1,
  ...over,
});

describe('line totals are computed, never accepted', () => {
  it('multiplies quantity by unit rate exactly', () => {
    const t = lineTotals(line());
    expect(toRupeeString(t.taxable)).toBe('5000.00'); // 10 x ₹500
    expect(toRupeeString(t.gst)).toBe('900.00'); // 18%
  });

  it('handles a fractional quantity without a float', () => {
    // 12.375 x ₹237.50 = ₹2939.0625 -> ₹2939.06 at paise precision.
    const t = lineTotals(line({ quantity: quantity(12n, 375_000n), unitRate: paise(23_750n) }));
    expect(toRupeeString(t.taxable)).toBe('2939.06');
  });

  it('rejects a negative quantity rather than producing a credit by accident', () => {
    expect(() => lineTotals(line({ quantity: quantity(-1n) }))).toThrow();
  });
});

describe('GST is rounded per invoice, never per line', () => {
  it('does not lose the tax across forty small lines', () => {
    // The defect the boundary exists to prevent: forty lines of ₹5.00 at 9%
    // give 45 paise each. Rounded per line to the rupee that is ₹0 each and ₹0
    // in total; the invoice figure is ₹18.
    const lines = Array.from({ length: 40 }, () =>
      line({ quantity: quantity(1n), unitRate: paise(500n), gstRate: bp(900) }),
    );
    const totals = purchaseOrderTotals(lines);
    expect(toRupeeString(totals.taxable)).toBe('200.00');
    expect(toRupeeString(totals.gst)).toBe('18.00');
  });

  it('keeps line GST at paise precision for the e-invoice and GSTR-1', () => {
    const t = lineTotals(line({ quantity: quantity(1n), unitRate: paise(500n), gstRate: bp(900) }));
    expect(toRupeeString(t.gst)).toBe('0.45');
  });
});

describe('totals cannot be supplied by a caller', () => {
  it('exposes no input by which a client could assert a total', () => {
    // write.js:55 trusts a client-supplied gst_amount, and :157 trusts the line
    // total itself. This takes lines and returns totals; there is no parameter
    // to trust.
    const totals = purchaseOrderTotals([line()]);
    expect(Object.keys(totals).sort()).toEqual(['gross', 'gst', 'taxable']);
  });
});

describe('optimistic locking is not optional', () => {
  it('rejects a stale write', () => {
    expect(() =>
      applyEdit({
        current: po({ version: 4 }),
        lines: [line()],
        vendorId: 'v_1',
        number: 'PO-2026-0001',
        expectedVersion: 3,
      }),
    ).toThrow(PurchaseOrderError);
  });

  it('cannot be skipped by omitting the version', () => {
    // In the legacy code the check applies only when the client sends
    // expectedVersion, so the client decides whether it applies to itself.
    expect(() =>
      applyEdit({
        current: po(),
        lines: [line()],
        vendorId: 'v_1',
        number: 'PO-2026-0001',
        expectedVersion: undefined as unknown as number,
      }),
    ).toThrow(/expectedVersion is required/);
  });

  it('increments the version on every accepted write', () => {
    const next = applyEdit({
      current: po({ version: 2 }),
      lines: [line()],
      vendorId: 'v_1',
      number: 'PO-2026-0001',
      expectedVersion: 2,
    });
    expect(next.version).toBe(3);
  });
});

describe('re-approval on financial change', () => {
  const approved = po({ state: 'approved', version: 1 });

  it('resets an approved order to draft when the total changes', () => {
    const next = applyEdit({
      current: approved,
      lines: [line({ quantity: quantity(11n) })],
      vendorId: 'v_1',
      number: 'PO-2026-0001',
      expectedVersion: 1,
    });
    expect(next.state).toBe('draft');
  });

  it('resets when the vendor changes', () => {
    const next = applyEdit({
      current: approved,
      lines: [line()],
      vendorId: 'v_2',
      number: 'PO-2026-0001',
      expectedVersion: 1,
    });
    expect(next.state).toBe('draft');
  });

  it('catches a change that the old float tolerance let through', () => {
    // Legacy: `Math.abs(existing.po_value - totalVal) > 0.5`. A sub-rupee
    // change slipped past an approval gate because money was a float. The
    // comparison is now exact, so one paise per unit is a financial change.
    const next = applyEdit({
      current: approved,
      lines: [line({ unitRate: paise(50_001n) })],
      vendorId: 'v_1',
      number: 'PO-2026-0001',
      expectedVersion: 1,
    });
    expect(next.state).toBe('draft');
  });

  it('does not reset a draft order, which was never approved', () => {
    expect(requiresReapproval(po(), po({ lines: [line({ quantity: quantity(99n) })] }))).toBe(false);
  });

  it('renumbering alone does not reset approval', () => {
    const next = applyEdit({
      current: approved,
      lines: [line()],
      vendorId: 'v_1',
      number: 'PO-2026-0099',
      expectedVersion: 1,
    });
    expect(next.state).toBe('approved');
  });
});

describe('identity survives a renumber', () => {
  it('keeps the same id when the number changes', () => {
    // The legacy primary key IS the number, so renaming cascades it across five
    // tables with loose UPDATEs and no transaction. A half-completed rename
    // leaves orphans nothing can reassociate.
    const next = applyEdit({
      current: po(),
      lines: [line()],
      vendorId: 'v_1',
      number: 'PO-2026-9999',
      expectedVersion: 1,
    });
    expect(next.id).toBe(po().id);
    expect(next.number).toBe('PO-2026-9999');
  });
});

describe('the state machine is an enum, not substring matching', () => {
  it('allows only declared transitions', () => {
    expect(canTransition('draft', 'pending_approval')).toBe(true);
    expect(canTransition('approved', 'draft')).toBe(false);
    expect(canTransition('cancelled', 'draft')).toBe(false);
  });

  it('refuses an undeclared transition rather than guessing', () => {
    expect(() => transition(po({ state: 'approved' }), 'pending_approval')).toThrow(
      PurchaseOrderError,
    );
  });

  it('cannot be confused by one state name containing another', () => {
    // `stage.includes('reject')` makes "Rejected", "rejected by finance" and
    // "not rejected" indistinguishable to the legacy engine.
    expect(canTransition('draft', 'cancelled')).toBe(true);
    expect(canTransition('cancelled', 'cancelled')).toBe(false);
  });
});

describe('editing rules', () => {
  it('refuses to edit a cancelled order', () => {
    expect(() =>
      applyEdit({
        current: po({ state: 'cancelled' }),
        lines: [line()],
        vendorId: 'v_1',
        number: 'x',
        expectedVersion: 1,
      }),
    ).toThrow(/cancelled/);
  });

  it('refuses an order with no lines', () => {
    expect(() =>
      applyEdit({ current: po(), lines: [], vendorId: 'v_1', number: 'x', expectedVersion: 1 }),
    ).toThrow(/at least one line/);
  });
});
