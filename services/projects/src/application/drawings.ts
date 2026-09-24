import { randomUUID } from 'node:crypto';
import type { TenantContext } from '@cog/contracts';
import type { TxLike } from './boq-writes.js';

/**
 * GFC drawings.
 *
 * **A drawing points at a document in the vault, or at nothing.** There is no
 * URL column, which is what makes GFC-01 and GFC-02 unrepresentable rather than
 * merely discouraged:
 *
 *   * `DesignView.js:117` invents
 *     `https://luxeworx-vault.s3.amazonaws.com/gfc/<no>.pdf` when no file was
 *     chosen — one tenant's bucket, and a link to a file that may not exist.
 *   * `DesignView.js:87-100` base64-encodes a chosen file into that same field.
 *
 * **Superseding is inserting the next revision, not editing the last one.**
 * `createGFCDrawing` (`change-orders.js:146`) updates every row matching
 * `LOWER(project) = LOWER(?)` to `'Superseded'` — a project matched by name
 * (GFC-03) — and then inserts. Here the project is an id and a partial unique
 * index allows exactly one active revision per drawing number.
 */

const UNIQUE_VIOLATION = '23505';
const FK_VIOLATION = '23503';

export class DrawingRefused extends Error {
  override readonly name = 'DrawingRefused';
}

export class DrawingNotFound extends Error {
  override readonly name = 'DrawingNotFound';
}

export interface Drawing {
  readonly id: string;
  readonly projectId: string;
  readonly drawingNo: string;
  readonly title: string;
  readonly category: string;
  readonly revision: string;
  readonly status: string;
  readonly documentId: string | null;
  readonly uploadedBy: string;
}

type Row = {
  id: string;
  project_id: string;
  drawing_no: string;
  title: string;
  category: string;
  revision: string;
  status: string;
  document_id: string | null;
  uploaded_by: string;
};

const COLUMNS = `id, project_id, drawing_no, title, category, revision, status,
                 document_id, uploaded_by`;

function toDrawing(r: Row): Drawing {
  return {
    id: r.id,
    projectId: r.project_id,
    drawingNo: r.drawing_no,
    title: r.title,
    category: r.category,
    revision: r.revision,
    status: r.status,
    documentId: r.document_id,
    uploadedBy: r.uploaded_by,
  };
}

export async function listDrawings(tx: TxLike, projectId: string): Promise<Drawing[]> {
  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS} FROM projects.gfc_drawings
      WHERE project_id = $1 ORDER BY drawing_no, revision`,
    [projectId],
  );
  return rows.map(toDrawing);
}

export interface IssueDrawingInput {
  readonly projectId: string;
  readonly drawingNo: string;
  readonly title: string;
  readonly category?: string | undefined;
  readonly revision: string;
  readonly documentId?: string | undefined;
}

/**
 * Issue a revision.
 *
 * Any existing active revision of the same drawing number is superseded first,
 * **in the same transaction** — the middleware opened one, so the supersede and
 * the insert land together or neither does. The legacy issues both statements
 * loose (`change-orders.js:146`, `:152`), so a failure between them leaves two
 * active revisions or none.
 */
export async function issueDrawing(
  tx: TxLike,
  ctx: TenantContext,
  input: IssueDrawingInput,
): Promise<Drawing> {
  if (input.documentId !== undefined) {
    // The vault is another service's table, so there is no foreign key. Checked
    // here instead, and a bad id is refused rather than stored dangling.
    const docs = await tx.query<{ id: string }>(
      `SELECT id FROM workflow.documents WHERE id = $1`,
      [input.documentId],
    );
    if (docs[0] === undefined) {
      throw new DrawingRefused('that document does not exist in this organisation');
    }
  }

  await tx.query(
    `UPDATE projects.gfc_drawings
        SET status = 'superseded'
      WHERE project_id = $1 AND drawing_no = $2 AND status = 'active'`,
    [input.projectId, input.drawingNo],
  );

  const id = randomUUID();
  try {
    await tx.query(
      `INSERT INTO projects.gfc_drawings
         (tenant_id, id, project_id, drawing_no, title, category, revision,
          document_id, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ctx.tenantId,
        id,
        input.projectId,
        input.drawingNo,
        input.title,
        input.category ?? 'architectural',
        input.revision,
        input.documentId ?? null,
        ctx.principal.id,
      ],
    );
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === UNIQUE_VIOLATION) {
      throw new DrawingRefused(
        `revision ${input.revision} of ${input.drawingNo} already exists on this project`,
      );
    }
    if (code === FK_VIOLATION) {
      throw new DrawingRefused('that project does not exist in this organisation');
    }
    throw error;
  }

  const rows = await tx.query<Row>(`SELECT ${COLUMNS} FROM projects.gfc_drawings WHERE id = $1`, [
    id,
  ]);
  return toDrawing(rows[0]!);
}

/** Withdraw a drawing. Not a delete: an issued drawing was on site. */
export async function withdrawDrawing(tx: TxLike, id: string): Promise<Drawing> {
  const rows = await tx.query<Row>(
    `UPDATE projects.gfc_drawings SET status = 'withdrawn'
      WHERE id = $1 AND status <> 'withdrawn'
    RETURNING ${COLUMNS}`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new DrawingNotFound(`no such active drawing: ${id}`);
  return toDrawing(row);
}
