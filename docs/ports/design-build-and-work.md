# Two consolidation decisions, and the evidence for both

> **This document covers part of the port.** The complete file-by-file
> reconciliation — every module in BOTH legacy trees, and where each went —
> is [`docs/PORT-LEDGER.md`](../PORT-LEDGER.md). Where the two disagree, the ledger was
> built by walking the file system and wins.


**2026-09-05.** The repaired legacy tree replaced several of its own screens
with bigger ones, and the question is whether we should follow. Both answers are
**no**, and neither is a shrug — the reasoning is below because
`DesignBuildView.js` and `components/work/` will look, to the next person
reading the two trees side by side, like features we skipped.

**Nothing was deleted.** Every screen named here still exists and still works.

---

## 1. `DesignBuildView.js` — do NOT consolidate recce, drawings and takeoff

**The claim being tested:** `DesignBuildView.js` + `app/lib/api/design-build.js`
consolidated what were separate Design, Site Recce and Takeoff views, so our
three separate screens are a step backwards.

**The claim does not survive reading the module.** `design-build.js` is 1,909
lines and exports **45 functions**. Site survey is one of them
(`saveSiteSurvey:416`, `getSiteSurvey:481`). The rest are a different and much
larger thing:

| Area | Functions |
|---|---|
| Client brief and rooms | `getClientBrief:167`, `saveClientBrief:204`, `acknowledgeClientBrief:315`, `listBriefRooms:333`, `saveBriefRoom:345`, `deleteBriefRoom:403` |
| Design deliverables and review | `listDesignDeliverables:495`, `saveDesignDeliverable:557`, `submitDesignReview:635` |
| Room selections and substitutions | `listRoomSelections:712`, `saveRoomSelection:774`, `decideRoomSelection:860`, `proposeSelectionSubstitution:903`, `approveSelectionSubstitution:936`, `getSelectionProcurementTrace:969` |
| Commercial agreement | `getCommercialAgreement:1004`, `saveCommercialAgreement:1026` |
| Procurement planning | `getProcurementPlan:1100`, `detectLeadTimeConflicts:1119` |
| Joinery packages | `listJoineryPackages:1178`, `saveJoineryPackage:1195`, `advanceJoineryStage:1268` |
| Delivery milestones | `listDeliveryMilestones:1328`, `saveDeliveryMilestone:1336`, `getTwoWeekLookahead:1406`, `recordMilestoneDelay:1422` |
| Design timesheets | `logDesignTimesheet:1444`, `getTeamDesignWorkload:1479` |
| Handover | `listHandoverInspections:1514`, `saveHandoverInspection:1522`, `rectifyHandoverItem:1582`, `generateHandoverPack:1602` |
| Warranty | `listWarrantyCases:1639`, `saveWarrantyCase:1651`, `resolveWarrantyCase:1687` |
| Client action items | `getClientActionItems:1710`, `recordExternalClientDecision:1776`, `getFounderExceptionsSummary:1807` |

**So it did not consolidate three views. It grew eleven new workflows and
absorbed one of the three on the way past.** Recce is in there. Drawings and
takeoff are not — GFC drawings live in `change_orders` in that tree's own module
map, and quantity takeoff has its own file.

**Decision: keep the three screens.** Consolidating would produce one screen
fronting three features we have built and eleven we have not, and the honest
version of that screen is mostly empty states. What a consolidated view actually
gives a user — one place for a project's design work — we already have:
`apps/web/app/(shell)/projects/[projectId]/layout.tsx` puts BOQ, change orders,
takeoff, drawings, site and recce behind one project header with tabs, and each
tab reads only what it shows so a slow section cannot delay the rest.

**What IS worth taking from it, later, and is not built:** the client brief with
its rooms, room selections with substitution approval, joinery stage gates, the
two-week lookahead, handover inspections and warranty cases. Those are real
milestones, not a refactor. Three of them touch money (commercial agreement,
procurement plan, handover pack) and are gated accordingly.

---

## 2. `components/work/` — do NOT replace the tasks screen

**The claim being tested:** `components/work/` replaced `TasksView`, so our
tasks screen is superseded.

**Size first, because it is decisive.** The whole of `components/work/` is
**89 lines** across four files — `WorkPanel.js` (38), `TaskForm.js` (28),
`WorkspaceActions.js` (15), `ProjectSelector.js` (8). `MyWorkView.js` is 24. It
is not a bigger tasks screen; it is a thinner one, over a wider API.

The API behind it (`app/lib/api/work.js`) is where the difference is:

| Function | Do we have it? |
|---|---|
| `listWorkTasks:53`, `createWorkTask:58`, `updateWorkTask:77` | **Yes** — `workflow.tasks`, with an optimistic lock and a status enum our screen already exercises |
| `getWorkspaceBootstrap:18` | **Not applicable** — one call returning everything is the shape we broke up on purpose; each screen reads what it shows |
| `listProjectTeam:24`, `getProjectTeamAdmin:29`, `setProjectMember:35` | **NOT BUILT.** See below |
| `getRecordWork:121`, `addWorkComment:128` | **NOT BUILT** — comments against any record |
| `markWorkNotificationRead:140` | **NOT BUILT** — per-user notifications |
| `listWorkspaceRecords:141` | **Not applicable** — a generic record browser over every table |

**Decision: keep the tasks screen.** It covers everything `listWorkTasks` does
and holds a constraint that one does not — a task carries who assigned it and
who completed it, as principal ids with composite foreign keys.

### The two real gaps this comparison found

Both are recorded here rather than closed, because each is a table and a
milestone rather than an afternoon:

- **Project team membership.** `project_members` exists in the repaired tree's
  own ownership matrix and nothing equivalent exists here — grep for
  `project_members` across `services/` returns nothing. It matters more than it
  looks: `project_team` is one of the seventeen modules in the role model
  (`packages/contracts/src/authz.ts`), so a role can be granted a screen that
  has no data behind it. It is also the natural place for per-project scoping
  later, which is a narrower control than the per-tenant one we have.
- **Comments on a record, and notifications.** `addWorkComment` attaches a
  comment to any entity by type and id. We have `workflow.audit_events`, which
  records what the *system* did, and nothing that records what a *person said
  about* it. Those are different tables and the second one is missing.

Neither blocks anything today. Both are named so that "the legacy had it" is not
discovered later as a surprise.
