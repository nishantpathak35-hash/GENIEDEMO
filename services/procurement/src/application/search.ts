import type { TxLike } from './approval-subject.js';

/** The bar's search, this service's part — see `@cog/projects`'s `searchProjects` for the shape and the rule. */
export interface SearchHit {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly projectId: string | null;
}

const like = (q: string): string => `%${q.trim()}%`;

export async function searchOrders(tx: TxLike, q: string, limit = 5, projectId?: string): Promise<readonly SearchHit[]> {
  const rows = await tx.query<{ id: string; number: string; state: string; vendor_name: string | null; project_id: string | null }>(
    `SELECT o.id, o.number, o.state, v.name AS vendor_name, o.project_id
       FROM procurement.purchase_orders o
       LEFT JOIN procurement.vendors v ON v.tenant_id = o.tenant_id AND v.id = o.vendor_id
      WHERE (o.number ILIKE $1 OR v.name ILIKE $1)
        AND ($3::uuid IS NULL OR o.project_id = $3::uuid)
      ORDER BY (o.number ILIKE $1) DESC, o.created_at DESC
      LIMIT $2`,
    [like(q), limit, projectId ?? null],
  );
  return rows.map((r) => ({ id: r.id, title: r.number, subtitle: `${r.vendor_name ?? 'vendor unknown'} · ${r.state.replace(/_/g, ' ')}`, projectId: r.project_id }));
}

export async function searchVendors(tx: TxLike, q: string, limit = 5): Promise<readonly SearchHit[]> {
  const rows = await tx.query<{ id: string; code: string; name: string; status: string }>(
    `SELECT id, code, name, status FROM procurement.vendors
      WHERE code ILIKE $1 OR name ILIKE $1 OR gstin ILIKE $1 OR pan ILIKE $1
      ORDER BY (name ILIKE $1) DESC, name
      LIMIT $2`,
    [like(q), limit],
  );
  return rows.map((r) => ({ id: r.id, title: r.name, subtitle: `${r.code} · ${r.status}`, projectId: null }));
}
