import { describe, expect, it } from 'vitest';
import {
  createPurchaseOrderInput,
  renamePurchaseOrderInput,
  updatePurchaseOrderInput,
  type TenantContext,
} from '@cog/contracts';
import { toWire } from '@cog/money';
import {
  DuplicatePurchaseOrderNumber,
  createPurchaseOrder,
  renamePurchaseOrder,
  updatePurchaseOrder,
} from '../src/application/purchase-order-writes.js';
import { PurchaseOrderError } from '../src/domain/purchase-order.js';
import { PurchaseOrderNotFound, type TxLike } from '../src/application/approval-subject.js';

/**
 * Writing purchase orders, without a database.
 *
 * The isolation suite proves these routes are tenant-scoped against real
 * Postgres. This file proves the things a database cannot: that certain fields
 * **do not exist**, and that the version check is not optional.
 *
 * An absence is invisible. `write.js:55` and `write.js:157` read
 * `item.gst_amount` and `item.amount` from the request when present, and the
 * reason that cannot happen here is that no such field is declared — which is
 * exactly the kind of protection somebody removes by adding a field, in good
 * faith, without knowing it was load-bearing. So it is asserted.
 */

const TENANT = '11111111-1111-4111-8111-111111111111';
const PRINCIPAL = '1111aaaa-1111-4111-8111-aaaaaaaaaaaa';
const PO_ID = '33333333-3333-4333-8333-333333333333';
const VENDOR = '44444444-4444-4444-8444-444444444444';

const ctx = {
  tenantId: TENANT,
  principal: { kind: 'staff', id: PRINCIPAL, roles: ['director'] },
  requestId: 'test',
} as unknown as TenantContext;

/** One line: 2 units at ₹100.00, 18% GST → taxable 20000p, gst 3600p. */
const LINE = {
  description: 'Vitrified tile 600x600',
  hsnSac: '6907',
  quantityWhole: 2,
  quantityMillionths: 0,
  unitRate: '10000',
  gstRate: 1800,
};

interface Recorded {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** A tx that records every statement and answers reads from a script. */
function fakeTx(reads: Record<string, Record<string, unknown>[]> = {}): {
  tx: TxLike;
  statements: Recorded[];
} {
  const statements: Recorded[] = [];
  const tx: TxLike = {
    async query(sql: string, params: readonly unknown[] = []) {
      statements.push({ sql, params });
      for (const [needle, rows] of Object.entries(reads)) {
        if (sql.includes(needle)) return rows as never;
      }
      return [] as never;
    },
  };
  return { tx, statements };
}

/**
 * The value bound to a named column of an INSERT.
 *
 * Maps the column to its `$n` placeholder and reads that parameter, rather than
 * indexing the parameter list by the column's position. Those differ whenever a
 * column takes a literal — this statement writes `state` as `'draft'` and
 * `version` as `1` — so position-based indexing is wrong even before a column
 * is added.
 *
 * An earlier version of this test asserted `params.at(-1)`, and adding
 * `project_id` broke it. A test that reads a parameter by its ordinal is
 * asserting the column order, which is not the property under test.
 */
function paramFor(recorded: Recorded, column: string): unknown {
  const match = /\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/i.exec(recorded.sql);
  if (match === null) throw new Error('no column list in that statement');

  const columns = match[1]!.split(',').map((c) => c.trim());
  const values = match[2]!.split(',').map((v) => v.trim());
  const index = columns.indexOf(column);
  if (index === -1) throw new Error(`column ${column} is not in that statement`);

  const placeholder = /^\$(\d+)$/.exec(values[index] ?? '');
  if (placeholder === null) {
    throw new Error(`column ${column} is a literal, not a parameter`);
  }
  return recorded.params[Number(placeholder[1]) - 1];
}

const HEADER_READ = 'SELECT id, number, state, vendor_id, version';
const LINES_READ = 'SELECT description, hsn_sac';

function existingOrder(version: number, state = 'draft'): Record<string, Record<string, unknown>[]> {
  return {
    [HEADER_READ]: [{ id: PO_ID, number: 'PO-0001', state, vendor_id: VENDOR, version }],
    [LINES_READ]: [
      {
        description: LINE.description,
        hsn_sac: LINE.hsnSac,
        quantity_micros: '2000000',
        unit_rate: '10000',
        gst_rate_bp: 1800,
      },
    ],
    RETURNING: [{ version: version + 1, state, taxable: '20000', gst: '3600', gross: '23600' }],
  };
}

// ------------------------------------------------------- the absences --------

describe('a caller cannot supply a monetary figure', () => {
  it('createPurchaseOrderInput declares no gst_amount and no line amount', () => {
    const parsed = createPurchaseOrderInput.parse({
      number: 'PO-0001',
      vendorId: VENDOR,
      lines: [{ ...LINE, gst_amount: '999999', amount: '999999' }],
    });

    // Zod strips what is not declared. The unknown keys are gone, so there is
    // nothing downstream could read even if it tried.
    expect(Object.keys(parsed.lines[0]!)).not.toContain('gst_amount');
    expect(Object.keys(parsed.lines[0]!)).not.toContain('amount');
    expect(Object.keys(parsed.lines[0]!).sort()).toEqual([
      'description',
      'gstRate',
      'hsnSac',
      'quantityMillionths',
      'quantityWhole',
      'unitRate',
    ]);
  });

  it('a client-supplied gst_amount does not reach the stored figures', async () => {
    const { tx, statements } = fakeTx();
    const parsed = createPurchaseOrderInput.parse({
      number: 'PO-0001',
      vendorId: VENDOR,
      lines: [{ ...LINE, gst_amount: '1', amount: '1' }],
    });

    const result = await createPurchaseOrder(tx, ctx, parsed);

    // 18% of ₹200.00 is ₹36.00 — computed, not the ₹0.01 the caller sent.
    expect(toWire(result.gst)).toBe('3600');
    expect(toWire(result.taxable)).toBe('20000');
    expect(toWire(result.gross)).toBe('23600');

    const insert = statements.find((s) => s.sql.includes('INSERT INTO procurement.purchase_orders'));
    expect(insert?.params).not.toContain('1');
  });

  it('the lines table has no column a supplied amount could land in', async () => {
    const { tx, statements } = fakeTx();
    await createPurchaseOrder(tx, ctx, {
      number: 'PO-0001',
      vendorId: VENDOR,
      lines: [LINE],
    });

    const lineInsert = statements.find((s) =>
      s.sql.includes('INSERT INTO procurement.purchase_order_lines'),
    );
    expect(lineInsert).toBeDefined();
    // The line carries what it was ordered at, never what it totals to. A
    // total is derived from these three every time it is needed.
    expect(lineInsert!.sql).toContain('quantity_micros');
    expect(lineInsert!.sql).toContain('unit_rate');
    expect(lineInsert!.sql).toContain('gst_rate_bp');
    expect(lineInsert!.sql).not.toMatch(/\bamount\b/);
    expect(lineInsert!.sql).not.toMatch(/\btaxable\b/);
    expect(lineInsert!.sql).not.toMatch(/\bgst\b(?!_rate)/);
  });

  it('tenant_id and created_by come from the context, not the body', async () => {
    const { tx, statements } = fakeTx();
    await createPurchaseOrder(tx, ctx, { number: 'PO-0001', vendorId: VENDOR, lines: [LINE] });

    const insert = statements.find((s) =>
      s.sql.includes('INSERT INTO procurement.purchase_orders'),
    )!;
    // Located by column name rather than by position. An earlier version of
    // this test asserted `params.at(-1)`, and adding `project_id` to the insert
    // broke it — a test that reads a parameter by its ordinal is testing the
    // column order, which is not the property that matters.
    expect(paramFor(insert, 'tenant_id')).toBe(TENANT);
    expect(paramFor(insert, 'created_by')).toBe(PRINCIPAL);
  });
});

// ---------------------------------------------- concurrency is not optional --

describe('expectedVersion cannot be declined', () => {
  it('the update schema rejects a body without it', () => {
    const result = updatePurchaseOrderInput.safeParse({
      number: 'PO-0001',
      vendorId: VENDOR,
      lines: [LINE],
    });
    expect(result.success).toBe(false);
  });

  it('the rename schema rejects a body without it', () => {
    expect(renamePurchaseOrderInput.safeParse({ number: 'PO-0002' }).success).toBe(false);
  });

  it('a stale expectedVersion is refused before any write', async () => {
    const { tx, statements } = fakeTx(existingOrder(7));
    await expect(
      updatePurchaseOrder(tx, ctx, PO_ID, {
        number: 'PO-0001',
        vendorId: VENDOR,
        lines: [LINE],
        expectedVersion: 6,
      }),
    ).rejects.toThrow(PurchaseOrderError);

    expect(statements.some((s) => s.sql.includes('UPDATE'))).toBe(false);
    expect(statements.some((s) => s.sql.includes('DELETE'))).toBe(false);
  });

  it('the UPDATE also carries the version, so a concurrent write loses', async () => {
    const { tx, statements } = fakeTx(existingOrder(7));
    await updatePurchaseOrder(tx, ctx, PO_ID, {
      number: 'PO-0001',
      vendorId: VENDOR,
      lines: [LINE],
      expectedVersion: 7,
    });

    const update = statements.find((s) =>
      s.sql.includes('UPDATE procurement.purchase_orders'),
    )!;
    // Two requests can both read version 7 and both pass the domain check.
    // This is what makes the second one write nothing.
    expect(update.sql).toContain('WHERE id = $1 AND version = $8');
    expect(update.params).toContain(7);
  });

  it('losing the race is a refusal, not a silent no-op', async () => {
    const reads = existingOrder(7);
    delete reads['RETURNING'];
    const { tx } = fakeTx(reads);

    await expect(
      updatePurchaseOrder(tx, ctx, PO_ID, {
        number: 'PO-0001',
        vendorId: VENDOR,
        lines: [LINE],
        expectedVersion: 7,
      }),
    ).rejects.toThrow(/modified by someone else/);
  });
});

// ------------------------------------------------------- rename is one row --

describe('renaming touches one row', () => {
  it('writes only the purchase_orders header', async () => {
    const { tx, statements } = fakeTx(existingOrder(3));
    const result = await renamePurchaseOrder(tx, PO_ID, 'PO-0009', 3);

    expect(result.number).toBe('PO-0009');

    const writes = statements.filter((s) => /INSERT|UPDATE|DELETE/.test(s.sql));
    expect(writes).toHaveLength(1);
    expect(writes[0]!.sql).toContain('UPDATE procurement.purchase_orders');

    // The five tables the legacy cascades to, and the two it forgets. None is
    // named here, because none holds the number.
    const all = statements.map((s) => s.sql).join('\n');
    for (const table of [
      'po_items',
      'payment_requests',
      'system_payments',
      'manual_payments',
      'po_approval_history',
      'boq_items',
      'vendor_retention_ledger',
    ]) {
      expect(all).not.toContain(table);
    }
  });

  it('does not reset an approved order — a name is not a financial change', async () => {
    const reads = existingOrder(3, 'approved');
    const { tx, statements } = fakeTx(reads);
    await renamePurchaseOrder(tx, PO_ID, 'PO-0009', 3);

    // The SET clause only — `state` appears in RETURNING, which reads it back
    // rather than writing it.
    const update = statements.find((s) => s.sql.includes('UPDATE'))!;
    const setClause = update.sql.split('RETURNING')[0]!;
    expect(setClause).not.toContain('state');
  });

  it('refuses on a cancelled order', async () => {
    const { tx } = fakeTx(existingOrder(3, 'cancelled'));
    await expect(renamePurchaseOrder(tx, PO_ID, 'PO-0009', 3)).rejects.toThrow(PurchaseOrderError);
  });
});

// ------------------------------------------------------------ not-found ------

describe('an order that is not visible', () => {
  it('is not found on update', async () => {
    const { tx } = fakeTx();
    await expect(
      updatePurchaseOrder(tx, ctx, PO_ID, {
        number: 'PO-0001',
        vendorId: VENDOR,
        lines: [LINE],
        expectedVersion: 1,
      }),
    ).rejects.toThrow(PurchaseOrderNotFound);
  });

  it('is not found on rename', async () => {
    const { tx } = fakeTx();
    await expect(renamePurchaseOrder(tx, PO_ID, 'PO-0009', 1)).rejects.toThrow(
      PurchaseOrderNotFound,
    );
  });
});

// ------------------------------------------------------- duplicate number ----

describe('a reused number', () => {
  it('becomes its own error rather than a fault', async () => {
    const tx: TxLike = {
      async query() {
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      },
    };
    await expect(
      createPurchaseOrder(tx, ctx, { number: 'PO-0001', vendorId: VENDOR, lines: [LINE] }),
    ).rejects.toThrow(DuplicatePurchaseOrderNumber);
  });

  it('any other database error is not swallowed', async () => {
    const tx: TxLike = {
      async query() {
        throw Object.assign(new Error('connection terminated'), { code: '08006' });
      },
    };
    await expect(
      createPurchaseOrder(tx, ctx, { number: 'PO-0001', vendorId: VENDOR, lines: [LINE] }),
    ).rejects.toThrow(/connection terminated/);
  });
});

// ------------------------------------------------------------- no TDS --------

describe('gross is not net of TDS', () => {
  it('gross is exactly taxable + gst, and nothing subtracts a deduction', async () => {
    const { tx, statements } = fakeTx();
    const result = await createPurchaseOrder(tx, ctx, {
      number: 'PO-0001',
      vendorId: VENDOR,
      lines: [LINE],
    });

    // PO-23: `POService.ts:48` writes `subt + gstSum - tdsAmt` into po_value.
    // Here the order records what was ordered; a deduction belongs to the
    // payment that discharges it.
    expect(result.gross).toBe(result.taxable + result.gst);

    const all = statements.map((s) => s.sql).join('\n');
    expect(all).not.toMatch(/tds/i);
  });
});
