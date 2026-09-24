# The legacy settings tree, tab by tab

> **This document covers part of the port.** The complete file-by-file
> reconciliation — every module in BOTH legacy trees, and where each went —
> is [`docs/PORT-LEDGER.md`](../PORT-LEDGER.md). Where the two disagree, the ledger was
> built by walking the file system and wins.


`_legacy-updated/components/views/settings/` holds **eighteen files** — sixteen
tabs, one modal and one hook. This records what happened to each one and why,
because "we did not port it" and "we forgot it" look identical a year later.

Checked against what this product already had before any of them were read. The
rule applied throughout: **a second surface for a question that already has an
answer is worse than no surface**, because it is the one somebody edits when the
enforced answer lives elsewhere.

---

## Built

| Legacy tab | Here | What changed |
|---|---|---|
| `SettingsNumberSeriesTab.js` | **Settings → Numbering** | Per-module series with the Indian financial year. **The counter is not writable** — see below. |
| `SettingsTradePackagesTab.js` | **Settings → Trades** | The trade catalogue, shipped empty. No seeded margins, no preferred vendor. |
| `SettingsCompanyTab.js`, `CompanySettings.js` | **Settings → Company** | GSTIN, PAN, CIN, address, bank, document footer. Closes the hardcoded-GSTIN defect. |
| `OperationalSettings.js` | **Settings → Company**, second panel | PO payment terms and the CRM staleness rule. Neither is seeded. |
| `SettingsAuditTab.js` | **Settings → Audit** | Read-only over `workflow.audit_events`, which is append-only by privilege. |
| `SettingsUsersTab.js`, `StaffAccessSettings.js` | **Settings → People** | Staff, their tenant-wide roles, and the projects they are on. No account creation. |
| `SettingsClientPortalTab.js` | **Settings → Client access** | What each client login may see, over the same `principal_links` rows the portal enforces. |
| — | **Settings → Modules** | New. Not a legacy tab: per-tenant feature enablement, which the legacy has no concept of. |

## Skipped, because the question already has an answer here

| Legacy tab | Already answered by | Why it is not ported |
|---|---|---|
| `ModuleAccessSettings.js` | **Settings → Roles & permissions** (`identity.role_grants`, migration 0024) | It is a role × module matrix, which is exactly `role_grants`. Its name invites confusion with the per-tenant module switch, which is a **different question** — "may this person use X" versus "is X turned on here at all". Two mechanisms, two screens, neither duplicated. |
| `SettingsPermissionsTab.js` | **Settings → Roles & permissions** | The same matrix again, read-only. The legacy has the permission grid twice. |
| `SettingsTDSTab.js` | **Settings → Tax rates** | Already built, already effective-dated, and every rate ships `provisional` until a CA signs it off (ADR-0014, CA-01..CA-08). The legacy tab's rate input is `step="0.1"`, a float percentage; ours are integer basis points. |
| `SettingsApprovalWorkflowTab.js`, `SettingsWorkflowEditorModal.js` | **Settings → Approval chains** | Built in an earlier milestone, including the value bands. |
| `SettingsFinanceTab.js` | — | A wrapper that renders the TDS and numbering tabs as children, plus the legacy correction below. There is nothing in it of its own. |
| `SettingsProjectsTab.js` | **Projects** | Project creation and editing is a first-class screen, not a settings tab. Its merge control is discussed below. |
| `useSettingsForm.js` | — | A React hook, not a tab. |

## Not ported, deliberately

Each of these is a control that exists in the legacy app and is **absent here on
purpose**. Building any of them would be a regression dressed as parity.

### The editable counter — `SettingsNumberSeriesTab.js`

The tab renders `current_number` as an editable field with no constraint behind
it. Setting it back re-issues numbers already printed on purchase orders that
went to vendors. Here the counter moves in one direction, inside the transaction
that writes the order; no request shape carries it and
`saveSeriesFormat` names `last_number` nowhere.

### `_syncWithExistingPOs`

Reconstructs the counter by pulling trailing digits off existing purchase-order
numbers with a regex. Numbers have been allocated from the counter row since M1,
so there is nothing to reconstruct — and a regex over document identifiers is a
way to introduce a duplicate rather than to avoid one.

### The default margins and named vendors — `migrations.js:789`

Ten trade packages seeded with a margin each (18%, 22%, 25%) and a named
preferred vendor beside every one: UltraTech, Asian Paints, Daikin, Kohler.
Those are somebody's demo data. A margin is a commercial position, not a fact
about masonry, and a seeded one lands inside the rate of every item costed under
that trade without anybody agreeing to it. **The trade catalogue ships empty.**

`preferred_vendor` is also stored as the vendor's **name**. Name-keying is the
defect this rebuild exists to remove.

### `ChangeMe123!` — `SettingsUsersTab.js:42`

A default password chosen by the software, with a fixed role set beside it
(`:47`). A credential the product picks is a credential nobody rotates. Access
here arrives through an invitation whose link is shown once and stored only as a
hash.

### `Client@` — `SettingsClientPortalTab.js:51`

A client password generated **in the browser** from a fixed prefix. A credential
minted client-side with a predictable prefix is two failures in one line.

### The legacy role remap — `StaffAccessSettings.js:16`

Maps `procurement` → `proc` and `maker` → `proc` on load, with no reverse
mapping. A role saved through that screen is not the role that was read.

### The legacy correction — `SettingsFinanceTab.js`, `SettingsSystemTab.js`

Both carry a form that edits a purchase order's paid amount directly, by PO
number, with a free-text reason. An untracked write to a money field from a
settings screen is the opposite of every control on the money path here.

### `mergeProjects` — `SettingsProjectsTab.js`, `projects.js:311`

Keyed by project **name string** (`WHERE project IN (?, ?)` over names), sums
financials as JavaScript floats into a running total, and rewrites the target's
figures with no record of what they were. The confirm dialog says the action
cannot be undone, which is true and is the problem. Project merging is not
ported. Lead merging is, in a form that records what the losing record held.

### Cache clearing — `SettingsSystemTab.js`

`clearAllCaches` is an operational button on a tenant's settings screen. There is
no such cache here, and if there were, clearing it would belong to `apps/admin`
behind a platform principal.

### The hardcoded audit filter — `SettingsAuditTab.js:40-72`

Eighteen action types and six departments as literal options in the component. A
filter whose options are a written-down list silently omits every action added
since somebody last edited it — which on an audit screen means a row that exists
and is never looked at.

### The logo upload — `CompanySettings.js:10`, `SettingsCompanyTab.js:46`

A 2 MB image stored base64 inside a settings row, so every read of the
organisation's own details carries an image. There is no asset store here yet,
so there is no field rather than a field that works badly.

---

## What is still open

**Creating a client portal login.** The Client access screen manages what an
existing login may see, and cannot create one: an invitation carries no
principal kind today, so minting a `client` principal is a change to the
credential path rather than a button on a settings screen. Listed here rather
than left as an absence somebody rediscovers.
