import { randomUUID } from 'node:crypto';
import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './project-team.js';

/**
 * The trades this organisation works in.
 *
 * A catalogue, not a hierarchy. `estimation_items.trade` and
 * `boq_items.section` are free text and stay free text — this list is what the
 * pickers offer, so that "Electrical", "Electricals" and "ELECTRICAL" stop
 * being three trades, without a migration that would have to guess which of the
 * three every existing row meant.
 */

export class TradePackageError extends Error {
  override readonly name = 'TradePackageError';
}

export interface TradePackage {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  /** Basis points, or null when this organisation has not said. */
  readonly defaultMarginBp: number | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

const COLUMNS = `id, code, name, description, default_margin_bp, sort_order, is_active`;

type Row = {
  id: string;
  code: string;
  name: string;
  description: string;
  default_margin_bp: number | null;
  sort_order: number;
  is_active: boolean;
};

function toPackage(row: Row): TradePackage {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    defaultMarginBp: row.default_margin_bp,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

/**
 * The catalogue.
 *
 * `activeOnly` is what a picker asks for and the settings screen does not: a
 * retired trade has to stay visible to whoever retired it, or the only way to
 * bring one back is to know it was there.
 */
export async function listTradePackages(
  tx: TxLike,
  options: { readonly activeOnly?: boolean } = {},
): Promise<readonly TradePackage[]> {
  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS} FROM projects.trade_packages
      WHERE ($1::boolean IS NOT TRUE OR is_active)
      ORDER BY sort_order, name`,
    [options.activeOnly ?? false],
  );
  return rows.map(toPackage);
}

export interface TradePackageInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly defaultMarginBp?: number | null | undefined;
  readonly sortOrder?: number | undefined;
}

/**
 * Add one.
 *
 * The code is uppercased here rather than validated as uppercase, because
 * somebody typing `elec` means `ELEC` and refusing them teaches nothing. Once
 * uppercased the unique constraint does the rest — `elec` and `ELEC` cannot
 * become two packages that group the same work separately.
 */
export async function addTradePackage(
  tx: TxLike,
  ctx: TenantContext,
  input: TradePackageInput,
): Promise<string> {
  const id = randomUUID();
  try {
    await tx.query(
      `INSERT INTO projects.trade_packages
         (tenant_id, id, code, name, description, default_margin_bp, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        ctx.tenantId,
        id,
        input.code.trim().toUpperCase(),
        input.name.trim(),
        input.description?.trim() ?? '',
        input.defaultMarginBp ?? null,
        input.sortOrder ?? 0,
      ],
    );
  } catch (error) {
    throw asWriteError(error);
  }
  return id;
}

export async function updateTradePackage(
  tx: TxLike,
  id: string,
  input: TradePackageInput & { readonly isActive: boolean },
): Promise<boolean> {
  try {
    const rows = await tx.query<{ id: string }>(
      `UPDATE projects.trade_packages
          SET code              = $2,
              name              = $3,
              description       = $4,
              default_margin_bp = $5,
              sort_order        = $6,
              is_active         = $7,
              updated_at        = now()
        WHERE id = $1
       RETURNING id`,
      [
        id,
        input.code.trim().toUpperCase(),
        input.name.trim(),
        input.description?.trim() ?? '',
        input.defaultMarginBp ?? null,
        input.sortOrder ?? 0,
        input.isActive,
      ],
    );
    return rows.length > 0;
  } catch (error) {
    throw asWriteError(error);
  }
}

/**
 * There is no delete.
 *
 * An estimation line raised under a trade records what it was costed as, and
 * the trade is stored on it as text — so deleting the package would not orphan
 * anything, it would quietly make the history unexplainable. `isActive` takes
 * it out of the pickers, which is what "we do not do that any more" means.
 */

function asWriteError(error: unknown): Error {
  const code = (error as { code?: string }).code;
  const constraint = (error as { constraint?: string }).constraint;
  if (code === '23505') {
    return new TradePackageError(
      constraint === 'trade_packages_code_key'
        ? 'A trade with that code already exists.'
        : 'A trade with that name already exists.',
    );
  }
  if (code === '23514') {
    if (constraint === 'trade_packages_margin_check') {
      return new TradePackageError('A margin has to be between 0% and 100%.');
    }
    if (constraint === 'trade_packages_code_check') {
      return new TradePackageError(
        'A code is up to 16 characters, letters and digits, no spaces.',
      );
    }
    return new TradePackageError('That trade was not saved.');
  }
  return error as Error;
}
