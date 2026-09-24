-- 0016 — The document vault.
--
-- Forward-only. Never edit this file.
--
-- Prefix `0016` is `workflow`'s allocated block in `M6.md`.
--
-- **The table `services/workflow/src/domain/vault.ts` was written against.**
-- That module already records VAULT-01, VAULT-02 and VAULT-03 and already
-- decides the shape: tenant-prefixed object keys, an accepted content-type
-- allowlist, a size cap, and signed URLs that may not outlive 15 minutes.
-- Nothing below re-decides any of it.
--
-- **Bytes never enter Postgres.** `attachments.file_data TEXT NOT NULL` holds
-- base64-encoded file content, so every query that touches the table drags the
-- payload with it and every backup carries it (VAULT-02). Here the row holds a
-- key and the object lives in S3-compatible storage.
--
-- **Nothing is written under `public/`.** `attachments.js:75-83` does
-- `fs.writeFile` into `public/uploads/<entityType>/<entityId>/` and stores the
-- path — and anything under `public/` is served by URL with no authentication
-- at all (VAULT-01). CLAUDE.md names that folder as holding signed contracts.
--
-- **VAULT-04 (new): `listAllDocuments` reassigns its own arguments.**
-- `attachments.js:137-140` overwrites the `session` parameter with `filters`
-- when the object carries `.email` or `.roles` — the same argument-sniffing that
-- makes the RPC dispatcher a privilege-escalation surface. There is no
-- equivalent here because the tenant context comes from middleware and no
-- handler reads a session from a body.

CREATE TABLE workflow.documents (
  tenant_id    uuid NOT NULL REFERENCES tenancy.tenants (id) ON DELETE CASCADE,
  id           uuid NOT NULL,

  -- What the document is about. Free text plus an id, deliberately not a
  -- foreign key: a document may hang off a purchase order, a project or a
  -- vendor, and a polymorphic FK is not a thing. Nothing is authorised from it.
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,

  -- Metadata only. The stored name never becomes part of the object key —
  -- `objectKey()` builds that from the tenant id and the document id, so a
  -- filename cannot escape its prefix.
  file_name    text NOT NULL,
  content_type text NOT NULL,
  size_bytes   bigint NOT NULL,
  -- sha256 of the bytes, so a re-upload is detectable and an archive verifiable.
  checksum     text NOT NULL,

  -- Where the object actually is. Written by the application from
  -- `objectKey()`; never supplied by a caller.
  object_key   text NOT NULL,

  uploaded_by  uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT documents_pkey PRIMARY KEY (tenant_id, id),
  CONSTRAINT documents_uploaded_by_fkey
    FOREIGN KEY (tenant_id, uploaded_by)
    REFERENCES identity.principals (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT documents_object_key_key UNIQUE (tenant_id, object_key),
  CONSTRAINT documents_size_check CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  CONSTRAINT documents_checksum_check CHECK (checksum ~ '^[0-9a-f]{64}$'),
  -- The key must sit under this tenant's prefix. `objectKey()` guarantees it in
  -- the application; this guarantees it in the table, because object storage is
  -- outside Postgres and no RLS policy reaches it.
  CONSTRAINT documents_key_prefix_check CHECK (
    object_key = 'tenants/' || tenant_id::text || '/documents/' || id::text
  )
);

CREATE INDEX documents_entity_idx ON workflow.documents (tenant_id, entity_type, entity_id);

ALTER TABLE workflow.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow.documents FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow.documents AS RESTRICTIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_access ON workflow.documents AS PERMISSIVE FOR ALL
  USING      (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON workflow.documents FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON workflow.documents TO app_runtime;

COMMENT ON TABLE workflow.documents IS
  'Document metadata. The bytes live in S3-compatible storage under a '
  'tenant-prefixed key; nothing is base64-encoded into a row (VAULT-02) and '
  'nothing is written under public/ (VAULT-01). No UPDATE grant: a document is '
  'replaced by uploading a new one, so the checksum of what was stored stays '
  'true.';

COMMENT ON CONSTRAINT documents_key_prefix_check ON workflow.documents IS
  'The object key must sit under this tenant prefix. Object storage is outside '
  'Postgres, so RLS does not protect it — the prefix is the boundary a bucket '
  'policy can be written against, and this keeps the two in step.';
