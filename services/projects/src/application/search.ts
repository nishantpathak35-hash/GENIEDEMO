import type { TxLike } from './boq-writes.js';

/**
 * The bar's search, this service's part: a few records by the words a person
 * types — a code, a name, a client — never a filter and never a page. Each
 * hit carries what the bar prints and the id the app links to; the host
 * composes the kinds into one answer and the app draws the href.
 */
export interface SearchHit {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  /** The project the record belongs to, when it belongs to one — the scope filter. */
  readonly projectId: string | null;
}

const like = (q: string): string => `%${q.trim()}%`;

export async function searchProjects(tx: TxLike, q: string, limit = 5): Promise<readonly SearchHit[]> {
  const rows = await tx.query<{ id: string; code: string; name: string; client_name: string }>(
    `SELECT id, code, name, client_name FROM projects.projects
      WHERE code ILIKE $1 OR name ILIKE $1 OR client_name ILIKE $1
      ORDER BY (code ILIKE $1) DESC, code
      LIMIT $2`,
    [like(q), limit],
  );
  return rows.map((r) => ({ id: r.id, title: `${r.code} · ${r.name}`, subtitle: r.client_name, projectId: r.id }));
}

export async function searchLeads(tx: TxLike, q: string, limit = 5): Promise<readonly SearchHit[]> {
  // a lead is known by its client; the contact is the second name a person types
  const rows = await tx.query<{ id: string; client_name: string; contact_name: string; stage: string }>(
    `SELECT id, client_name, contact_name, stage FROM projects.leads
      WHERE client_name ILIKE $1 OR contact_name ILIKE $1
      ORDER BY (client_name ILIKE $1) DESC, client_name
      LIMIT $2`,
    [like(q), limit],
  );
  return rows.map((r) => ({ id: r.id, title: r.client_name, subtitle: `${r.contact_name === '' ? 'no contact named' : r.contact_name} · ${r.stage.replace(/_/g, ' ')}`, projectId: null }));
}
