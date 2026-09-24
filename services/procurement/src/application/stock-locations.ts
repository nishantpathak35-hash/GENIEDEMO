import type { TenantContext } from '@cog/contracts';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import type { TxLike } from './approval-subject.js';

/**
 * The register of stores and site stores (0091). A name per tenant; retired,
 * never deleted, because movements still name the store they happened in.
 */

export class StockLocationNotFound extends Error {
  override readonly name = 'StockLocationNotFound';
}

export class DuplicateStockLocation extends Error {
  override readonly name = 'DuplicateStockLocation';
}

export interface StockLocation {
  readonly id: string;
  readonly name: string;
  readonly kind: 'store' | 'site';
  readonly projectId: string | null;
  readonly retired: boolean;
}

/** By name; retired locations only when asked for. */
export async function listStockLocations(
  tx: TxLike,
  page: PageQuery,
  filter: { readonly includeRetired: boolean },
): Promise<{ items: StockLocation[]; nextCursor: string | null; prevCursor: string | null; count: number }> {
  const k = keyset(page, 'name', 'id', 'text', false, 2);
  const rows = await tx.query<{
    id: string;
    name: string;
    kind: 'store' | 'site';
    project_id: string | null;
    retired: boolean;
  }>(
    `SELECT id, name, kind, project_id, retired_at IS NOT NULL AS retired
       FROM procurement.stock_locations
      WHERE ($1::boolean OR retired_at IS NULL)
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${2 + k.params.length}`,
    [filter.includeRetired, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM procurement.stock_locations WHERE ($1::boolean OR retired_at IS NULL)`,
    [filter.includeRetired],
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.name, id: r.id }));
  return {
    items: paged.items.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      projectId: r.project_id,
      retired: r.retired,
    })),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

export async function createStockLocation(
  tx: TxLike,
  ctx: TenantContext,
  input: { readonly name: string; readonly kind: 'store' | 'site'; readonly projectId?: string | undefined },
): Promise<{ id: string }> {
  try {
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO procurement.stock_locations (tenant_id, name, kind, project_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [ctx.tenantId, input.name, input.kind, input.projectId ?? null, ctx.principal.id],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('insert returned no row');
    return row;
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === '23505') throw new DuplicateStockLocation('A location with that name is already registered.');
    if (code === '23503') throw new StockLocationNotFound('No such project.');
    throw error;
  }
}

/** Retire a location. One that is already retired, or not this tenant's, is not found. */
export async function retireStockLocation(tx: TxLike, locationId: string): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `UPDATE procurement.stock_locations SET retired_at = now()
      WHERE id = $1 AND retired_at IS NULL
      RETURNING id`,
    [locationId],
  );
  if (rows[0] === undefined) throw new StockLocationNotFound('No such active location.');
}
