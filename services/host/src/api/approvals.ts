import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  HTTP_STATUS,
  createPurchaseOrderFromBoqInput,
  submitPurchaseOrderInput,
} from '@cog/contracts';
import { tenantOf, txOf } from '@cog/service-kit';
import {
  ApprovalRefused,
  assertChainConfigured,
  loadApprovals,
  loadStages,
  recordApproval,
  recordDecline,
  notify,
  notifiableStaff,
} from '@cog/workflow';
import { loadPrincipalRoles, principalsHoldingRole } from '@cog/identity';
import { invoicedByProject } from '@cog/finance';
import {
  PURCHASE_ORDER_ENTITY_TYPE,
  PurchaseOrderNotFound,
  applyChainAdvance,
  cancelDeclinedOrder,
  createPurchaseOrder,
  loadApprovalSubject,
  committedByProject,
  approvedCommitmentsByProject,
  rateCoverage,
  rateLibrary,
  purchaseOrderLinesFromBoq,
  toWriteResponse,
  submitForApproval,
  PurchaseOrderStaleWrite,
} from '@cog/procurement';
import {
  BoqLineNotOrderable,
  ProjectReadOnly,
  agreedAgainstBoq,
  assertProjectOpen,
  agreedAgainstBoqCostRates,
  boqCostRatesByIds,
  buildProjectRollup,
  listBoqCostBudgets,
  listProjectBudgets,
  loadHealthThreshold,
  loadOrderableBoqLines,
} from '@cog/projects';

/**
 * Approving a purchase order.
 *
 * **This lives in `services/host` because it is composition, and nowhere else
 * is allowed to be.** Recording an approval needs the engine in
 * `services/workflow` AND the aggregate in `services/procurement`, and
 * `eslint.config.mjs` generates a restricted zone for every ordered pair of
 * services — so neither may import the other. The composition root is the one
 * place permitted to import both (M1/D5).
 *
 * ---
 *
 * **The boundary this file must not cross: host ORCHESTRATES, it does not
 * COMPUTE.**
 *
 * Every rule about whether an approval is valid lives in `approve()` in
 * workflow — entitlement, self-approval, quorum by distinct approvers, one
 * stage per call with no role exempt. Every rule about what an approved chain
 * means for a purchase order lives in `applyChainAdvance` in procurement,
 * because procurement owns that state machine.
 *
 * What is left here is wiring: read the stages, read the approvals, read the
 * subject, hand them to the engine, hand the engine's answer to the aggregate.
 * There is deliberately **no conditional about approval semantics below**. If
 * one ever appears here, it belongs in workflow — a rule in the composition
 * layer is a rule that has escaped the service that owns it, and the one-way
 * dependency rule becomes decorative the moment that happens.
 *
 * ---
 *
 * **PO-13 is unanswered, so this endpoint refuses everything today.** No
 * approval chain has been decided, `workflow.approval_chains` is empty, and
 * `assertChainConfigured` turns that into a refusal rather than a fall-through.
 * An unconfigured control must fail closed: approving because no chain was
 * found is precisely the shape of hole APPR-01/02/03 describe. The engine
 * enforcing separation of duties against an empty chain is the correct state
 * until a real chain is supplied — and no plausible chain is seeded to make it
 * look alive.
 */

const decideInput = z.object({
  remarks: z.string().max(2000).optional(),
});

const declineInput = z.object({
  remarks: z.string().trim().min(1).max(2000),
});

export function approvalRoutes(): Hono {
  const app = new Hono();

  /**
   * Send a draft order for approval, and tell the people it lands on.
   *
   * Here rather than in `services/procurement` because of the second half.
   * Submitting means the order appears in somebody's queue, and *whose* queue
   * spans two services procurement may not import: `workflow` knows the chain's
   * first stage, `identity` knows who holds that stage's role.
   *
   * Both halves are one transaction. An order that moved to `pending_approval`
   * while nobody was told is the state that gets chased by email a week later,
   * and re-running the submit to fix it would fail the optimistic lock.
   */
  app.post('/purchase-orders/:id/submit', async (c) => {
    const id = c.req.param('id');
    if (!z.uuid().safeParse(id).success) return notFound(c);

    const parsed = submitPurchaseOrderInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationFailed(c, parsed.error);

    const ctx = tenantOf(c);
    const tx = txOf(c);
    const submitted = await submitForApproval(tx, id, parsed.data.expectedVersion);

    // Who is being asked. An unconfigured chain has no first stage, and a first
    // stage with no role named means anyone signed in — neither is somebody to
    // notify, so neither produces a notification rather than producing one for
    // everybody.
    const stages = await loadStages(tx, PURCHASE_ORDER_ENTITY_TYPE);
    const first = [...stages].sort((a, b) => a.sequence - b.sequence)[0];
    if (first !== undefined && first.approverRole !== '') {
      const approvers = await principalsHoldingRole(tx, first.approverRole);
      for (const approverId of approvers) {
        // Not the person who submitted it, even if they hold the role. They
        // cannot approve it either — `approve()` refuses self-approval.
        if (approverId === ctx.principal.id) continue;
        await notify(tx, ctx.tenantId, {
          recipientId: approverId,
          actorId: ctx.principal.id,
          kind: 'approval_requested',
          summary: `A purchase order is waiting for you at ${first.name}.`,
          entityType: 'purchase_order',
          entityId: id,
        });
      }
    }

    return c.json(submitted);
  });

  app.post('/purchase-orders/:id/approve', async (c) => {
    const id = c.req.param('id');
    if (!z.uuid().safeParse(id).success) return notFound(c);

    const parsed = decideInput.safeParse((await c.req.json().catch(() => ({}))) ?? {});
    if (!parsed.success) return validationFailed(c, parsed.error);

    const ctx = tenantOf(c);
    const tx = txOf(c);

    // 1. Workflow's data: what the chain is, and what has already been approved.
    const stages = await loadStages(tx, PURCHASE_ORDER_ENTITY_TYPE);
    assertChainConfigured(stages, PURCHASE_ORDER_ENTITY_TYPE);

    // 2. Identity's data: what this principal may do. The resolver builds a
    //    principal with `roles: []` on purpose — the bootstrap query runs with
    //    no tenant context and must not become an enumeration surface — so the
    //    roles are read here, inside the transaction, under RLS.
    const approverRoles = await loadPrincipalRoles(tx, ctx.principal.id);

    // 3. Procurement's data: where this order is, and who raised it.
    const subject = await loadApprovalSubject(tx, id);
    const approvals = await loadApprovals(tx, PURCHASE_ORDER_ENTITY_TYPE, subject.entityId);

    // 4. The engine decides. Everything it needs was assembled above; nothing
    //    about the decision is taken here.
    const outcome = await recordApproval({
      tx,
      ctx,
      entityType: PURCHASE_ORDER_ENTITY_TYPE,
      entityId: subject.entityId,
      stages,
      state: {
        currentStage: subject.currentStage,
        requesterId: subject.requesterId,
        approvals,
      },
      approverRoles,
      // What this stage is being asked to authorise. Compared against the
      // stage's ceiling, which is unset on every seeded chain (PO-13d), so
      // today this changes nothing and is here so that setting one works.
      amountPaise: subject.amountPaise,
      ...(parsed.data.remarks === undefined ? {} : { remarks: parsed.data.remarks }),
      at: new Date(),
      // 5. The aggregate applies it, in the same transaction. What an advanced
      //    chain means for a purchase order is procurement's rule, not this
      //    file's.
      applyDecision: async (advanced) => {
        await applyChainAdvance(tx, subject.entityId, advanced.stage, advanced.complete);

        // Tell the person who raised it what happened, in the SAME
        // transaction. A decision that was applied but never announced is the
        // state somebody chases by email, and re-running it later would apply
        // the decision twice.
        //
        // Through `notifiableStaff`, because `created_by` is a TEXT column with
        // no constraint and can hold something that is not a principal — an
        // imported row, somebody since deleted. Addressing a notification to
        // that took the entire approval down with a 500. The approval is the
        // control; the notification is a courtesy, and a courtesy that cannot
        // be delivered must not veto the control.
        for (const recipient of await notifiableStaff(tx, [subject.requesterId])) {
          await notify(tx, ctx.tenantId, {
            recipientId: recipient,
            actorId: ctx.principal.id,
            kind: 'approval_decided',
            summary: advanced.complete
              ? `Your purchase order was approved.`
              : `Your purchase order moved to ${advanced.stage}.`,
            entityType: 'purchase_order',
            entityId: subject.entityId,
          });
        }
      },
    });

    return c.json({
      entityId: subject.entityId,
      outcome: outcome.kind,
      stage: outcome.kind === 'advanced' ? outcome.stage : subject.currentStage,
      complete: outcome.kind === 'advanced' ? outcome.complete : false,
    });
  });

  /**
   * Decline a purchase order at its current stage.
   *
   * The same composition as approving: workflow's chain and history, identity's
   * roles, procurement's subject — and workflow's `decline()` decides. The
   * subject is read FIRST, so another tenant's order is not found before any
   * chain is consulted. A decline cancels the order (`cancelDeclinedOrder`);
   * the requester is told, with the reason, in the same transaction.
   */
  app.post('/purchase-orders/:id/decline', async (c) => {
    const id = c.req.param('id');
    if (!z.uuid().safeParse(id).success) return notFound(c);

    const parsed = declineInput.safeParse((await c.req.json().catch(() => ({}))) ?? {});
    if (!parsed.success) return validationFailed(c, parsed.error);

    const ctx = tenantOf(c);
    const tx = txOf(c);
    const subject = await loadApprovalSubject(tx, id);
    if (subject.state !== 'pending_approval') {
      return c.json(
        { code: 'CONFLICT' as const, message: 'This order is not waiting for a decision.', requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    const stages = await loadStages(tx, PURCHASE_ORDER_ENTITY_TYPE);
    assertChainConfigured(stages, PURCHASE_ORDER_ENTITY_TYPE);
    const approverRoles = await loadPrincipalRoles(tx, ctx.principal.id);
    const approvals = await loadApprovals(tx, PURCHASE_ORDER_ENTITY_TYPE, subject.entityId);
    const remarks = parsed.data.remarks;

    const { stage } = await recordDecline({
      tx,
      ctx,
      entityType: PURCHASE_ORDER_ENTITY_TYPE,
      entityId: subject.entityId,
      stages,
      state: { currentStage: subject.currentStage, requesterId: subject.requesterId, approvals },
      approverRoles,
      remarks,
      at: new Date(),
      applyDecline: async (declinedAt) => {
        const moved = await cancelDeclinedOrder(tx, subject.entityId);
        if (!moved) throw new PurchaseOrderStaleWrite('This order was decided by someone else first.');
        for (const recipient of await notifiableStaff(tx, [subject.requesterId])) {
          await notify(tx, ctx.tenantId, {
            recipientId: recipient,
            actorId: ctx.principal.id,
            kind: 'approval_decided',
            summary: `Your purchase order was declined at ${declinedAt}: ${remarks}`,
            entityType: 'purchase_order',
            entityId: subject.entityId,
          });
        }
      },
    });

    return c.json({ entityId: subject.entityId, outcome: 'declined', stage, complete: false });
  });

  /**
   * Raise a purchase order against BOQ lines.
   *
   * **This is the replacement for BOQ-03, and the whole point is what it does
   * not do.** `shootPOFromBOQItem` (`boq.js:174`) and `shootPOFromBOQItems`
   * (`:253`) insert a purchase order with `status` and `approval_status`
   * hardcoded to `'Approved'`, for a value the caller supplies (`:170`), gated
   * only by `requireAuth` — which checks that `session.email` is truthy and
   * nothing else (`AuthService.ts:17-21`). Both are in the RPC allowlist. Every
   * approval control lives on a different endpoint that writes the same table.
   *
   * Here the order is created by `createPurchaseOrder`, which writes `'draft'`,
   * and it enters the ordinary chain through the existing approve endpoint.
   * **There is no path in this system that creates an approved order.**
   *
   * ---
   *
   * **Host orchestrates; it does not compute.** Three calls and no conditional
   * about domain meaning:
   *
   *   1. `loadOrderableBoqLines` — projects decides what is orderable and
   *      refuses a line with no cost rate (BOQ-06).
   *   2. `purchaseOrderLinesFromBoq` — procurement decides what a PO line made
   *      from a BOQ line looks like.
   *   3. `createPurchaseOrder` — procurement creates it, in `draft`, with the
   *      totals computed from those lines.
   *
   * If a rule about BOQ-to-PO semantics ever appears in this file, it belongs in
   * one of those two services.
   */
  app.post('/purchase-orders/from-boq', async (c) => {
    const parsed = createPurchaseOrderFromBoqInput.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return validationFailed(c, parsed.error);

    const ctx = tenantOf(c);
    const tx = txOf(c);

    // a project no longer worked takes no new order (06-projects: handed over is read-only)
    await assertProjectOpen(tx, parsed.data.projectId);
    const boqLines = await loadOrderableBoqLines(tx, parsed.data.projectId, parsed.data.boqItemIds);
    const lines = purchaseOrderLinesFromBoq(boqLines, parsed.data.gstRate);

    const result = await createPurchaseOrder(tx, ctx, {
      ...(parsed.data.number === undefined ? {} : { number: parsed.data.number }),
      vendorId: parsed.data.vendorId,
      // The order is for the project whose BOQ it was raised from. Nothing
      // needs to say so separately, and nothing could disagree.
      projectId: parsed.data.projectId,
      lines,
    });

    // `toWriteResponse` is procurement's, so this file never handles a monetary
    // value — not even to format one. `state` in it is always 'draft'; the
    // isolation suite asserts that, because it is the property BOQ-03 was about.
    return c.json(
      { ...toWriteResponse(result), boqItemIds: boqLines.map((l) => l.id) },
      201,
    );
  });

  /**
   * The project rollup — committed spend against contract value, per project.
   *
   * **Composition, so it lives here.** Committed spend is
   * `procurement.purchase_orders`; contract value and the at-risk band are
   * `projects`. Neither service may read the other's tables, and host may not
   * compute — so it reads both sides and hands them to `projectFinancials` and
   * `projectHealth`, which are projects' functions.
   *
   * ---
   *
   * **What this deliberately does not return: inflow, outflow, TDS, the actual
   * margin and the balance.**
   *
   * Every one of them comes from the payment path. `getProjectDetails`
   * (`projects.js:83`) reads `payment_requests`, `system_payments` and
   * `project_financials`; **none of those tables exists here**, because payments
   * are gated on CA-01..CA-08 and have not been built.
   *
   * They are absent rather than zero. Returning `outflow: 0` would be a
   * statement that nothing has been paid, which is a claim about money that
   * nothing supports — and a screen would render it beside a real committed
   * figure as though the two were comparable.
   *
   * `plannedMargin` is absent for the same reason in a different direction: it
   * needs a budgeted cost of sale, and `projects.projects` has no `bcs` column.
   * The legacy keeps it in `project_financials`, a manual-override table with
   * three conflicting CREATE TABLE statements (`projects.js:132`, `:208`,
   * `:408`).
   *
   * **Not cursor-paged.** `items` is a ranking over two whole-tenant reads —
   * the meter's scale and `orderedSoFar` are computed across every project, so
   * there is no stable per-row key a cursor could cut on without recomputing
   * both from a different subset every window. Instead: `ids` (comma-separated,
   * at most 200) asks for exactly those projects, by id, in whatever order the
   * rollup already put them in — the way a screen joins this endpoint's figures
   * onto a page it fetched from `listProjects`; `limit` (1-200, default 50)
   * bounds an unfiltered read the same way `listProjects`'s own default does.
   * `count` is the number of projects in the rollup before either narrows it.
   */
  app.get('/rollups/projects', async (c) => {
    const tx = txOf(c);

    const ids = parseRollupIds(c);
    if (ids !== undefined && 'error' in ids) return validationFailedRaw(c, 'ids', ids.error);
    const limit = parseRollupLimit(c);
    if (typeof limit !== 'number') return validationFailedRaw(c, 'limit', limit.error);

    // Projects' data: what was signed, and where the band sits.
    const budgets = await listProjectBudgets(tx);
    const threshold = await loadHealthThreshold(tx);

    // Procurement's data: what has been committed, and what of it is approved.
    const commitments = await committedByProject(tx);
    const approved = await approvedCommitmentsByProject(tx);
    // Projects' again: each BOQ's cost budget, for margin at risk.
    const costBudgets = await listBoqCostBudgets(tx);

    // Projects assembles the WHOLE ranking — every figure below, including the
    // meter's shared scale, is computed over every project, never over
    // whichever subset `ids` or `limit` will leave in the response.
    const invoiced = await invoicedByProject(tx);
    const rollup = buildProjectRollup(budgets, threshold, commitments, costBudgets, approved, invoiced) as {
      readonly items: ReadonlyArray<{ readonly id: string }>;
    } & Record<string, unknown>;
    const idSet = ids === undefined ? null : new Set(ids);
    const selected =
      idSet === null ? rollup.items.slice(0, limit) : rollup.items.filter((p) => idSet.has(p.id));

    return c.json({ ...rollup, items: selected, count: rollup.items.length });
  });

  /**
   * Rates, measured: procurement counts the order lines and names the ones
   * that carry both a BOQ line and an agreed rate; projects reads those BOQ
   * lines' cost rates and makes the comparison. Keyed by id, never by text.
   */
  /**
   * The rate library: procurement's rows — each agreed rate and the line last
   * ordered against it — and, from projects, the BOQ cost rate that line was
   * raised from, so the estimator sees agreed against budget item by item.
   * Keyed by the line's `boq_item_id`, never by text.
   */
  app.get('/rollups/rate-library', async (c) => {
    const tx = txOf(c);
    const vendorId = c.req.query('vendorId');
    if (vendorId !== undefined && !z.uuid().safeParse(vendorId).success) {
      return c.json({ code: 'VALIDATION_FAILED' as const, message: 'vendorId must be a uuid', requestId: 'unknown' }, 400);
    }
    const tradeCode = c.req.query('tradeCode');
    const every = await rateLibrary(tx);
    const rows = every.filter((r) => (vendorId === undefined || r.vendorId === vendorId) && (tradeCode === undefined || r.tradeCode === tradeCode.toUpperCase()));
    // projects compares each agreed rate with the cost rate of the BOQ line its last order came from
    const againstBoq = await agreedAgainstBoqCostRates(
      tx,
      rows.flatMap((r) => (r.lastOrdered?.boqItemId === null || r.lastOrdered?.boqItemId === undefined ? [] : [{ boqItemId: r.lastOrdered.boqItemId, agreedRate: r.agreedRate }])),
    );
    return c.json({
      items: rows.map((r) => {
        const boqItemId = r.lastOrdered?.boqItemId ?? null;
        const compared = boqItemId === null ? null : (againstBoq.get(boqItemId) ?? null);
        return {
          itemId: r.itemId,
          contractId: r.contractId,
          contractNumber: r.contractNumber,
          vendorId: r.vendorId,
          vendorName: r.vendorName,
          tradeCode: r.tradeCode,
          description: r.description,
          uom: r.uom,
          agreedRate: r.agreedRate,
          validFrom: r.validFrom,
          validTo: r.validTo,
          lastOrdered: r.lastOrdered === null ? null : { orderId: r.lastOrdered.orderId, orderNumber: r.lastOrdered.orderNumber, unitRate: r.lastOrdered.unitRate, on: r.lastOrdered.on },
          excessBp: r.excessBp,
          boqCostRate: compared?.boqCostRate ?? null,
          agreedBpOfBoqCost: compared?.agreedBpOfBoqCost ?? null,
        };
      }),
      count: rows.length,
      summary: {
        above: every.filter((r) => r.excessBp !== null && r.excessBp > 0).length,
        neverOrdered: every.filter((r) => r.lastOrdered === null).length,
        contracts: new Set(every.map((r) => r.contractId)).size,
      },
    });
  });

  app.get('/rollups/rate-analysis', async (c) => {
    const tx = txOf(c);
    const coverage = await rateCoverage(tx);
    const costRates = await boqCostRatesByIds(
      tx,
      coverage.linked.map((l) => l.boqItemId),
    );
    const compared = agreedAgainstBoq(coverage.linked, costRates);
    return c.json({
      orderLines: coverage.orderLines,
      withoutAgreedRate: coverage.withoutAgreedRate,
      withoutTradeCode: coverage.withoutTradeCode,
      linkedLines: compared.linkedLines,
      comparedLines: compared.comparedLines,
      unpricedBoqLines: compared.unpricedBoqLines,
      agreedBpOfBoqCost: compared.agreedBpOfBoqCost,
    });
  });

  app.onError((error, c) => {
    if (error instanceof ApprovalRefused) {
      // A refusal is an ordinary outcome and must be distinguishable from a
      // fault: the caller is not entitled, or is the requester, or has already
      // approved this stage, or no chain is configured. Each is a reason a
      // person can act on.
      return c.json(
        { code: 'FORBIDDEN' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.FORBIDDEN as 403,
      );
    }
    if (error instanceof PurchaseOrderNotFound) return notFound(c);
    // The optimistic lock on `/submit`, which moved here from procurement.
    //
    // Procurement's own `onError` used to map this; moving the route without
    // moving its error contract would have turned "this order is already
    // pending approval" into a 500 — the API telling somebody the server broke
    // when in fact they lost a race, which is the answer they can act on.
    if (error instanceof PurchaseOrderStaleWrite) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof ProjectReadOnly) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof BoqLineNotOrderable) {
      // A refusal a person can act on: a line is not in this project, or has no
      // cost rate so no purchase-order rate can be derived (BOQ-06).
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    throw error;
  });

  return app;
}

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

function notFound(c: Context): Response {
  return c.json(
    { code: 'NOT_FOUND' as const, message: 'No such purchase order.', requestId: requestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

function validationFailed(c: Context, error: z.ZodError): Response {
  return c.json(
    {
      code: 'VALIDATION_FAILED' as const,
      message: 'Some of the submitted values are not valid.',
      requestId: requestId(c),
      details: error.issues.map((i) => ({ path: i.path.join('.'), reason: i.message })),
    },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

function validationFailedRaw(c: Context, path: string, reason: string): Response {
  return c.json(
    {
      code: 'VALIDATION_FAILED' as const,
      message: 'Some of the submitted values are not valid.',
      requestId: requestId(c),
      details: [{ path, reason }],
    },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

/** `ids` — comma-separated uuids, at most 200 — or `undefined` when absent. */
function parseRollupIds(c: Context): readonly string[] | undefined | { error: string } {
  const raw = c.req.query('ids');
  if (raw === undefined || raw === '') return undefined;
  const ids = raw.split(',');
  if (ids.length > 200) return { error: 'ids must name at most 200 projects' };
  for (const id of ids) {
    if (!z.uuid().safeParse(id).success) return { error: `${id} is not a uuid` };
  }
  return ids;
}

/** `limit` — an integer from 1 to 200, default 50 when absent. */
function parseRollupLimit(c: Context): number | { error: string } {
  const raw = c.req.query('limit');
  if (raw === undefined) return 50;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 200) {
    return { error: 'limit must be an integer from 1 to 200' };
  }
  return parsed;
}
