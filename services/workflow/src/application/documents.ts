import { randomUUID } from 'node:crypto';
import type { Page, TenantContext } from '@cog/contracts';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';
import { VaultError, assertAcceptable, objectKey } from '../domain/vault.js';
import type { TxLike } from './tasks.js';

/**
 * Document metadata.
 *
 * **Every rule is in `domain/vault.ts`**, which records VAULT-01, VAULT-02 and
 * VAULT-03 and holds the content-type allowlist, the size cap and the key
 * construction. This file registers what the domain accepts and refuses what it
 * refuses.
 *
 * **Registering is not uploading.** The row records a document that the caller
 * has already written to object storage under a key this service issued — bytes
 * do not pass through here, and there is no endpoint that takes them. That is
 * the shape VAULT-02 forces: `attachments.file_data TEXT NOT NULL` means the
 * bytes are in the row, so every list query carries every payload.
 *
 * **VAULT-04: `listAllDocuments` (`attachments.js:137-140`) reassigns its
 * `session` parameter from `filters`** when that object carries `.email` or
 * `.roles` — the same argument-sniffing that makes the RPC dispatcher a
 * privilege-escalation surface. No handler here reads a principal from a body;
 * the tenant context comes from middleware and nothing else.
 */

export class DocumentNotFound extends Error {
  override readonly name = 'DocumentNotFound';
}

export interface DocumentRecord {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly objectKey: string;
  readonly uploadedBy: string;
  readonly createdAt: string;
  /** The project this document belongs to — its own, or its order's — or null (0105). */
  readonly projectId: string | null;
}

type Row = {
  id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  content_type: string;
  size_bytes: string;
  checksum: string;
  object_key: string;
  uploaded_by: string;
  created_at: string;
  project_id: string | null;
};

const COLUMNS = `id, entity_type, entity_id, file_name, content_type,
                 size_bytes::text AS size_bytes, checksum, object_key,
                 uploaded_by, created_at::text AS created_at, project_id`;

function toRecord(r: Row): DocumentRecord {
  return {
    id: r.id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    fileName: r.file_name,
    contentType: r.content_type,
    sizeBytes: Number(r.size_bytes),
    checksum: r.checksum,
    objectKey: r.object_key,
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at,
    projectId: r.project_id,
  };
}

export interface DocumentFilter {
  /** The screen's own name for `entity_type` — a vault has folders, not entities. */
  readonly folder?: string | undefined;
  /** ILIKE over the file name or the folder, same as the screen's own search box. */
  readonly q?: string | undefined;
  /** The project's twin: only documents stamped with this project. */
  readonly projectId?: string | undefined;
}

/**
 * The documents registered against one record — its `entity_type` and
 * `entity_id` — newest first, at most two hundred. RLS scopes it.
 */
export async function documentsFor(
  tx: TxLike,
  entityType: string,
  entityId: string,
): Promise<readonly DocumentRecord[]> {
  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS}
       FROM workflow.documents
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC, id DESC
      LIMIT 200`,
    [entityType, entityId],
  );
  return rows.map(toRecord);
}

export async function listDocuments(
  tx: TxLike,
  page: PageQuery,
  filter: DocumentFilter,
): Promise<Page<DocumentRecord>> {
  const params: unknown[] = [
    filter.folder === undefined || filter.folder === '' ? null : filter.folder,
    filter.q === undefined || filter.q === '' ? null : `%${filter.q}%`,
    filter.projectId === undefined || filter.projectId === '' ? null : filter.projectId,
  ];
  const where = `($1::text IS NULL OR entity_type = $1)
              AND ($2::text IS NULL OR file_name ILIKE $2 OR entity_type ILIKE $2)
              AND ($3::uuid IS NULL OR project_id = $3)`;
  // No `WHERE tenant_id` — RLS applies it.
  const k = keyset(page, 'created_at', 'id', 'timestamptz', true, params.length + 1);
  const rows = await tx.query<Row>(
    `SELECT ${COLUMNS}
       FROM workflow.documents
      WHERE ${where}
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${params.length + k.params.length + 1}`,
    [...params, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM workflow.documents WHERE ${where}`,
    params,
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.created_at, id: r.id }));
  return {
    items: paged.items.map(toRecord),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

export interface DocumentSummary {
  readonly total: number;
  readonly byFolder: readonly { readonly folder: string; readonly count: number }[];
}

/** Over the whole vault (or the whole of one project's), ignoring the folder and search — the folder stats name every folder, not just the ones on this page. */
export async function documentSummary(tx: TxLike, projectId?: string): Promise<DocumentSummary> {
  const rows = await tx.query<{ folder: string; count: number }>(
    `SELECT entity_type AS folder, count(*)::int AS count
       FROM workflow.documents
      WHERE ($1::uuid IS NULL OR project_id = $1)
      GROUP BY entity_type
      ORDER BY count(*) DESC`,
    [projectId === undefined || projectId === '' ? null : projectId],
  );
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return { total, byFolder: rows.map((r) => ({ folder: r.folder, count: r.count })) };
}

export interface RegisterDocumentInputLike {
  readonly entityType: string;
  readonly entityId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  /** Stamped by the caller that knows — the composition root — never inferred here. */
  readonly projectId?: string | null | undefined;
}

/**
 * Register a document.
 *
 * `assertAcceptable` decides whether the content type and size are allowed —
 * an allowlist, because the legacy accepts anything and serves it from a public
 * directory, which turns an uploaded `.html` into a stored cross-site scripting
 * vector on the product's own origin.
 *
 * The object key is built by `objectKey()` from the tenant id and a fresh
 * document id. **No caller supplies it**, and the table's CHECK constraint
 * re-derives the same string — object storage is outside Postgres, so no RLS
 * policy protects it and the prefix is the only boundary there is.
 */
export async function registerDocument(
  tx: TxLike,
  ctx: TenantContext,
  input: RegisterDocumentInputLike,
): Promise<DocumentRecord> {
  assertAcceptable(input.contentType, input.sizeBytes, input.fileName);

  const id = randomUUID();
  const key = objectKey({ tenantId: ctx.tenantId, id });

  await tx.query(
    `INSERT INTO workflow.documents
       (tenant_id, id, entity_type, entity_id, file_name, content_type,
        size_bytes, checksum, object_key, uploaded_by, project_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      ctx.tenantId,
      id,
      input.entityType,
      input.entityId,
      input.fileName,
      input.contentType,
      input.sizeBytes,
      input.checksum,
      key,
      ctx.principal.id,
      // a document on a project is that project's; anything else is what the caller said
      input.projectId ?? (input.entityType === 'project' ? input.entityId : null),
    ],
  );

  const rows = await tx.query<Row>(`SELECT ${COLUMNS} FROM workflow.documents WHERE id = $1`, [id]);
  return toRecord(rows[0]!);
}

export async function deleteDocument(tx: TxLike, id: string): Promise<void> {
  const rows = await tx.query<{ id: string }>(
    `DELETE FROM workflow.documents WHERE id = $1 RETURNING id`,
    [id],
  );
  if (rows[0] === undefined) throw new DocumentNotFound(`no such document: ${id}`);
}

export { VaultError };
