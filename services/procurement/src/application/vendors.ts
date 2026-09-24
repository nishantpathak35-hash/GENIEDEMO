import { asConstitution, constitutionFromPan, constitutionMismatch } from '../domain/vendor-constitution.js';
import { randomUUID } from 'node:crypto';
import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './approval-subject.js';

/**
 * Vendors.
 *
 * **A replacement, not a port**, and the reasons are the same shape as every
 * other slice: the legacy's writes carry defects ADR-0014 classifies as
 * blocking, so there is no correct prior behaviour to preserve.
 *
 * | Legacy | Why it is not ported |
 * |---|---|
 * | `VendorRepository.ts:64` writes `version = COALESCE(version, 1) + 1` on a table with **no `version` column** — `db.js:73` creates `vendors` without it, migration 012's `CREATE TABLE IF NOT EXISTS` is a no-op on the existing table, and the 20-column ALTER loop at `migrations.js:388-395` does not include it. So **`updateVendor` throws every time** (VEND-01) | There is nothing to preserve. `version` exists here and the PATCH requires `expectedVersion` |
 * | `getVendorByName` (`vendors.js:42`) does `SELECT *` and returns `accountNo` and `ifsc` behind `requireAuth`, which checks only that `session.email` is truthy (VEND-02) | Bank details live in their own table and are not returned by any vendor read |
 * | `findByNameOrCode` (`VendorRepository.ts:15`) matches `legal_name = ? OR vendor_code = ?`, and `legal_name` is not unique | Identity is a surrogate uuid. A name is a label |
 * | `getVendorPOs` (`vendors.js:163`) matches with `LOWER(vendor_name) LIKE '%…%'` | Purchase orders reference `vendor_id`; nothing matches a vendor by string |
 * | Any authenticated user may create or update a vendor (`vendors.js:25`, `:33`) | Behind the tenant middleware; a vendor belongs to one tenant and RLS enforces it |
 */

const UNIQUE_VIOLATION = '23505';
const FK_VIOLATION = '23503';

export class VendorNotFound extends Error {
  override readonly name = 'VendorNotFound';
}

export class DuplicateVendorCode extends Error {
  override readonly name = 'DuplicateVendorCode';
}

export class VendorStaleWrite extends Error {
  override readonly name = 'VendorStaleWrite';
}

export class VendorInUse extends Error {
  override readonly name = 'VendorInUse';
}

export interface VendorInput {
  readonly name: string;
  readonly code: string;
  readonly gstin?: string | undefined;
  readonly pan?: string | undefined;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly address?: string | undefined;
}

export interface UpdateVendorInput extends VendorInput {
  readonly status: string;
  readonly expectedVersion: number;
}

export interface Vendor {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly status: string;
  readonly gstin: string | null;
  readonly pan: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  /** What a payment to this vendor is deducted under (CA-07); `null`, nothing. */
  readonly tdsSection: string | null;
  /** 194I: plant or building. 194J: technical or professional. Otherwise `null`. */
  readonly tdsPayeeClass: string | null;
  /** A PAN on file that is inoperative is treated as no PAN (CA-11). */
  readonly panInoperative: boolean;
  /** What the vendor is in law, as recorded (CA-07); `null` is not recorded. */
  readonly constitution: 'individual' | 'huf' | 'firm' | 'company' | 'other' | null;
  /** What the PAN's fourth character reads as — a cross-check only. */
  readonly constitutionFromPan: 'individual' | 'huf' | 'firm' | 'company' | 'other' | null;
  /** The two disagree: shown, never corrected. */
  readonly constitutionMismatch: boolean;
  readonly version: number;
}

type VendorRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  tds_section: string | null;
  tds_payee_class: string | null;
  pan_inoperative: boolean;
  constitution: string | null;
  version: number;
};

/**
 * The columns a vendor read returns.
 *
 * **Written out rather than `SELECT *`, and that is the control.** `vendors.js:42`
 * uses `SELECT *` and hands back `bank_account` and `ifsc` to any authenticated
 * caller (VEND-02). Bank details are in `vendor_bank_accounts` and cannot appear
 * here even if somebody adds a column to this table — but naming the columns
 * means a future column is opted in deliberately rather than by default.
 */
const VENDOR_COLUMNS = `id, name, code, status, gstin, pan, email, phone, address,
                        tds_section, tds_payee_class, pan_inoperative, constitution, version`;

function toVendor(row: VendorRow): Vendor {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status,
    gstin: row.gstin,
    pan: row.pan,
    email: row.email,
    phone: row.phone,
    address: row.address,
    tdsSection: row.tds_section,
    tdsPayeeClass: row.tds_payee_class,
    panInoperative: row.pan_inoperative,
    constitution: asConstitution(row.constitution),
    constitutionFromPan: constitutionFromPan(row.pan),
    constitutionMismatch: constitutionMismatch(row.constitution, row.pan),
    version: row.version,
  };
}

/**
 * How many vendors this tenant has registered.
 *
 * `services/host/src/api/today.ts` needs only `> 0` to mark the "vendors" setup
 * step done, and reading every vendor's row to answer a boolean is the shape of
 * read the list route (`GET /vendors`, paginated in `api/routes.ts`) exists to
 * replace. A count costs one aggregate; a list costs the whole table.
 */
export async function countVendors(tx: TxLike): Promise<number> {
  // No `WHERE tenant_id` — RLS applies it.
  const rows = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM procurement.vendors`);
  return rows[0]?.n ?? 0;
}

export async function getVendor(tx: TxLike, id: string): Promise<Vendor> {
  const rows = await tx.query<VendorRow>(
    `SELECT ${VENDOR_COLUMNS} FROM procurement.vendors WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new VendorNotFound(`no such vendor: ${id}`);
  return toVendor(row);
}

export async function createVendor(
  tx: TxLike,
  ctx: TenantContext,
  input: VendorInput,
): Promise<Vendor> {
  const id = randomUUID();
  try {
    await tx.query(
      `INSERT INTO procurement.vendors
         (tenant_id, id, name, code, gstin, pan, email, phone, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ctx.tenantId,
        id,
        input.name,
        input.code,
        input.gstin ?? null,
        input.pan ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.address ?? null,
      ],
    );
  } catch (error) {
    throw asDuplicateCode(error, input.code);
  }
  return getVendor(tx, id);
}

/**
 * Edit a vendor.
 *
 * `expectedVersion` is required and the caller cannot decline it — the same
 * choice as purchase orders and BOQ lines. The legacy makes it optional
 * (`VendorRepository.ts:70`), which would be a control the caller can skip if
 * the statement it guards could execute at all (VEND-01).
 */
export async function updateVendor(
  tx: TxLike,
  id: string,
  input: UpdateVendorInput,
): Promise<Vendor> {
  const current = await tx.query<{ version: number }>(
    `SELECT version FROM procurement.vendors WHERE id = $1`,
    [id],
  );
  const found = current[0];
  if (found === undefined) throw new VendorNotFound(`no such vendor: ${id}`);
  if (found.version !== input.expectedVersion) {
    throw new VendorStaleWrite(
      `this vendor was modified by someone else (expected version ${input.expectedVersion}, found ${found.version})`,
    );
  }

  let rows: VendorRow[];
  try {
    rows = await tx.query<VendorRow>(
      `UPDATE procurement.vendors
          SET name = $2, code = $3, status = $4, gstin = $5, pan = $6,
              email = $7, phone = $8, address = $9,
              version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $10
      RETURNING ${VENDOR_COLUMNS}`,
      [
        id,
        input.name,
        input.code,
        input.status,
        input.gstin ?? null,
        input.pan ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.address ?? null,
        input.expectedVersion,
      ],
    );
  } catch (error) {
    throw asDuplicateCode(error, input.code);
  }

  const row = rows[0];
  if (row === undefined) {
    throw new VendorStaleWrite(
      'this vendor was modified by someone else while the change was being saved',
    );
  }
  return toVendor(row);
}

/**
 * Remove a vendor.
 *
 * `purchase_orders.vendor_id` gains a composite FK in migration `0033`, so a
 * vendor with orders against it cannot be deleted — the FK refuses and this
 * turns that into a 409 rather than a 500. The legacy has no delete at all,
 * which is one way of avoiding the question.
 */
export async function deleteVendor(tx: TxLike, id: string): Promise<void> {
  let rows: { id: string }[];
  try {
    rows = await tx.query<{ id: string }>(
      `DELETE FROM procurement.vendors WHERE id = $1 RETURNING id`,
      [id],
    );
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === FK_VIOLATION) {
      throw new VendorInUse(
        'this vendor has purchase orders against it and cannot be deleted; set its status to inactive instead',
      );
    }
    throw error;
  }
  if (rows[0] === undefined) throw new VendorNotFound(`no such vendor: ${id}`);
}

/**
 * The names behind a set of vendor ids.
 *
 * The mirror of `projectNames` in `services/projects`, and it exists for the
 * same caller: the composition root shows a portal login which vendors it
 * represents, and it holds ids because ids are what `principal_links` stores.
 *
 * One query, not one per id. RLS scopes it, so an id belonging to another
 * tenant simply does not come back — and the caller renders the bare id rather
 * than dropping the row, because a line that disappears from an access list
 * looks like access that was revoked.
 */
export async function vendorNames(
  tx: TxLike,
  vendorIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (vendorIds.length === 0) return new Map();
  const rows = await tx.query<{ id: string; name: string }>(
    `SELECT id, name FROM procurement.vendors WHERE id = ANY($1::uuid[])`,
    [[...vendorIds]],
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Does this vendor exist in the caller's tenant? RLS answers, not a filter. */
export async function vendorExists(tx: TxLike, vendorId: string): Promise<boolean> {
  const rows = await tx.query<{ id: string }>(
    `SELECT id FROM procurement.vendors WHERE id = $1`,
    [vendorId],
  );
  return rows.length > 0;
}

/**
 * The message names the code the caller sent, which they already know, and
 * nothing about the row holding it. A unique-violation `DETAIL` line quotes the
 * conflicting value, which is how one tenant learns another's data — so the
 * database error is never surfaced.
 */
function asDuplicateCode(error: unknown, code: string): unknown {
  if ((error as { code?: unknown } | null)?.code === UNIQUE_VIOLATION) {
    return new DuplicateVendorCode(`a vendor with code ${code} already exists`);
  }
  return error;
}

export class VendorTdsProfileRefused extends Error {
  override readonly name = 'VendorTdsProfileRefused';
}

export interface VendorTdsProfileInput {
  readonly tdsSection: string | null;
  readonly tdsPayeeClass: string | null;
  readonly panInoperative: boolean;
  readonly constitution: string | null;
}

/**
 * Record what a payment to this vendor is deducted under (CA-07).
 *
 * The table's CHECKs are the rule — a kind only for rent and fees, a
 * constitution one of the five — and a refusal from one is said in words. A
 * transporter's declaration is its own record (`transporter-declarations.ts`).
 * No rate is here: rates are finance's, and provisional.
 */
export async function setVendorTdsProfile(
  tx: TxLike,
  id: string,
  input: VendorTdsProfileInput,
): Promise<Vendor> {
  let rows: VendorRow[];
  try {
    rows = await tx.query<VendorRow>(
      `UPDATE procurement.vendors
          SET tds_section = $2, tds_payee_class = $3, pan_inoperative = $4,
              constitution = $5, version = version + 1, updated_at = now()
        WHERE id = $1
      RETURNING ${VENDOR_COLUMNS}`,
      [id, input.tdsSection, input.tdsPayeeClass, input.panInoperative, input.constitution],
    );
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === '23514') {
      throw new VendorTdsProfileRefused(
        'Rent (194I) needs plant or building, fees (194J) technical or professional, and a constitution is individual, HUF, firm, company or other.',
      );
    }
    throw error;
  }
  const row = rows[0];
  if (row === undefined) throw new VendorNotFound(`no such vendor: ${id}`);
  return toVendor(row);
}
