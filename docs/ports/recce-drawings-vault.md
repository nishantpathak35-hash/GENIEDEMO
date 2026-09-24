# Port note — recce, drawings, document vault

`SiteRecceView.js` (1064 lines), `DesignView.js` (646 lines) and
`DocumentVaultView.js` (199 lines).

Legacy sites, under `../../../_legacy/atelier-current/`:

| File | What it is |
|---|---|
| `app/lib/api/recce.js` | five functions, 40–169, table created inline at `:14-37` |
| `app/lib/api/change-orders.js:122-186` | GFC drawings, co-resident with variations |
| `app/lib/api/attachments.js` | the vault, 45–176 |

---

## The vault domain was already written

`services/workflow/src/domain/vault.ts` existed before this slice and had
already decided everything: tenant-prefixed object keys, an accepted
content-type allowlist, a 50 MB cap, and signed URLs that may not outlive 15
minutes. It also already records **VAULT-01**, **VAULT-02** and **VAULT-03**.

Migration `0016` is the table that module was written against, and
`application/documents.ts` registers what it accepts. Nothing here re-decides
any of it. That is the second time this run that a domain module turned out to
have settled the design already — the first was `change-order.ts`.

---

## Defects, with status

| Ref | Site | Defect | Status |
|---|---|---|---|
| **VAULT-01** | `attachments.js:75-83` | Uploads fall back to `fs.writeFile` into `public/uploads/<entityType>/<entityId>/` and the path is stored and returned. **Anything under `public/` is served by URL with no authentication**, and CLAUDE.md names that folder as holding signed contracts | **LIVE** |
| **VAULT-02** | `db.js:148` | `attachments.file_data TEXT NOT NULL` — base64 bytes in a row. Every query that touches the table drags the payload, and every backup carries it | **LIVE** |
| **VAULT-04** *(new)* | `attachments.js:137-140` | `listAllDocuments` **reassigns its own `session` parameter** from `filters` when that object carries `.email` or `.roles` — the same argument-sniffing that makes the RPC dispatcher a privilege-escalation surface | **LIVE** |
| **GFC-01** *(new)* | `DesignView.js:117` | With no file chosen, the drawing URL falls back to `https://luxeworx-vault.s3.amazonaws.com/gfc/<no>.pdf` — a hardcoded bucket belonging to one tenant, pointing at a file that may not exist. A drawing record that reads as issued and links to nothing | **LIVE** |
| **GFC-02** *(new)* | `DesignView.js:87-100` | A chosen file is read with `readAsDataURL` and the **entire base64 payload** is stored in `gfc_drawings.file_url TEXT`. VAULT-02 again, in a second table | **LIVE** |
| **GFC-03** *(new)* | `change-orders.js:146` | Superseding matches `LOWER(project) = LOWER(?)`, so the revision chain is keyed on a project name | **LIVE** |
| **RECCE-01** *(new)* | `recce.js:14-37` | The `site_recce` table is created by an inline `ensureTable()` at the top of every recce function and never recorded in `schema_migrations` — the same shape as TASK-01 | **LIVE** |

Columns checked clean in all three modules. Together with tasks and CRM, that is
five of the ten modules scouted where the missing-column pattern does not
appear.

### VAULT-01 is the one to act on

A signed client contract written to `public/uploads/` is retrievable by anyone
who can guess or is given the URL — no session, no tenant check, nothing. It is
not an access-control bug in the sense of a wrong role; there is no access
control on that path at all, because the path is static file serving.

Nothing in the replacement can produce it: **no endpoint accepts file bytes.**
The row records a document already written to object storage under a key this
service issued, and a test asserts that no column named `file_data` or
`file_path` exists on the table.

### The object key is the boundary, and it is checked twice

Object storage is outside Postgres, so no RLS policy reaches it. `objectKey()`
builds `tenants/<tenantId>/documents/<id>` and refuses any segment that could
escape the prefix; the table then re-derives the same string in a CHECK
constraint. A test inserts a foreign-prefixed key directly as `app_runtime` and
asserts the constraint refuses it.

---

## What replaces it

**Recce** — `siteops.site_recces`, in the migration system, with areas as
integer millionths and a CHECK that carpet area cannot exceed built-up area. A
survey saying otherwise is a transcription error, and refusing it costs less
than finding it inside an estimate. The survey form's free shape stays `jsonb`:
modelling it as columns would be guessing at a form a site engineer changes.

**Drawings** — `projects.gfc_drawings`, referencing a vault document **or
nothing**. There is no URL column, so GFC-01 and GFC-02 are unrepresentable
rather than discouraged, and "no file attached yet" becomes an honest state the
legacy cannot express. One active revision per drawing number per project,
enforced by a partial unique index, and superseding happens in the same
transaction as the insert — the legacy issues both statements loose, so a
failure between them leaves two active revisions or none.

Withdrawing is not deleting. An issued drawing was on site.

**Vault** — `workflow.documents`, metadata only, no `UPDATE` grant: a document
is replaced by registering a new one, so the checksum of what was stored stays
true.

---

## Needs a person

**Nothing new.** The role questions here are the same PO-13 as everywhere else:
who may withdraw a drawing, who may delete a document.

One thing worth raising rather than deciding: **whether tenant #1 has files
under `public/uploads/` today, and what is in them.** That is knowable only from
their deployment, it is not in this repository, and if signed contracts are
there then they have been publicly retrievable for as long as the folder has
existed. It belongs on the M2.5 reconciliation list.

---

## The commits

One for the tables, one for the endpoints. No faithful-port commits: porting
`uploadAttachment` means porting a write into a publicly served directory, and
porting `createGFCDrawing` means porting a fabricated S3 URL.
