import { describe, expect, it } from 'vitest';
import {
  addBoqLinesInput,
  boqLineInput,
  updateBoqLineInput,
  type TenantContext,
} from '@cog/contracts';
import { toWire } from '@cog/money';
import {
  BoqLineNotFound,
  BoqStaleWrite,
  DuplicateBoqLine,
  ProjectNotFound,
  type TxLike,
  addBoqLines,
  deleteBoqLine,
  updateBoqLine,
} from '../src/application/boq-writes.js';
import { BoqError } from '../src/domain/boq.js';

/**
 * BOQ writes, without a database.
 *
 * The isolation suite proves the routes are tenant-scoped against real
 * Postgres. This file proves what a database cannot: that the fields the legacy
 * trusts **do not exist**, and that an unknown cost stays unknown.
 *
 * `boq.js:114` reads `realPayload.amount` when the caller supplies one, and
 * `boq.js:110` turns a missing `cost_rate` into 80% of the rate. Neither can
 * happen here because neither field is declared — which is exactly the kind of
 * protection somebody removes by adding a field, in good faith, not knowing it
 * was load-bearing.
 */

const TENANT = '11111111-1111-4111-8111-111111111111';
const PROJECT = '55555555-5555-4555-8555-555555555555';
const ITEM = '66666666-6666-4666-8666-666666666666';

const ctx = {
  tenantId: TENANT,
  principal: { kind: 'staff', id: 'p1', roles: ['director'] },
  requestId: 'test',
} as unknown as TenantContext;

/** 12.375 sqm at ₹845.00 → 12.375 × 84500 = 1,045,687.5p → 1045688p rounded. */
const LINE = {
  section: 'Civil',
  itemNo: 1,
  description: 'Vitrified tile 600x600',
  uom: 'sqm',
  quantityWhole: 12,
  quantityMillionths: 375_000,
  rate: '84500',
};

interface Recorded {
  readonly sql: string;
  readonly params: readonly unknown[];
}

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

const PROJECT_READ = 'SELECT id FROM projects.projects';
// the guard's read: every BOQ write first asks the project's state and refuses one no longer worked
const STATE_READ = 'SELECT code, state FROM projects.projects';
const VERSION_READ = 'SELECT version FROM projects.boq_items';
const withProject = (extra: Record<string, Record<string, unknown>[]> = {}, state = 'in_progress') => ({
  [PROJECT_READ]: [{ id: PROJECT }],
  [STATE_READ]: [{ code: 'P-1', state }],
  ...extra,
});

// -------------------------------------------------------- the absences ------

describe('a caller cannot assert a line amount or invent a cost', () => {
  it('boqLineInput declares no amount and no marginPct', () => {
    const parsed = boqLineInput.parse({ ...LINE, amount: '999999', margin_pct: 20 });
    expect(Object.keys(parsed).sort()).toEqual([
      'description',
      'itemNo',
      'quantityMillionths',
      'quantityWhole',
      'rate',
      'section',
      'uom',
    ]);
  });

  it('a supplied amount does not reach the computed one', async () => {
    const { tx } = fakeTx(withProject());
    const parsed = addBoqLinesInput.parse({ lines: [{ ...LINE, amount: '1' }] });
    const [written] = await addBoqLines(tx, ctx, PROJECT, parsed.lines);

    // 12.375 × ₹845.00 = ₹10,456.875 → 1045688 paise, rounded once.
    expect(toWire(written!.amount)).toBe('1045688');
  });

  it('an omitted cost rate stays null and is never derived from the rate', async () => {
    const { tx, statements } = fakeTx(withProject());
    const [written] = await addBoqLines(tx, ctx, PROJECT, [LINE]);

    // `boq.js:110` would make this 80% of 84500 = 67600. Unknown is unknown.
    expect(written!.costRate).toBeNull();
    const insert = statements.find((s) => s.sql.includes('INSERT INTO projects.boq_items'))!;
    expect(insert.params).toContain(null);
    expect(insert.params).not.toContain(67600n);
  });

  it('a supplied cost rate is stored as given', async () => {
    const { tx } = fakeTx(withProject());
    const [written] = await addBoqLines(tx, ctx, PROJECT, [{ ...LINE, costRate: '60000' }]);
    expect(written!.costRate).not.toBeNull();
    expect(toWire(written!.costRate!)).toBe('60000');
  });

  it('the insert names no amount column for a total to land in', async () => {
    const { tx, statements } = fakeTx(withProject());
    await addBoqLines(tx, ctx, PROJECT, [LINE]);

    const insert = statements.find((s) => s.sql.includes('INSERT INTO projects.boq_items'))!;
    expect(insert.sql).toContain('quantity_micros');
    expect(insert.sql).toContain('rate');
    expect(insert.sql).not.toMatch(/\bamount\b/);
    expect(insert.sql).not.toMatch(/\bmargin_pct\b/);
  });

  it('tenant_id comes from the context', async () => {
    const { tx, statements } = fakeTx(withProject());
    await addBoqLines(tx, ctx, PROJECT, [LINE]);
    const insert = statements.find((s) => s.sql.includes('INSERT INTO projects.boq_items'))!;
    expect(insert.params[0]).toBe(TENANT);
  });
});

// -------------------------------------------------- quantity is not a float --

describe('quantity travels as whole units and millionths', () => {
  it('12.375 sqm becomes 12_375_000, not 12.375', async () => {
    const { tx, statements } = fakeTx(withProject());
    await addBoqLines(tx, ctx, PROJECT, [LINE]);
    const insert = statements.find((s) => s.sql.includes('INSERT INTO projects.boq_items'))!;
    expect(insert.params).toContain(12_375_000n);
  });

  it('the schema refuses a fractional whole-unit count', () => {
    expect(boqLineInput.safeParse({ ...LINE, quantityWhole: 12.375 }).success).toBe(false);
  });

  it('the schema refuses millionths at or beyond one whole unit', () => {
    expect(boqLineInput.safeParse({ ...LINE, quantityMillionths: 1_000_000 }).success).toBe(false);
  });
});

// ------------------------------------------------------------ atomicity ------

describe('a set of lines is written as a set', () => {
  it('refuses two lines claiming the same section and item number', async () => {
    const { tx, statements } = fakeTx(withProject());
    await expect(
      addBoqLines(tx, ctx, PROJECT, [LINE, { ...LINE, description: 'Different' }]),
    ).rejects.toThrow(BoqError);

    // Caught before the database, so nothing was written at all.
    expect(statements.some((s) => s.sql.includes('INSERT'))).toBe(false);
  });

  it('turns a unique violation into a conflict, not a fault', async () => {
    const tx: TxLike = {
      async query(sql: string) {
        if (sql.includes('SELECT id FROM projects.projects')) return [{ id: PROJECT }] as never;
        if (sql.includes(STATE_READ)) return [{ code: 'P-1', state: 'in_progress' }] as never;
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      },
    };
    await expect(addBoqLines(tx, ctx, PROJECT, [LINE])).rejects.toThrow(DuplicateBoqLine);
  });

  it('does not swallow any other database error', async () => {
    const tx: TxLike = {
      async query(sql: string) {
        if (sql.includes('SELECT id FROM projects.projects')) return [{ id: PROJECT }] as never;
        if (sql.includes(STATE_READ)) return [{ code: 'P-1', state: 'in_progress' }] as never;
        throw Object.assign(new Error('connection terminated'), { code: '08006' });
      },
    };
    await expect(addBoqLines(tx, ctx, PROJECT, [LINE])).rejects.toThrow(/connection terminated/);
  });
});

// ------------------------------------------------------- absent things -------

describe('an invisible project or line', () => {
  it('is not found on add', async () => {
    const { tx } = fakeTx();
    await expect(addBoqLines(tx, ctx, PROJECT, [LINE])).rejects.toThrow(ProjectNotFound);
  });

  it('is not found on update', async () => {
    const { tx } = fakeTx(withProject());
    await expect(
      updateBoqLine(tx, PROJECT, ITEM, { ...LINE, expectedVersion: 1 }),
    ).rejects.toThrow(BoqLineNotFound);
  });

  it('is not found on delete, rather than reporting success', async () => {
    const { tx } = fakeTx(withProject());
    // `deleteBOQItem` (boq.js:339) returns { ok: true } whatever happened.
    await expect(deleteBoqLine(tx, PROJECT, ITEM)).rejects.toThrow(BoqLineNotFound);
  });

  it('deletes only within the named project', async () => {
    const { tx, statements } = fakeTx(withProject({ DELETE: [{ id: ITEM }] }));
    await deleteBoqLine(tx, PROJECT, ITEM);
    const del = statements.find((s) => s.sql.includes('DELETE'))!;
    expect(del.sql).toContain('WHERE id = $1 AND project_id = $2');
  });
});

// ------------------------------------------------------------- recompute -----

describe('editing recomputes the amount', () => {
  it('a changed quantity changes the amount, and no caller supplies it', async () => {
    const { tx } = fakeTx(
      withProject({ [VERSION_READ]: [{ version: 3 }], RETURNING: [{ version: 4 }] }),
    );
    const line = await updateBoqLine(tx, PROJECT, ITEM, {
      ...LINE,
      quantityWhole: 2,
      quantityMillionths: 0,
      expectedVersion: 3,
    });
    // 2 × ₹845.00 = ₹1,690.00
    expect(toWire(line.amount)).toBe('169000');
    expect(line.version).toBe(4);
  });
});

// ------------------------------------------------------- BOQ-04, now fixed --

describe('a BOQ line edit takes a lock', () => {
  it('the schema requires expectedVersion', () => {
    expect(updateBoqLineInput.safeParse(LINE).success).toBe(false);
    expect(updateBoqLineInput.safeParse({ ...LINE, expectedVersion: 1 }).success).toBe(true);
  });

  it('refuses a stale version before writing anything', async () => {
    const { tx, statements } = fakeTx(withProject({ [VERSION_READ]: [{ version: 7 }] }));
    await expect(
      updateBoqLine(tx, PROJECT, ITEM, { ...LINE, expectedVersion: 6 }),
    ).rejects.toThrow(BoqStaleWrite);
    expect(statements.some((s) => s.sql.includes('UPDATE'))).toBe(false);
  });

  it('a stale version is distinguishable from a missing line', async () => {
    const { tx } = fakeTx(withProject({ [VERSION_READ]: [{ version: 7 }] }));
    // Not BoqLineNotFound: answering "not found" to a concurrent edit is a lie
    // the caller acts on by re-creating the line.
    await expect(
      updateBoqLine(tx, PROJECT, ITEM, { ...LINE, expectedVersion: 6 }),
    ).rejects.not.toThrow(BoqLineNotFound);
  });

  it('carries the version on the UPDATE, so a concurrent write loses', async () => {
    const { tx, statements } = fakeTx(
      withProject({ [VERSION_READ]: [{ version: 7 }], RETURNING: [{ version: 8 }] }),
    );
    await updateBoqLine(tx, PROJECT, ITEM, { ...LINE, expectedVersion: 7 });
    const update = statements.find((st) => st.sql.includes('UPDATE projects.boq_items'))!;
    expect(update.sql).toContain('AND version = $10');
    expect(update.params).toContain(7);
  });

  it('losing the race is a refusal, not a silent no-op', async () => {
    const { tx } = fakeTx(withProject({ [VERSION_READ]: [{ version: 7 }] }));
    await expect(
      updateBoqLine(tx, PROJECT, ITEM, { ...LINE, expectedVersion: 7 }),
    ).rejects.toThrow(/modified by someone else/);
  });

  it('a new line starts at version 1', async () => {
    const { tx } = fakeTx(withProject());
    const [written] = await addBoqLines(tx, ctx, PROJECT, [LINE]);
    expect(written!.version).toBe(1);
  });
});

describe('a project no longer worked refuses every BOQ write', () => {
  it('adding a line on a closed project is refused before any insert', async () => {
    const { tx, statements } = fakeTx(withProject({}, 'closed'));
    await expect(addBoqLines(tx, ctx, PROJECT, [LINE])).rejects.toThrow(/closed and final/);
    expect(statements.some((s) => s.sql.includes('INSERT INTO projects.boq_items'))).toBe(false);
  });
});
