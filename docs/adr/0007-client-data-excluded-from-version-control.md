# ADR-0007: Client data and secrets excluded from version control

- **Status:** Accepted · re-drafted 2026-09-03 (originally decided 2026-08-16)
- **Deciders:** Product owner

## Context

The legacy working tree contains live production data belonging to a real
customer and their clients:

- `Sheet.csv`, `master.json` — operational exports
- `backend/database.sqlite` (+ `-wal`, `-shm`) — the live database, containing
  `bank_account`, `ifsc`, `gstin`, `pan` columns
- `public/uploads/Contract/PRJ-2001/` — a signed client contract
- `Weekly Progress Report Dentons Link legal.pptx` — a named client's deliverable
- `.env.local` — secrets

Git history is permanent. Anything committed once is recoverable forever, even
after deletion, and rewriting history across a distributed team is not a fix
that scales.

## Decision

**No client data and no secrets enter any repository, ever.**

Enforced structurally, not by discipline:

- Live data lives at `_private/` in the workspace root. The workspace root is
  **not** a git repository and neither are the group folders, so nothing under
  `_private/` is inside any repo's working tree.
- Every repository's `.gitignore` blocks `*.sqlite*`, `.env*` (except
  `.env.example`), and build output — written **before** `git init`, so the
  first commit is already clean.
- Test fixtures use synthetic tenants. Never a production export.

## Consequences

- Repos can be made public, shared with contractors, or handed to a buyer during
  diligence without a history audit.
- Developers need a documented path to obtain a working local dataset — seeded,
  synthetic, and generated, not copied from production.
- Restoring the legacy app for reference requires pointing it at `_private/`
  explicitly. That friction is the point.

## Alternatives considered

**Commit it and add `.gitignore` later.** Rejected: deletion does not remove it
from history.

**Encrypted secrets in the repo (git-crypt, SOPS).** Reasonable for
configuration, not for a customer's live database and signed contracts. Not
adopted for v1.
