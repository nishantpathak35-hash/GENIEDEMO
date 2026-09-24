import type { TenantId } from '@cog/contracts';

/**
 * The document vault.
 *
 * **A replacement.** The legacy stores documents three incompatible ways and
 * every one of them is a finding:
 *
 *   **VAULT-01** `public/uploads/` is a **publicly servable directory** and it
 *   holds signed client contracts. Anything written there is reachable by URL
 *   with no authentication at all.
 *
 *   **VAULT-02** The `attachments` table has `file_data TEXT NOT NULL` — file
 *   bytes base64-encoded into a row. Every query that touches the table drags
 *   the payload with it, backups carry it, and the audit trail of a document is
 *   the document.
 *
 *   **VAULT-03** Uploads go through Cloudinary *and* `fs.writeFile`, so where a
 *   given document lives depends on which code path created it.
 *
 * The replacement: S3-compatible storage in `ap-south-1`, one key prefix per
 * tenant, and time-limited signed URLs. Bytes never enter Postgres, and no
 * object is reachable without a signature.
 */

export class VaultError extends Error {
  override readonly name = 'VaultError';
}

export interface DocumentRef {
  readonly tenantId: TenantId;
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  /** sha256 of the bytes, so a re-upload is detectable and an archive verifiable. */
  readonly checksum: string;
}

/**
 * Object keys are tenant-prefixed, always.
 *
 * The prefix is the boundary a bucket policy can be written against, and it is
 * what makes "this tenant's data" a thing that exists in object storage rather
 * than only in the database. Without it, one wrong key is a cross-tenant read
 * that RLS cannot see — object storage is outside Postgres, so the policies
 * that protect everything else do not apply here at all.
 */
export function objectKey(ref: Pick<DocumentRef, 'tenantId' | 'id'>): string {
  assertSafeSegment(ref.tenantId, 'tenant id');
  assertSafeSegment(ref.id, 'document id');
  return `tenants/${ref.tenantId}/documents/${ref.id}`;
}

/**
 * Reject anything that could escape its prefix.
 *
 * `..`, a slash, or a backslash in an id would put the object outside the
 * tenant's namespace — which is the object-storage equivalent of a missing
 * `WHERE tenant_id`.
 */
function assertSafeSegment(value: string, what: string): void {
  if (value.trim() === '') throw new VaultError(`${what} must not be empty`);
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new VaultError(`${what} contains characters that could escape the tenant prefix`);
  }
  if (value === '.' || value === '..') throw new VaultError(`${what} must not be a path segment`);
}

/** Maximum lifetime of a signed URL. */
export const MAX_SIGNED_URL_TTL_SECONDS = 15 * 60;

export interface SignedUrlRequest {
  readonly ref: DocumentRef;
  readonly ttlSeconds: number;
  /** The tenant the CALLER is scoped to, from the tenant context. */
  readonly callerTenantId: TenantId;
}

/**
 * Validate a signed-URL request before anything is signed.
 *
 * The tenant check is here rather than left to the storage layer because a
 * signed URL, once issued, is a bearer credential: it works for anyone who has
 * it, for as long as it lives, with no further authorisation. Issuing one for
 * another tenant's object cannot be undone by a later policy.
 */
export function assertMaySign(request: SignedUrlRequest): void {
  if (request.ref.tenantId !== request.callerTenantId) {
    throw new VaultError('refusing to sign a URL for another tenant object');
  }
  if (!Number.isInteger(request.ttlSeconds) || request.ttlSeconds <= 0) {
    throw new VaultError('a signed URL needs a positive whole-second lifetime');
  }
  if (request.ttlSeconds > MAX_SIGNED_URL_TTL_SECONDS) {
    // A long-lived signed URL is an unauthenticated permanent link that has
    // been emailed, logged and cached by the time anyone notices.
    throw new VaultError(
      `a signed URL may not live longer than ${MAX_SIGNED_URL_TTL_SECONDS} seconds`,
    );
  }
}

/**
 * Content types accepted into the vault.
 *
 * An allowlist rather than a denylist: the legacy accepts anything and serves
 * it from a public directory, so an uploaded `.html` becomes a page hosted on
 * the product's own origin — which is a stored cross-site scripting vector
 * against every user of that origin.
 */
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

export function assertAcceptable(
  contentType: string,
  sizeBytes: number,
  declaredName: string,
): void {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new VaultError(`content type ${contentType} is not accepted`);
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new VaultError('a document needs a positive size');
  }
  if (sizeBytes > MAX_DOCUMENT_BYTES) {
    throw new VaultError('document exceeds the maximum size');
  }
  // The stored name is metadata only — it never becomes part of the object key
  // — but it is echoed in a Content-Disposition header, so a newline in it
  // would let a caller inject a header.
  if (/[\r\n]/.test(declaredName)) {
    throw new VaultError('a file name must not contain a line break');
  }
}
