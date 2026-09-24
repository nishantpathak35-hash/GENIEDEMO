import type { TxLike } from './boq-writes.js';

/**
 * What a tax invoice needs to know about the project it bills: its code and
 * the client's name, as they are when the invoice is raised. Finance copies
 * both onto the invoice, because an issued invoice says what it said.
 */
export interface InvoiceProject {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly clientName: string;
}

export async function projectForInvoice(tx: TxLike, projectId: string): Promise<InvoiceProject | null> {
  const rows = await tx.query<{ id: string; code: string; name: string; client_name: string }>(
    `SELECT id, code, name, client_name FROM projects.projects WHERE id = $1`,
    [projectId],
  );
  const row = rows[0];
  return row === undefined ? null : { id: row.id, code: row.code, name: row.name, clientName: row.client_name };
}
