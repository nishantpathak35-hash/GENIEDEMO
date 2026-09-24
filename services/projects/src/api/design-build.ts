import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  HTTP_STATUS,
  addDeliverableInput,
  addSelectionInput,
  addStatementInput,
  decideSelectionInput,
  decideSubstitutionInput,
  proposeSubstitutionInput,
  reviewDeliverableInput,
  saveAgreementInput,
  setAgreementStatusInput,
  setStagesInput,
  addPackageInput,
  advanceStageInput,
  addMilestoneInput,
  recordProgressInput,
  raiseItemInput,
  rectifyItemInput,
  issueHandoverInput,
  raiseCaseInput,
  decideCaseInput,
  bookTimeInput,
  externalDecisionInput,
  saveBriefInput,
  saveRoomInput,
  setBriefStatusInput,
} from '@cog/contracts';
import { tenantOf, todayInIndia, txOf } from '@cog/service-kit';
import {
  BriefRefused,
  addStatement,
  listBriefs,
  removeRoom,
  removeStatement,
  saveBrief,
  saveRoom,
  setBriefStatus,
} from '../application/client-brief.js';
import {
  DeliverableRefused,
  addDeliverable,
  listDeliverables,
  reviewDeliverable,
  submitDeliverable,
} from '../application/design-deliverables.js';
import {
  SelectionRefused,
  addSelection,
  decideSelection,
  decideSubstitution,
  listSelections,
  proposeSubstitution,
} from '../application/room-selections.js';
import {
  AgreementRefused,
  getAgreement,
  saveAgreement,
  setAgreementStatus,
  setStages,
} from '../application/commercial-agreement.js';
import { procurementPlan } from '../application/procurement-plan.js';
import {
  JoineryRefused,
  addPackage,
  advanceStage,
  listPackages,
} from '../application/joinery.js';
import {
  MilestoneRefused,
  addMilestone,
  listMilestones,
  recordProgress,
} from '../application/delivery-milestones.js';
import { milestonesThisWeek } from '../application/dashboard.js';
import {
  HandoverItemRefused,
  handoverState,
  issueHandover,
  raiseItem,
  rectifyItem,
} from '../application/handover.js';
import {
  WarrantyRefused,
  decideCase,
  listCases,
  raiseCase,
} from '../application/warranty.js';
import { TimesheetRefused, bookTime, timesheets } from '../application/timesheets.js';
import {
  ClientActionRefused,
  clientActions,
  recordExternalDecision,
} from '../application/client-actions.js';

/**
 * The design-build workflows, as routers.
 *
 * **Every one of these is mounted behind `moduleGate` in `services/host`**, so
 * a tenant that has not switched the module on gets 404 from all of it. The
 * gate is composition — whether a module is on lives in `services/tenancy` and
 * this service may not read it (M1/D5) — which is why it is applied at the
 * mount rather than inside each handler. Applying it here would mean eleven
 * places to forget it.
 *
 * Nothing in this file assumes it is gated. If the gate were removed the routes
 * would work, and a tenant would have a feature nobody chose — which is why the
 * isolation suite asserts the 404 rather than trusting the wiring.
 */

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

function notFound(c: Context, what: string) {
  return c.json(
    { code: 'NOT_FOUND' as const, message: `no such ${what}`, requestId: requestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

function invalid(c: Context, message: string) {
  return c.json(
    { code: 'VALIDATION_FAILED' as const, message, requestId: requestId(c) },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

// ── 1. Client brief and rooms ───────────────────────────────────────────────

export function briefRoutes(): Hono {
  const app = new Hono();

  app.get('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    // Every version, newest first. A superseded version is what the client
    // agreed to before the scope changed, and being able to read it is the
    // whole value of versioning.
    return c.json({ items: await listBriefs(txOf(c), projectId) });
  });

  /**
   * Write the brief.
   *
   * One route for create and edit, because from the caller's side it is one
   * action — "this is what the client asked for". Which of the three things
   * happens (first version, edit in place, or a new version because the current
   * one is acknowledged) is a rule about the record, not a choice the caller
   * makes, and offering it as a choice is how somebody edits a signed scope.
   */
  app.put('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    const parsed = saveBriefInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'That brief was not saved.');
    }
    return c.json(await saveBrief(txOf(c), tenantOf(c), projectId, parsed.data));
  });

  app.post('/:briefId/status', async (c) => {
    const briefId = c.req.param('briefId');
    if (!z.uuid().safeParse(briefId).success) return notFound(c, 'brief');
    const parsed = setBriefStatusInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, 'Say whether it is issued or acknowledged.');
    return c.json(await setBriefStatus(txOf(c), tenantOf(c), briefId, parsed.data.status));
  });

  app.post('/:briefId/statements', async (c) => {
    const briefId = c.req.param('briefId');
    if (!z.uuid().safeParse(briefId).success) return notFound(c, 'brief');
    const parsed = addStatementInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'That statement was not saved.');
    }
    return c.json({ id: await addStatement(txOf(c), tenantOf(c), briefId, parsed.data) }, 201);
  });

  app.delete('/:briefId/statements/:statementId', async (c) => {
    const briefId = c.req.param('briefId');
    const statementId = c.req.param('statementId');
    if (!z.uuid().safeParse(briefId).success) return notFound(c, 'brief');
    if (!z.uuid().safeParse(statementId).success) return notFound(c, 'statement');
    const gone = await removeStatement(txOf(c), briefId, statementId);
    return gone ? c.body(null, 204) : notFound(c, 'statement');
  });

  app.put('/:briefId/rooms', async (c) => {
    const briefId = c.req.param('briefId');
    if (!z.uuid().safeParse(briefId).success) return notFound(c, 'brief');
    const parsed = saveRoomInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'That room was not saved.');
    }
    return c.json({ id: await saveRoom(txOf(c), tenantOf(c), briefId, parsed.data) }, 201);
  });

  app.delete('/:briefId/rooms/:roomId', async (c) => {
    const briefId = c.req.param('briefId');
    const roomId = c.req.param('roomId');
    if (!z.uuid().safeParse(briefId).success) return notFound(c, 'brief');
    if (!z.uuid().safeParse(roomId).success) return notFound(c, 'room');
    const gone = await removeRoom(txOf(c), briefId, roomId);
    return gone ? c.body(null, 204) : notFound(c, 'room');
  });

  app.onError((error, c) => {
    if (error instanceof BriefRefused) {
      // "No such brief" is a 404 and every other refusal is a 400. A single
      // status for both makes "the client already acknowledged this" read as a
      // broken id.
      if (error.message === 'no such brief') return notFound(c, 'brief');
      return invalid(c, error.message);
    }
    throw error;
  });

  return app;
}

// ── 2. Design deliverables and review ───────────────────────────────────────

export function deliverableRoutes(): Hono {
  const app = new Hono();

  app.get('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    return c.json({ items: await listDeliverables(txOf(c), projectId) });
  });

  app.post('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    const parsed = addDeliverableInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'That deliverable was not saved.');
    }
    return c.json({ id: await addDeliverable(txOf(c), tenantOf(c), projectId, parsed.data) }, 201);
  });

  app.post('/:deliverableId/submit', async (c) => {
    const deliverableId = c.req.param('deliverableId');
    if (!z.uuid().safeParse(deliverableId).success) return notFound(c, 'deliverable');
    await submitDeliverable(txOf(c), deliverableId);
    return c.json({ ok: true });
  });

  /**
   * Record a review.
   *
   * `reviewerKind` is taken from the PRINCIPAL, never from the request. The
   * legacy derives it from `session?.userType`, which is the same idea; making
   * it a field would let an internal reviewer file a decision as the client's.
   */
  app.post('/:deliverableId/review', async (c) => {
    const deliverableId = c.req.param('deliverableId');
    if (!z.uuid().safeParse(deliverableId).success) return notFound(c, 'deliverable');
    const parsed = reviewDeliverableInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, 'Say what the decision is.');

    const ctx = tenantOf(c);
    return c.json(
      await reviewDeliverable(txOf(c), ctx, deliverableId, {
        ...parsed.data,
        reviewerKind: ctx.principal.kind === 'client' ? 'client' : 'internal',
      }),
    );
  });

  app.onError((error, c) => {
    if (error instanceof DeliverableRefused) {
      if (error.message === 'no such deliverable') return notFound(c, 'deliverable');
      return invalid(c, error.message);
    }
    throw error;
  });

  return app;
}

// ── 3. Room selections and substitutions ────────────────────────────────────

export function selectionRoutes(): Hono {
  const app = new Hono();

  app.get('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    return c.json({ items: await listSelections(txOf(c), projectId) });
  });

  app.post('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    const parsed = addSelectionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'That selection was not saved.');
    }
    return c.json({ id: await addSelection(txOf(c), tenantOf(c), projectId, parsed.data) }, 201);
  });

  app.post('/:selectionId/decide', async (c) => {
    const selectionId = c.req.param('selectionId');
    if (!z.uuid().safeParse(selectionId).success) return notFound(c, 'selection');
    const parsed = decideSelectionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, 'Say what the decision is.');
    await decideSelection(
      txOf(c),
      tenantOf(c),
      selectionId,
      parsed.data.decision,
      parsed.data.note ?? '',
    );
    return c.json({ ok: true });
  });

  app.post('/:selectionId/substitutions', async (c) => {
    const selectionId = c.req.param('selectionId');
    if (!z.uuid().safeParse(selectionId).success) return notFound(c, 'selection');
    const parsed = proposeSubstitutionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'That alternative was not saved.');
    }
    return c.json(
      { id: await proposeSubstitution(txOf(c), tenantOf(c), selectionId, parsed.data) },
      201,
    );
  });

  app.onError((error, c) => {
    if (error instanceof SelectionRefused) {
      if (error.message === 'no such selection' || error.message === 'no such substitution') {
        return notFound(c, 'selection');
      }
      return invalid(c, error.message);
    }
    throw error;
  });

  return app;
}

/**
 * Deciding a substitution, mounted apart from the selection it belongs to.
 *
 * A substitution id is enough to find its selection, and a route that also
 * carried the selection id would let the two disagree — which is a way of
 * approving a price change against the wrong item.
 */
export function substitutionRoutes(): Hono {
  const app = new Hono();

  app.post('/:substitutionId/decide', async (c) => {
    const substitutionId = c.req.param('substitutionId');
    if (!z.uuid().safeParse(substitutionId).success) return notFound(c, 'substitution');
    const parsed = decideSubstitutionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, 'Say whether it is approved.');
    return c.json(
      await decideSubstitution(txOf(c), tenantOf(c), substitutionId, parsed.data.approve),
    );
  });

  app.onError((error, c) => {
    if (error instanceof SelectionRefused) {
      if (error.message === 'no such substitution') return notFound(c, 'substitution');
      return invalid(c, error.message);
    }
    throw error;
  });

  return app;
}

// ── 4. Commercial agreement ─────────────────────────────────────────────────

export function agreementRoutes(): Hono {
  const app = new Hono();

  app.get('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    return c.json({ agreement: await getAgreement(txOf(c), projectId) });
  });

  app.put('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    const parsed = saveAgreementInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'That agreement was not saved.');
    }
    await saveAgreement(txOf(c), tenantOf(c), projectId, parsed.data);
    return c.json({ ok: true });
  });

  app.put('/projects/:projectId/stages', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    const parsed = setStagesInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'Those stages were not saved.');
    }
    await setStages(txOf(c), tenantOf(c), projectId, parsed.data.stages);
    return c.json({ ok: true });
  });

  app.post('/projects/:projectId/status', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    const parsed = setAgreementStatusInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, 'Say whether it is issued or signed.');
    await setAgreementStatus(
      txOf(c),
      projectId,
      parsed.data.status,
      parsed.data.signedOn ?? null,
    );
    return c.json({ ok: true });
  });

  app.onError((error, c) => {
    if (error instanceof AgreementRefused) {
      if (error.message === 'no such agreement') return notFound(c, 'agreement');
      return invalid(c, error.message);
    }
    throw error;
  });

  return app;
}

// ── 5. Procurement planning ─────────────────────────────────────────────────

export function procurementPlanRoutes(): Hono {
  const app = new Hono();

  app.get('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    return c.json(await procurementPlan(txOf(c), projectId));
  });

  return app;
}

// ── 6. Joinery packages ─────────────────────────────────────────────────────

export function joineryRoutes(): Hono {
  const app = new Hono();

  app.get('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    return c.json({ items: await listPackages(txOf(c), projectId) });
  });

  app.post('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    const parsed = addPackageInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'That package was not saved.');
    }
    return c.json({ id: await addPackage(txOf(c), tenantOf(c), projectId, parsed.data) }, 201);
  });

  app.post('/stages/:stageId/complete', async (c) => {
    const stageId = c.req.param('stageId');
    if (!z.uuid().safeParse(stageId).success) return notFound(c, 'stage');
    const parsed = advanceStageInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return invalid(c, 'That sign-off was not recorded.');
    return c.json(await advanceStage(txOf(c), tenantOf(c), stageId, parsed.data));
  });

  app.onError((error, c) => {
    if (error instanceof JoineryRefused) {
      if (error.message === 'no such stage') return notFound(c, 'stage');
      return invalid(c, error.message);
    }
    throw error;
  });

  return app;
}

// ── 7. Delivery milestones ──────────────────────────────────────────────────

export function milestoneRoutes(): Hono {
  const app = new Hono();

  /** Every milestone due this India week or already delayed, by project; one project's with `?projectId=`. */
  app.get('/this-week', async (c) => {
    const projectId = c.req.query('projectId');
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    return c.json(await milestonesThisWeek(txOf(c), todayInIndia(new Date()), projectId));
  });

  app.get('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    return c.json({ items: await listMilestones(txOf(c), projectId) });
  });

  app.post('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    const parsed = addMilestoneInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'That milestone was not saved.');
    }
    return c.json({ id: await addMilestone(txOf(c), tenantOf(c), projectId, parsed.data) }, 201);
  });

  app.post('/:milestoneId/progress', async (c) => {
    const milestoneId = c.req.param('milestoneId');
    if (!z.uuid().safeParse(milestoneId).success) return notFound(c, 'milestone');
    const parsed = recordProgressInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, 'Say where the milestone has got to.');
    await recordProgress(txOf(c), milestoneId, parsed.data);
    return c.json({ ok: true });
  });

  app.onError((error, c) => {
    if (error instanceof MilestoneRefused) {
      if (error.message === 'no such milestone') return notFound(c, 'milestone');
      return invalid(c, error.message);
    }
    throw error;
  });

  return app;
}

// ── 8. Handover ─────────────────────────────────────────────────────────────

export function handoverRoutes(): Hono {
  const app = new Hono();

  app.get('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    return c.json(await handoverState(txOf(c), projectId));
  });

  app.post('/projects/:projectId/items', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    const parsed = raiseItemInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'That item was not saved.');
    }
    return c.json({ id: await raiseItem(txOf(c), tenantOf(c), projectId, parsed.data) }, 201);
  });

  app.post('/items/:itemId/rectify', async (c) => {
    const itemId = c.req.param('itemId');
    if (!z.uuid().safeParse(itemId).success) return notFound(c, 'item');
    const parsed = rectifyItemInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(
        c,
        'Rectifying an item needs a photograph of the finished work. A tick is not evidence.',
      );
    }
    await rectifyItem(txOf(c), tenantOf(c), itemId, parsed.data);
    return c.json({ ok: true });
  });

  app.post('/projects/:projectId/issue', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    const parsed = issueHandoverInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return invalid(c, 'That handover was not recorded.');
    return c.json(
      await issueHandover(txOf(c), tenantOf(c), projectId, parsed.data.notes ?? ''),
      201,
    );
  });

  app.onError((error, c) => {
    if (error instanceof HandoverItemRefused) {
      if (error.message === 'no such item') return notFound(c, 'item');
      return invalid(c, error.message);
    }
    throw error;
  });

  return app;
}

// ── 9. Warranty ─────────────────────────────────────────────────────────────

export function warrantyRoutes(): Hono {
  const app = new Hono();

  app.get('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    return c.json({ items: await listCases(txOf(c), projectId) });
  });

  app.post('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    const parsed = raiseCaseInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'That claim was not saved.');
    }
    return c.json({ id: await raiseCase(txOf(c), tenantOf(c), projectId, parsed.data) }, 201);
  });

  app.post('/:caseId/decide', async (c) => {
    const caseId = c.req.param('caseId');
    if (!z.uuid().safeParse(caseId).success) return notFound(c, 'claim');
    const parsed = decideCaseInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, 'Say where the claim has got to.');
    await decideCase(txOf(c), caseId, parsed.data);
    return c.json({ ok: true });
  });

  app.onError((error, c) => {
    if (error instanceof WarrantyRefused) {
      if (error.message === 'no such claim') return notFound(c, 'claim');
      return invalid(c, error.message);
    }
    throw error;
  });

  return app;
}

// ── 10. Design timesheets ───────────────────────────────────────────────────

export function timesheetRoutes(): Hono {
  const app = new Hono();

  app.get('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    return c.json(await timesheets(txOf(c), projectId));
  });

  app.post('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    const parsed = bookTimeInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'That entry was not saved.');
    }
    // Booked against the CALLER. There is no field for whose time it is.
    return c.json({ id: await bookTime(txOf(c), tenantOf(c), projectId, parsed.data) }, 201);
  });

  app.onError((error, c) => {
    if (error instanceof TimesheetRefused) return invalid(c, error.message);
    throw error;
  });

  return app;
}

// ── 11. Client action items ─────────────────────────────────────────────────

export function clientActionRoutes(): Hono {
  const app = new Hono();

  app.get('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    return c.json(await clientActions(txOf(c), projectId));
  });

  app.post('/projects/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c, 'project');
    const parsed = externalDecisionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return invalid(c, parsed.error.issues[0]?.message ?? 'That decision was not recorded.');
    }
    return c.json(
      { id: await recordExternalDecision(txOf(c), tenantOf(c), projectId, parsed.data) },
      201,
    );
  });

  app.onError((error, c) => {
    if (error instanceof ClientActionRefused) return invalid(c, error.message);
    // The decision is applied through the same functions the in-app path uses,
    // so their refusals surface here too rather than being swallowed.
    if (error instanceof DeliverableRefused || error instanceof SelectionRefused) {
      return invalid(c, error.message);
    }
    throw error;
  });

  return app;
}
