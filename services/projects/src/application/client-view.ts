import type { TxLike } from './boq-writes.js';

/**
 * What a client may see of its OWN project.
 *
 * Every function takes a `projectId` and filters on it, for the same reason the
 * vendor equivalent does: RLS scopes to the tenant, and the client and the
 * staff running the job are in the same tenant, so tenant isolation contributes
 * nothing to this control. M1/D3: intra-tenant authorisation is a separate
 * control.
 *
 * **What a client must never reach, per TOPOLOGY: vendor pricing, internal
 * margin, any other project.** So:
 *
 *   - `clientProjectSummary` returns the contract value and the state. It does
 *     NOT return committed spend, the BOQ cost rate, the BOQ margin, or
 *     anything from `procurement`.
 *   - `clientVariations` returns the variation's own cost impact — which is
 *     the number the client is being asked to sign — and nothing about what it
 *     costs the contractor to do.
 *   - `clientDrawingCount` is a count of issued revisions, not money.
 *
 * A test asserts the response bodies contain no `cost`, `margin` or `committed`
 * key, because "we did not select that column" is a property of one query and
 * the guarantee has to be a property of the response.
 */

export interface ClientProject {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  /** The client as the firm recorded it — the organisation the portal login belongs to. */
  readonly clientName: string;
  readonly state: string;
  readonly contractValue: string | null;
}

export async function clientProjectSummary(
  tx: TxLike,
  projectId: string,
): Promise<ClientProject | null> {
  const rows = await tx.query<{
    id: string;
    code: string;
    name: string;
    client_name: string;
    state: string;
    original_value: string | null;
  }>(
    `SELECT id, code, name, client_name, state, original_value::text AS original_value
       FROM projects.projects
      WHERE id = $1`,
    [projectId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    clientName: row.client_name,
    state: row.state,
    contractValue: row.original_value,
  };
}

export interface ClientVariation {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly description: string;
  readonly costImpact: string;
  readonly state: string;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly version: number;
}

/**
 * The variations a client can see, which is those that have left draft.
 *
 * A draft variation is the contractor's working note. Showing it to the client
 * turns every internal revision into a negotiation.
 */
export async function clientVariations(
  tx: TxLike,
  projectId: string,
): Promise<ClientVariation[]> {
  const rows = await tx.query<{
    id: string;
    number: string;
    title: string;
    description: string;
    cost_impact: string;
    state: string;
    decided_by: string | null;
    decided_at: string | null;
    version: number;
  }>(
    `SELECT id, number, title, description, cost_impact::text AS cost_impact,
            state, decided_by, decided_at::text AS decided_at, version
       FROM projects.change_orders
      WHERE project_id = $1 AND state <> 'draft'
      ORDER BY number`,
    [projectId],
  );
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    description: r.description,
    costImpact: r.cost_impact,
    state: r.state,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    version: r.version,
  }));
}

/**
 * How many revisions are currently issued for the project.
 *
 * Projects owns `gfc_drawings`, so projects counts them. The daily reports and
 * the joint measurements a client also wants to see belong to `siteops`, and
 * this module does NOT reach into that schema to get them — a cross-service
 * query is the same boundary violation as a cross-service import, and
 * `eslint.config.mjs` cannot see one written in SQL. The host composes the two
 * halves (M1/D5).
 */
export async function clientDrawingCount(tx: TxLike, projectId: string): Promise<number> {
  const rows = await tx.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM projects.gfc_drawings
      WHERE project_id = $1 AND status = 'active'`,
    [projectId],
  );
  const row = rows[0];
  if (row === undefined) return 0;
  const value = BigInt(row.n);
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
}
