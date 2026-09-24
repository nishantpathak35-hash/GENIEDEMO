# Port ledger — every legacy module, and where it went

**Purpose: make deleting the legacy trees a decision rather than a loss.**

`_legacy/atelier-current/` is pinned at tag `legacy-frozen-2026-09-03` and has a
repo. **`_legacy-updated/` has none — no repo, and the workspace root is
deliberately not one either.** When that tree goes, it is gone: there is no
history, no remote, and no way to check a citation against it afterwards. Four
documents each covered part of the port and none was ever compared against a
full file listing. This is that comparison.

It is also a QA pass. Walking every file asking *where did this go* is how a
missed port surfaces, and it can only be done while both trees still exist. It
found one — see [Gaps](#gaps--what-has-no-home).

## What counts as a row

**One row per source file that carries behaviour.** Config
(`tailwind.config.js`, `postcss.config.js`, `next.config.mjs`,
`eslint.config.mjs`, `jsconfig.json`, `tsconfig.json`, `next-env.d.ts`) is out.
`_legacy-updated/scripts/archive/` gets one row for all 39 files, not 39 rows —
it is superseded by the live tree beside it, and 39 rows of noise would hide the
gaps this document exists to find.

Verified 2026-09-06 against `find` output from both trees, not against the four
documents. Where a document and the file system disagreed, the file system won.

## The two trees are not the same tree

`_legacy-updated/` is not a superset. **Three modules exist only in the OLDER
tree**, and they are ones we ported:

| Only in `_legacy/atelier-current/` | Why it matters |
|---|---|
| `app/lib/api/takeoff.js` + 7 `components/views/takeoff/*` | Ported to `projects.takeoff_sheets` / `takeoff_items`. The updated tree deleted the whole feature. |
| `app/lib/api/tasks.js` + `components/views/TasksView.js`, `components/ui/AssignTaskModal.js` | Ported to `workflow.tasks`. Also deleted upstream. |
| `app/lib/api/recce.js` + `components/views/SiteRecceView.js` | Ported to `siteops.site_recces`. Also deleted upstream. |
| `components/views/DesignView.js` | Superseded by `DesignBuildView.js` in the updated tree. |
| `scripts/audit_end_user_flows.js`, `cleanup_dummy_vendors_and_schedules.js`, `export-zip.js`, `test_design_and_multi_po.js` | Scripts, not product. |

**So `_legacy/atelier-current/` cannot be deleted on the grounds that
`_legacy-updated/` supersedes it.** For takeoff, tasks and recce it is the only
surviving specification. Delete it and the evidence for three ported features
goes with it.

Everything else in the old tree has a same-named counterpart in the updated one,
usually repaired. Rows below are for `_legacy-updated/` unless stated.

---

## `app/lib/api/` — where the behaviour lives

| Legacy file | Ported to | Status |
|---|---|---|
| `boq.js` | `POST/PATCH/DELETE /api/v1/projects/:projectId/boq`, `POST /api/v1/purchase-orders/from-boq` | **Ported.** `importEstimationItemsToBOQ` and `createBOQSchedule` deliberately not — blocked on PO-16, and there is no schedules table. |
| `change-orders.js` | `projects.change_orders`, `projects.gfc_drawings` | **Ported.** CO-04 closed by a `WHERE` state check. |
| `client-billing.js` | — | **CA-gated, built empty.** `pnl: null` adopted as a decision about what we will not display (OPEN-DECISIONS, PNL). |
| `core.js` | `identity.role_grants`, `workflow.audit` | **Ported in pieces.** `DEFAULT_FEATURE_PERMISSIONS` and `VALID_ROLE_KEYS` are evidence for PO-13b, quoted in OPEN-DECISIONS. |
| `crm.js` | `projects.leads` + activities | **Ported.** CRM-01 (the probability ladder) never derived — stored as entered. |
| `dashboard.js` | `GET /api/v1/rollups/projects` | **Partly.** The rollup is ported; the cashflow and margin figures come from the payment path and are CA-gated. DASH-01's fallbacks deliberately omitted. |
| `design-build.js` | eleven modules under `/api/v1/design-build` | **Ported, all eleven**, each behind module access, each with a thin/solid verdict in `ports/design-build-workflows.md`. `getFounderExceptionsSummary:1823` not ported — it concatenates `cost_impact` into SQL. |
| `dpr.js` | `siteops` daily reports | **Ported.** |
| `estimation.js` | `projects.estimation_items` | **Ported.** |
| `inventory.js` | `procurement` stock movements, append-only ledger | **Ported.** INV-03 (weighted average) adopted; `issueStockToProject`'s missing conditional update recorded as a defect, not inherited. |
| `locks.js` | `If-Match` / version columns across services | **Answered under another name.** 130 lines of an application-level lock table; optimistic concurrency here is a version column checked in the `WHERE`, which is the same control without a second table to leak. |
| `number-series.js` | `procurement.number_series`, `allocateNumber` | **Ported.** The editable counter and `_syncWithExistingPOs` deliberately not. |
| `payments.js` + `payments/{read,write,approve,other,index}.js` | — | **CA-gated (M2.5).** The money path is not built until a CA-verified rule spec exists (ADR-0014). |
| `presence.js` | — | **Not ported, deliberately.** 90 lines of who-is-looking-at-what. A presence feature needs a transport we do not have and answers no question this product was bought to answer. |
| `projects.js` | `projects.projects`, `GET /api/v1/rollups/projects` | **Ported.** Name-string keying replaced by real ids. `mergeProjects` NOT ported — see Gaps. |
| `purchase-orders.js` + `{read,write,approve,other,index}.js` | `procurement` purchase orders | **Ported.** `deletePOFull` deferred to the M6 admin path. Client-supplied `gst_amount` not carried over. |
| `rate-contracts.js` | **nothing** | **GAP — see below.** |
| `reports.js` | — | **CA-gated.** |
| `settings.js` | Settings screens, `identity.role_grants` | **Ported in pieces.** `:30` is evidence for PO-13b. |
| `settings-admin.js` | `identity.role_catalog` | **Ported as a table.** `:10-14` is why the role list is a table and not an enum. |
| `shared.js` | `packages/service-kit` | **Answered under another name.** |
| `site-controls.js` | `siteops` imprest and JMR | **Ported.** `releaseRetentionAmount` not — a release is a payment, CA-gated. |
| `statutory-tally.js` | `tally-connector` + staged XML (ADR-0004) | **Redesigned, not ported.** The legacy reads HTTP 200 as success without reading the body, so no voucher has ever reached Tally. |
| `tds.js` | — | **CA-gated.** |
| `token.js` | `services/identity`, WorkOS adapter (ADR-0005) | **Redesigned.** The identity provider owns credentials; this service owns the mapping. |
| `trades.js` | Settings → Trades, `procurement.trade_packages` | **Ported.** Ships EMPTY — the ten seeded margins with named vendors are not ported. |
| `vendors.js` | `/api/v1/purchase-orders/vendors` | **Ported.** `getVendorByName` not — `SELECT *` returns bank details to any authenticated user. |
| `work.js` | `workflow.tasks`, `projects.project_members`, `workflow.record_comments`, `workflow.notifications` | **Ported.** `listProjectTeam`/`getProjectTeamAdmin`/`setProjectMember` → `GET/POST /api/v1/projects/:projectId/team` and `DELETE …/team/:principalId` (`api/team.ts`, migration `0063`). `getRecordWork`/`addWorkComment` → `GET/POST /api/v1/records/:entityType/:entityId/comments`. `markWorkNotificationRead` → `POST /api/v1/notifications/:id/read`, with `GET /api/v1/notifications` beside it (`api/comments.ts`, migration `0064`). Screens: `/projects/[projectId]/team` and `/notifications`. Only `getWorkspaceBootstrap` and `listWorkspaceRecords` are deliberately not ported — the one-call bootstrap is broken up so each screen reads what it shows. |
| `workflow.js` | `services/workflow` chains and stages | **Ported.** APPR-02 (self-approval) fixed rather than carried. |
| `wpr.js` | `siteops` weekly reports | **Ported.** |
| `attachments.js` | `workflow.documents` (migration `0016`), `GET/POST/DELETE /api/v1/documents`, the `/documents` screen | **Redesigned.** The capability exists; the legacy's two mechanisms do not. `uploadAttachment` writes bytes into `public/uploads/`, a publicly servable folder holding signed contracts — here the row is metadata and the object lives in S3-compatible storage under a tenant prefix the table enforces. `listAllDocuments` reassigns its session parameter by argument-sniffing. |
| `auth.js` | `services/identity` | **Redesigned.** The hardcoded invite domain at `:253` is per-tenant config. |

## `app/lib/` — calculation and infrastructure

| Legacy file | Ported to | Status |
|---|---|---|
| `estimationCalculations.js` | `services/projects/src/domain/rate-analysis.ts` | **Ported verbatim first, then fixed** (two-commit protocol). EST-01 mid-formula rounding is the defect row. |
| `paymentCalculations.js` | — | **CA-gated.** |
| `paymentAI.js` | — | **Not ported.** Heuristic invoice matching against a money path that does not exist. |
| `poCalculations.js` | `packages/money` + the PO write path | **Answered under another name.** One export, `calculatePOFinancials`, doing GST/TDS on floats. Every figure it computes is now server-side and exact; `mulRatio` with a named boundary replaces it. |
| `po-line-identity.js` | — | **Not applicable.** `canonicalPOLineId` normalises SQLite's `"1.0"` text ids; ours are uuids. `groupPOReceipts`'s rule — an ambiguous receipt blocks the edit rather than being silently omitted — has no analogue **because our goods receipts do not reference a PO line at all**. If that link is ever added, this rule comes with it. |
| `poEligibility.js` | `procurement` PO state rules | **Ported.** |
| `poMilestones.js` | `procurement` PO milestones | **Ported.** |
| `poPdfGenerator.js` | Typst (ADR-0013) | **Redesigned.** |
| `tdsChallan281.js` | — | **CA-gated, and a defect report.** `:54` fabricates a default TAN into generated 26Q content. Never a source of a statutory constant. |
| `module-access.js` | `tenancy.tenant_modules`, `moduleGate` | **Answered under another name.** 46 lines: `assertModuleAccess` and `filterModulePayload`, keyed on RPC method names. Ours gates at the composition root by route prefix and answers 404 rather than 403. |
| `settings-catalog.js` | `identity.role_catalog`, `MODULES` in contracts | **Ported as tables.** `:1-5` is the evidence for PO-13a and PO-13b. |
| `migrations.js` | per-service forward-only SQL | **Redesigned.** `:789`'s seeded trade margins deliberately not ported. |
| `db.js` | `packages/service-kit` `withTenant` | **Redesigned.** The legacy falls back to a local SQLite file and mints an in-memory JWT secret — the shape `chooseVerify` refuses. |
| `db-auth.js` | `identity.resolve_principal` | **Redesigned** as SECURITY DEFINER bootstrap. |
| `schemas.js` | `packages/contracts` (Zod v4) | **Ported.** |
| `utils.js` | `packages/money`, service-kit | **Absorbed.** |
| `broadcast.js` | — | **Not ported.** Server-sent events for a single-tenant app. |
| `config.js` | env + `services/tenancy` | **Redesigned.** A hardcoded GSTIN/PAN is tenant config. |
| `email.js` | — | **Not built.** No mail transport yet; the invite URL is returned once in the response instead. |
| `project-context.js` | `TenantContext` + explicit route params | **Redesigned.** ADR-0006: a context a caller can pass in is not a context. |
| `workspace.js` | — | **Not ported.** Workspace-switching for one tenant; tenancy replaces the concept. |
| `rpc-signatures.js` | — | **Not ported, and must not be.** It is the type table for the RPC dispatcher below. |
| `api.js` | — | **Barrel re-export.** No behaviour. |

## `src/modules/` — the TypeScript service layer

| Legacy file | Ported to | Status |
|---|---|---|
| `core/services/ApprovalEngine.ts`, `ApprovalWorkflowService.ts` | `services/workflow` chains, stages, `approve()` | **Ported.** `:267-305` is the evidence for PO-13c. Value bands built, unseeded — PO-13d. |
| `core/repositories/ApprovalWorkflowRepository.ts` | `workflow.approval_stages` | **Ported.** `:71-84` is the evidence that no ceiling column ever existed. |
| `core/services/AuditService.ts`, `core/repositories/AuditRepository.ts`, `core/types/Audit.ts` | `workflow.audit` | **Ported.** The hardcoded filter list is not. |
| `core/services/AuthService.ts` | `services/identity` | **Redesigned.** |
| `core/services/NumberSeriesService.ts`, `core/repositories/NumberSeriesRepository.ts` | `procurement.number_series` | **Ported.** `peekNextNumber` became `previewNumber`, which says in its name that it is not a reservation (PO-24). |
| `core/services/SettingsService.ts`, `core/repositories/SettingsRepository.ts`, `core/types/Settings.ts` | `tenancy` settings | **Ported.** The hardcoded GSTIN/PAN is not. |
| `core/services/GlobalConfigService.ts`, `core/repositories/GlobalConfigRepository.ts` | `tenancy` per-tenant config | **Ported**, per-tenant rather than global. |
| `core/services/TDSService.ts`, `core/repositories/TDSRepository.ts` | — | **CA-gated.** |
| `operations/services/DPRService.ts`, `WPRService.ts` + repositories | `siteops` | **Ported.** |
| `operations/utils/dprCalculations.js`, `dprFormatter.js`, `wprFormatter.js` | `siteops` domain + report rendering | **Ported.** |
| `payments/**`, `purchase-orders/**`, `vendors/**` (service + repository + types) | `services/procurement` | **Ported** for PO and vendors; payments CA-gated. |

## `components/views/` — the screens

| Legacy screen | Ported to | Status |
|---|---|---|
| `ProjectsView.js` + `projects/{NewProjectModal,ProjectDetails,ProjectsSidebar}.js` | `/projects` | **Ported.** |
| `BoqView.js` | `/projects/[projectId]/boq` | **Ported.** `:258`'s invented 78% cost rate is not — PO-15. |
| `EstimationView.js` | `/projects/[projectId]/estimate` | **Ported.** Its duplicate formula at `:121-134` is not; the server computes. |
| `TakeoffView.js` + 6 `takeoff/*` *(old tree only)* | `/projects/[projectId]/takeoff` | **Ported.** `takeoff-constants.js`'s 54 preset rates not — no stated basis. |
| `POsView.js` + 8 `purchase-orders/*` | `/purchase-orders` | **Ported.** `POPrintModal.js` superseded by Typst. |
| `VendorsView.js` + 4 `vendors/*` modals | `/vendors` | **Ported.** |
| `vendors/RateContractsTab.js` | **nothing** | **GAP — see below.** |
| `PaymentsView.js` + 10 `payments/*` | — | **CA-gated.** `:437-438` is evidence for PO-13e. |
| `ApprovalsView.js` | `/approvals` | **Ported.** |
| `ChangeOrdersView.js` | `/projects/[projectId]/variations` | **Ported.** |
| `SiteControlsView.js` | `/projects/[projectId]/site` | **Ported.** |
| `SiteRecceView.js` *(old tree only)* | `/projects/[projectId]/recce` | **Ported.** |
| `InventoryView.js` | `/inventory` | **Ported.** |
| `DashboardView.js` + 6 `dashboard/*` | `/` | **Partly.** `DashboardEditFinancialsModal.js` NOT ported — it edits a project's money directly with no audit. |
| `CrmView.js` + `crm/{TableView,KanbanView,LeadDetailDrawer}.js` | `/leads` | **Ported.** |
| `crm/{CrmMergeModal,CrmHandoverModal,CrmFollowupModal,CrmQuickCreateModal}.js` | `/leads` modals | **Ported.** Merge deliberately NOT to the legacy shape — see Gaps. |
| `crm/CrmLostModal.js` | lead stage change | **Absorbed** into the stage transition. |
| `DesignBuildView.js` | eleven separate screens | **Not consolidated, deliberately.** |
| `MyWorkView.js` | per-screen reads | **Not ported, deliberately.** |
| `ProjectTeamView.js` | `/projects/[projectId]/team` | **Ported.** |
| `DocumentVaultView.js` | `/documents` | **Ported** without `public/uploads/`. |
| `CustomerPortalView.js` | `apps/client-portal` | **Redesigned** with real scoping. |
| `VendorPortalView.js` | `apps/vendor-portal` | **Redesigned** with real scoping. |
| `ClientBillingView.js` | — | **CA-gated.** |
| `ReportsView.js` + 7 `reports/*` incl. `TDSChallan281Modal.js` | — | **CA-gated.** |
| `SettingsView.js`, `SettingsLegacyView.js` + 18 `settings/*` | `/settings/*` | **Fully accounted for** in `ports/settings-tabs.md`: 9 ported, 7 already answered under another name, the rest deliberately not. `SettingsLegacyView.js:563-572` is the evidence for the ten named actions. |
| `operations/dpr/*` (7), `operations/wpr/*` (6) | `/siteops` daily and weekly | **Ported.** |
| `DesignView.js` *(old tree only)* | — | **Superseded** by the eleven design-build screens. |

## Shell, primitives and routes

| Legacy file(s) | Status |
|---|---|
| `components/{MainLayout,Sidebar,navigation,StateProvider,BrandIdentity,ErrorBoundary,LoginScreen,CommandPalette,CompanyDocumentDetails}.js` | **Redesigned** as the Next.js App Router shell + `packages/design-system`. No row-level port; the shell was rebuilt. |
| `components/ui/{core,design-system,Toast,ActionMenu,useModal,ActivityTimeline,AttachmentsSection,NotificationsPanel,CommandPalette}.js` | **Redesigned** into `packages/design-system`. `NotificationsPanel` has a backing feature here: `workflow.notifications`, the `/notifications` screen and two routes. |
| `components/work/{WorkPanel,TaskForm,WorkspaceActions,ProjectSelector}.js` | **Not ported, deliberately** — the tasks screen is kept instead. |
| `app/api/rpc/route.js` | **NEVER PORTS.** Unauthenticated privilege escalation: args padded but never truncated, so a caller-supplied argument binds to `session`. Its validation is decorative — `validateRpcInput` returns `.data`, which is discarded. |
| `app/api/debug/route.js`, `app/api/debug_po/route.js` | **NEVER PORTS.** Schema and data dumps with no auth. |
| `app/api/tally/push/route.js` | **Redesigned** as the connector's staged-XML queue. |
| `app/api/events/route.js` | **Not ported** — see `broadcast.js`. |
| `app/api/attachments/[id]/route.js`, `app/api/brand-logo/route.js` | **Partly.** Attachment download ported; the base64 logo is not (no asset store yet). |
| `app/{page,layout,error,global-error}.js`, `app/po/[poNo]/page.js` | **Redesigned.** The PO page's hardcoded GSTIN/PAN is tenant config. |
| `backend/{init-db,turso-migrate,check-db,import-csv,import-custom-csv}.js` | **Not ported.** Turso/SQLite bootstrap; replaced by per-service forward-only migrations and `scripts/seed-demo.mjs` (synthetic). |
| `scripts/*` (18 live) + `scratch/*` (4) | **Not ported.** Phase test harnesses, image/PDF generators, a Cloudinary migration and mock-data purges. None is product. `check_fake_data.js` and `purge-all-mock-data.mjs` exist because that app had mock data in it. |
| `scripts/archive/**` (39 files) | **Not ported.** Superseded by the live tree beside it; kept upstream as history. |

---

## Gaps — what has no home

Three findings. One is substantial.

### 1. Vendor rate contracts — a whole feature, in no document · NOW BUILT

`app/lib/api/rate-contracts.js` (338 lines, six exports:
`listRateContracts`, `getRateContract`, `createRateContract`,
`updateRateContract`, `deleteRateContract`, `getMatchingRateContractsForItem`)
and `components/views/vendors/RateContractsTab.js`, over a
`vendor_rate_contracts` table.

**It was named in none of the four port documents, and nothing in this repo
matched it** — no table, no route, no screen, no "deliberately not ported" note.
It is not a repair or a variant of something ported: it exists only in
`_legacy-updated/`, and it was missed rather than declined.

What it is: contracted unit rates per vendor per category, with a validity
status, and a lookup that finds the contracts matching a line item. For a
design-build contractor that is the thing that decides what a trade *should*
cost before a purchase order is raised — it sits directly beside the trade
catalogue and BOQ rates we did build.

**BUILT, 2026-09-06.** The decision this asked for was made and the answer was
yes. `services/procurement/src/application/rate-contracts.ts`, migrations `0081`
and `0082`, `/api/v1/purchase-orders/rate-contracts`, and
`apps/web/app/(shell)/vendors/rate-contracts/`.

Three things were built differently from the legacy, and the differences are
the point:

- **The comparison fires by itself.** `getMatchingRateContractsForItem` is a
  lookup somebody has to call; here `resolveContractedRate` runs inside the
  transaction that writes a purchase-order line, and stamps the contracted rate
  onto the line. A rate contract nobody compares against is a filing cabinet.
- **One contract matches, or none.** The legacy scores contracts against a line
  by string similarity. `rate_contract_items_no_overlap`, a GiST exclusion
  constraint over `(tenant_id, vendor_id, trade_code, daterange)`, makes "the
  contracted rate" a function rather than a ranking.
- **The trade code is checked.** `trade_code` is a soft reference to
  `projects.trade_packages.code` with no foreign key, and `services/host`
  resolves it at write time and refuses an unknown one — see the deviation note
  below.

What is deliberately NOT built: a deviation THRESHOLD. `listRateDeviations`
reports every line priced above contract, in basis points, and blocks nothing.
A threshold that gates an approval is a value band, and value bands are the
client's to set.

### 2. `mergeProjects` — declined, and worth restating

`app/lib/api/projects.js:311`, reachable from `SettingsProjectsTab.js`. Keys on
project *name*, sums financials as JS floats, rewrites records with no history.
**Deliberately not ported.** Lead merge was built instead, append-only and fully
audited. Project merge, if wanted, needs designing rather than porting.

### 3. ~~Six `work.js` functions are NOT BUILT~~ — WITHDRAWN, it was a mapping miss

**This was wrong and is corrected above.** All six are built:
`projects.project_members` (migration `0063`), `workflow.record_comments` and
`workflow.notifications` (`0064`), seven routes across `api/team.ts` and
`api/comments.ts`, and the `/projects/[projectId]/team` and `/notifications`
screens.

**How the error was made, because the method matters more than the row.** The
first pass searched for the legacy FUNCTION NAMES — `setProjectMember`,
`addWorkComment` — found nothing, and concluded the backing did not exist. But a
port renames things; that is most of what a port is. The question a ledger row
has to answer is *does the capability exist under our naming*, not *does the
legacy identifier appear*. Searching for `project_members` rather than
`setProjectMember` answers it in one command.

A false NOT BUILT is worse than a missing row. A missing row gets found by the
next person who looks; a NOT BUILT row gets believed, and somebody rebuilds
something that already exists.

Every other negative row in this document was re-checked by capability on
2026-09-06. One more changed the same way (`NotificationsPanel`), one was
sharpened from *partly ported* to *redesigned* (`attachments.js`), and the rest
hold: `presence.js` (no presence feature here, and no transport for one),
`broadcast.js` / `app/api/events` (no SSE, no WebSocket, anywhere), `email.js`
(no mail transport — the invite URL is returned once in the response instead),
and `po-line-identity.js` (our goods receipts still reference no PO line, so
`groupPOReceipts`'s rule has nothing to attach to).

---

## What this ledger does not cover

- **It does not verify that a port is CORRECT**, only that it happened. A row
  saying *Ported* means the behaviour has a home, not that it behaves the same.
  Where correctness was in doubt the port documents carry the reasoning, and
  where a value was in doubt it is in `statutory/QUESTIONS-FOR-CA.md`.
- **Rows for CA-gated modules mean "deliberately unbuilt"**, not "missing". The
  money path waits on M2.5 (ADR-0014).
- **`_legacy-updated/` is one agent's tree written on top of the original app.**
  "The legacy does X" is evidence about that tree, not about the business.
