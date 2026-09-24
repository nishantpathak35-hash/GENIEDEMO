# Port note — tasks and CRM

Slices 5 and 6 of the M5 view port. `TasksView.js` (478 lines) and
`CrmView.js` (463 lines) were blocked on all of these.

The status check came back **clean on columns for both modules** — no write
names a column that does not exist, and neither touches a `version` column. That
is two of six modules checked where the pattern does not appear.

---

## Tasks

Legacy: `app/lib/api/tasks.js`, six functions at `:53`, `:130`, `:196`, `:228`,
`:280`, `:303`, all in the RPC allowlist.

| Ref | Site | Defect | Status |
|---|---|---|---|
| **TASK-01** | `tasks.js:16-48` | The `tasks` table is created by `ensureTasksTable()`, called at the top of all six functions, **inside a `try/catch` that swallows the error** (`:45-47`), and never recorded in `schema_migrations`. Nothing knows whether it exists or what shape it has | **LIVE** |
| **TASK-02** | `tasks.js:247-248` | `updateTask` writes `completed_at = ?` and `completed_by = ?` with **no `COALESCE`**, unlike every other field in the same statement. Any status change writes NULL to both, so completing a task and then changing anything else erases the record of who completed it and when | **LIVE** |
| **TASK-03** | `tasks.js:94`, `:138` | Assignment is a lowercased email string matched with `LOWER(assigned_to) = ?`, with no foreign key. A person who changes their email loses their tasks | **LIVE** |
| **TASK-04** | `tasks.js:229`, `:304` | Any authenticated principal may reassign or delete any task | **LIVE** |

**What replaces it.** `workflow.tasks`, in the migration system, with
`assigned_to` and `assigned_by` as composite FKs to `identity.principals`.
Completion is derived from the status by the server and guarded by a CHECK —
`(status = 'completed') = (completed_at IS NOT NULL AND completed_by IS NOT NULL)`
— so TASK-02's state is not representable. `status` and `priority` are
CHECK-constrained lower-case enums rather than free text.

Tasks live in `services/workflow` because workflow owns *things a person must
act on*: it already holds approval chains and history keyed by
`(entity_type, entity_id)`, and a task is that shape without a decision attached.

`entity_type`/`entity_id` stay free text and carry **no** foreign key — a task
may point at a purchase order, a BOQ line or a lead, and a polymorphic FK is not
a thing. Nothing authorises anything from that pair; it is for display and
filtering.

---

## CRM

Legacy: `app/lib/api/crm.js`, six functions at `:12`, `:52`, `:92`, `:125`,
`:153`, `:165`, all in the RPC allowlist. Table at `migrations.js:408-426`.

| Ref | Site | Defect | Status |
|---|---|---|---|
| **CRM-01** | four places | **Four different stage→probability ladders for the same stages.** `CrmView.js:402-407` writes Lead 20 / Qualified 45 / Proposal 70 / Negotiation 90; `crm.js:131-139` overwrites with Lead 30 / Qualified 50 / Proposal 75 / Negotiation 90 / Unqualified 10 / Rejected 0; the column default is 40 (`migrations.js:416`); the read fallback is also 40 (`crm.js:41`). Creating a lead writes the first, changing its stage writes the second, and anything else gets the third | **LIVE** |
| **CRM-02** | `CrmView.js:53` | `acc + (curr.value * ((curr.probability \|\| 0) / 100) \|\| 0)` — money multiplied by a percentage, on a float, in a browser. Then `:157` divides by 10,000,000 for crores, rounding a second time | **LIVE** |
| **CRM-03** | `crm.js:57`, `:179` | `id = 'OPP-' + Math.floor(100 + Math.random() * 900)` and `code = 'PRJ-' + Math.floor(2000 + Math.random() * 8000)`, both against `TEXT PRIMARY KEY`. 900 and 8000 values; collisions throw | **LIVE** |
| **CRM-04** | `crm.js:78`, `:43` | The owner is `payload.owner \|\| session?.name \|\| 'Sales Team'`, read back as `assigned_to \|\| 'Sales Manager'`. A display name or a literal, not an identity, with no FK | **LIVE** |
| **CRM-05** | `crm.js:81` | `expected_close` defaults to the string literal `'15 Dec 2026'` | **LIVE** |
| **CRM-06** | `migrations.js:415` | `estimated_value REAL` | **LIVE** |

### CRM-01 is the one that needs a person

The weighted pipeline a director reads is a mix of ladders nobody chose, and the
four disagree by up to 15 points at the same stage. **The ladder is not ported.**
`probability_pct` is stored as entered and never derived from the stage, because
inventing a fifth ladder would be exactly the move that produced the first four.

Same category as PO-15 and PO-18: a commercial default with no stated basis. When
somebody with authority names one, it becomes per-tenant configuration.

### CRM-02 moves server-side

`pipelineTotals` in `services/projects/src/domain/pipeline.ts` computes the open
total, the weighted total and the win rate. The weighting goes through `mulRatio`
with `roundToPaise` named at the call site, per line and then summed — summing
first and applying an average is a different number.

The win rate is `null` rather than `0` when nothing has been decided: an empty
pipeline showing 0% states something false.

### The rest

`converted_project_id` records which project a lead became, and the lead row is
kept — it is the only record of where the work came from. Conversion takes a
project id rather than creating the project itself, so a project code is chosen
rather than randomly generated (CRM-03). Stages are a CHECK-constrained
lower-case enum. `expected_close` defaults to NULL: a date nobody chose is not a
date.

---

## Needs a person

- **CRM-01** — the stage→probability ladder, per tenant. Nothing is derived
  until it lands.
- **TASK-04 / CRM-04 roles** — who may reassign work, and who may see the
  pipeline. Part of PO-13, like every other role question.

---

## The commits

One per module: table and policy pair, then endpoints. No faithful-port commits —
porting `updateTask` verbatim means porting a statement that erases completion
records, and porting `createLead` verbatim means porting a random primary key
and a hardcoded date.
