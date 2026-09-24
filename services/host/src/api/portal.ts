import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { HTTP_STATUS } from '@cog/contracts';
import { CTX_TENANT, readPage, tenantOf, txOf } from '@cog/service-kit';
import {
  findPrincipalOfKind,
  loadPrincipalScope,
  PrincipalNotFound,
  type PrincipalScope,
} from '@cog/identity';
import { currentTenantName } from '@cog/tenancy';
import {
  getVendor,
  listBillsForVendor,
  listOrdersForVendor,
  orderLinesForVendor,
  recordAcceptance,
  submitBill,
  todayInIndia,
  VendorPortalRefused,
} from '@cog/procurement';
import {
  clientDrawingCount,
  clientProjectSummary,
  clientVariations,
  decideChangeOrder,
  ChangeOrderConflict,
  ChangeOrderNotFound,
} from '@cog/projects';
import { clientSiteProgress } from '@cog/siteops';
import { listClientInvoices, listVendorPayments, receivablesSummary } from '@cog/finance';

/**
 * The portals: a separate route surface for principals who are not staff.
 *
 * **This is the trust boundary M6 is about, and it is a policy, not a screen.**
 * `identity.principals.kind` has carried `vendor` and `client` since migration
 * `0003`, but nothing narrowed such a principal to its own rows — so a vendor
 * login created before this file existed would have seen everything its tenant
 * sees, including every other vendor's pricing. M6.md: *"A `vendor` principal
 * today would see everything its tenant sees. That is the central piece of work
 * in this milestone and it is a policy problem, not a UI problem."*
 *
 * Three properties, and each is here rather than in an app:
 *
 *   1. **A separate prefix.** `/api/v1/portal/...` is the only surface a
 *      non-staff principal may reach. The internal tree carries `requireStaff`,
 *      so a vendor credential presented to `/api/v1/purchase-orders` is refused
 *      — not filtered, refused.
 *   2. **The subject id comes from the LINK, never from the request.** A vendor
 *      cannot name a vendor id and a client cannot name a project id; both are
 *      read from `identity.principal_links` inside the transaction, under RLS.
 *      A route that took the id from the path would be an access control the
 *      caller supplies the input to.
 *   3. **A principal with no link is scoped to nothing**, and every list is
 *      therefore empty rather than unfiltered. The failure direction of a
 *      missing grant is no data, not all data.
 *
 * Composition, so it lives in the host: the entitlement is `identity`'s, the
 * orders are `procurement`'s, the project and its variations are `projects`',
 * the site progress is `siteops`'. No service may import another. **Host
 * orchestrates and does not compute** — every figure below was produced by the
 * service that owns it, and this file does no arithmetic at all.
 */

const CTX_SCOPE = 'portalScope' as const;

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}

function refuse(c: Context, message: string): Response {
  return c.json(
    { code: 'FORBIDDEN' as const, message, requestId: requestId(c) },
    HTTP_STATUS.FORBIDDEN as 403,
  );
}

function notFound(c: Context): Response {
  return c.json(
    { code: 'NOT_FOUND' as const, message: 'Not here.', requestId: requestId(c) },
    HTTP_STATUS.NOT_FOUND as 404,
  );
}

/** A 400 for a page the list cannot honour — the cursor it was given is not one it issued. */
function pageRefused(c: Context, message: string): Response {
  return c.json(
    { code: 'VALIDATION_FAILED' as const, message, requestId: requestId(c) },
    HTTP_STATUS.VALIDATION_FAILED as 400,
  );
}

/**
 * The internal tree is for staff only.
 *
 * Mounted on `/api/v1` **before** the service routes, so it applies to every
 * one of them including any added later. A vendor or client credential is
 * refused with a reason rather than silently returning an empty list — the two
 * are different situations and only one of them is a misconfiguration.
 *
 * `connector` is refused here too: the connector authenticates on its own
 * prefix with a per-tenant key and has no business on a user route.
 */
/**
 * Put the REAL principal kind on the context (COG-01).
 *
 * `principal-resolver.ts` labels every resolved principal `kind: 'staff'`,
 * whatever it is. It has to: the resolver runs before any tenant exists, and
 * `identity.resolve_principal` deliberately returns two ids and nothing else so
 * that the one unscoped query in the system cannot enumerate anybody. The kind
 * is simply not knowable there.
 *
 * **No authorization decision ever read that label** — `requireStaff` and
 * `requireKind` below both load the true kind from the database, inside the
 * tenant context, which is why this was never an escalation. What it was is an
 * AUDIT LOG THAT MISATTRIBUTES WHO DID SOMETHING: `workflow.audit` recorded
 * `actorKind: 'staff'` for a client's action, and `design-build.ts:267`
 * recorded a client's deliverable review as `reviewerKind: 'internal'`.
 *
 * Latent while the only non-staff principals came from the demo seed. Migration
 * `0080` made it reachable in production, because a tenant admin can now mint a
 * client login from the settings screen.
 *
 * **Corrected here rather than at the resolver**, which would mean widening
 * `resolve_principal` — forbidden by its own comment in migration `0003`, and
 * rightly — or moving where the single `TenantContext` is constructed, which is
 * ADR-0006 blast radius. Both middlewares below already hold the answer, so
 * this costs no extra query: it writes back the context they have just proved.
 */
function correctPrincipalKind(c: Context, scope: PrincipalScope): void {
  const ctx = tenantOf(c);
  if (ctx.principal.kind === scope.kind) return;
  c.set(CTX_TENANT, {
    ...ctx,
    principal: { ...ctx.principal, kind: scope.kind },
  });
}

export function requireStaff(): MiddlewareHandler {
  return async (c, next) => {
    const ctx = tenantOf(c);
    let scope: PrincipalScope;
    try {
      scope = await loadPrincipalScope(txOf(c), ctx.principal.id);
    } catch (error) {
      if (error instanceof PrincipalNotFound) return refuse(c, 'That principal is not here.');
      throw error;
    }
    if (scope.disabled) return refuse(c, 'That account is disabled.');
    if (scope.kind !== 'staff') {
      return refuse(
        c,
        `This is the staff application. A ${scope.kind} account signs in at its own portal.`,
      );
    }
    correctPrincipalKind(c, scope);
    await next();
  };
}

/** Every portal route runs behind this: the kind is checked, the scope is loaded. */
function requireKind(kind: 'vendor' | 'client'): MiddlewareHandler {
  return async (c, next) => {
    const ctx = tenantOf(c);
    let scope: PrincipalScope;
    try {
      scope = await loadPrincipalScope(txOf(c), ctx.principal.id);
    } catch (error) {
      if (error instanceof PrincipalNotFound) return refuse(c, 'That principal is not here.');
      throw error;
    }
    if (scope.disabled) return refuse(c, 'That account is disabled.');
    if (scope.kind !== kind) {
      return refuse(c, `This portal is for ${kind} accounts.`);
    }
    // The audit trail says `client` for a client from here on, not `staff`.
    correctPrincipalKind(c, scope);
    c.set(CTX_SCOPE, scope);
    await next();
  };
}

function scopeOf(c: Context): PrincipalScope {
  const scope: unknown = c.get(CTX_SCOPE);
  if (scope === undefined) {
    // Unreachable through the router: `requireKind` sets it on every route
    // below. Thrown rather than defaulted, because a default here would be a
    // scope nobody granted.
    throw new Error('portal scope was not resolved; requireKind did not run');
  }
  return scope as PrincipalScope;
}

const acceptanceInput = z.object({
  decision: z.enum(['accepted', 'rejected']),
  remarks: z.string().max(2000).optional(),
});

const billInput = z.object({
  purchaseOrderId: z.uuid(),
  billNumber: z.string().min(1).max(64),
  amountClaimed: z.string().regex(/^[1-9][0-9]*$/, 'a claim must be a positive amount of paise'),
  periodFrom: z.iso.date().optional(),
  periodTo: z.iso.date().optional(),
  narrative: z.string().max(4000).optional(),
});

const clientDecisionInput = z.object({
  decision: z.enum(['approve', 'reject']),
  signedBy: z.string().min(1).max(200),
  expectedVersion: z.number().int().min(1),
});

export function portalRoutes(): Hono {
  const app = new Hono();

  /**
   * Who is signed in, for the portal's bar and head: identity says which
   * kind and which subjects, procurement names the vendor, projects name the
   * client's projects, tenancy names the firm. Staff are refused — a portal
   * whoami answered to a staff credential would be a staff screen wearing
   * the portal's chrome.
   */
  app.get('/whoami', async (c) => {
    const tx = txOf(c);
    const ctx = tenantOf(c);
    let scope: PrincipalScope;
    try {
      scope = await loadPrincipalScope(tx, ctx.principal.id);
    } catch (error) {
      if (error instanceof PrincipalNotFound) return refuse(c, 'That principal is not here.');
      throw error;
    }
    if (scope.kind !== 'vendor' && scope.kind !== 'client') return refuse(c, 'This is a portal, and that login is not a portal login.');
    const person = await findPrincipalOfKind(tx, scope.kind, scope.principalId);
    const firm = await currentTenantName(tx);
    if (scope.kind === 'vendor') {
      const vendorId = scope.subjectIds[0];
      const vendor = vendorId === undefined ? null : await getVendor(tx, vendorId).catch(() => null);
      return c.json({
        kind: 'vendor' as const,
        name: person?.displayName ?? person?.email ?? '',
        email: person?.email ?? '',
        organisation: vendor?.name ?? '',
        firm,
        projects: [],
      });
    }
    const projects = [];
    for (const projectId of scope.subjectIds) {
      const project = await clientProjectSummary(tx, projectId);
      if (project !== null) projects.push({ id: project.id, name: project.name });
    }
    return c.json({
      kind: 'client' as const,
      name: person?.displayName ?? person?.email ?? '',
      email: person?.email ?? '',
      organisation: (await clientProjectSummary(tx, scope.subjectIds[0] ?? ''))?.clientName ?? '',
      firm,
      projects,
    });
  });

  // ------------------------------------------------------------- vendor ----

  const vendor = new Hono();
  vendor.use('*', requireKind('vendor'));

  /**
   * Every order issued to this vendor, and no others.
   *
   * The ids come from the scope. A vendor linked to nothing sees an empty list,
   * which is the correct answer to "show me my orders" when nobody has said
   * which vendor they are.
   */
  vendor.get('/orders', async (c) => {
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    const paged = await listOrdersForVendor(txOf(c), scopeOf(c).subjectIds, page);
    return c.json({
      items: paged.items,
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: paged.count,
    });
  });

  vendor.get('/orders/:orderId/lines', async (c) => {
    const orderId = c.req.param('orderId');
    if (!z.uuid().safeParse(orderId).success) return notFound(c);

    const tx = txOf(c);
    for (const vendorId of scopeOf(c).subjectIds) {
      const lines = await orderLinesForVendor(tx, vendorId, orderId);
      if (lines !== null) return c.json({ items: lines });
    }
    // Not "forbidden": a vendor asking about an order that is not theirs learns
    // nothing about whether it exists.
    return notFound(c);
  });

  /** Accept or reject an order. Append-only — a later answer does not overwrite. */
  vendor.post('/orders/:orderId/acceptance', async (c) => {
    const orderId = c.req.param('orderId');
    if (!z.uuid().safeParse(orderId).success) return notFound(c);

    const parsed = acceptanceInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: 'accepted or rejected, and nothing else.',
          requestId: requestId(c),
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }

    const scope = scopeOf(c);
    const vendorId = scope.subjectIds[0];
    if (vendorId === undefined) return refuse(c, 'This account is not linked to a vendor.');

    const recorded = await recordAcceptance(txOf(c), tenantOf(c), {
      vendorId,
      purchaseOrderId: orderId,
      decision: parsed.data.decision,
      ...(parsed.data.remarks === undefined ? {} : { remarks: parsed.data.remarks }),
    });
    return c.json(recorded, 201);
  });

  vendor.get('/bills', async (c) => {
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    const paged = await listBillsForVendor(txOf(c), scopeOf(c).subjectIds, page);
    return c.json({
      items: paged.items,
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: paged.count,
    });
  });

  /**
   * Payments to this vendor: what was paid against which bill, what was
   * deducted and what was withheld. Every row says whether a value behind it is
   * still provisional (ADR-0014, addendum). Narrowed to the vendors this login
   * is linked to, like every vendor read; another vendor's payments are simply
   * not in the list.
   */
  vendor.get('/payments', async (c) => {
    const page = readPage(c);
    if ('error' in page) return pageRefused(c, page.error);
    const paged = await listVendorPayments(txOf(c), page, { vendorIds: scopeOf(c).subjectIds });
    return c.json({
      items: paged.items.map((p) => ({
        id: p.id,
        number: p.number,
        kind: p.kind,
        billNumber: p.billNumber,
        paidOn: p.paidOn,
        reference: p.reference,
        grossAmount: p.grossAmount,
        tdsSection: p.tdsSection,
        tdsRateBp: p.tdsRateBp,
        tdsAmount: p.tdsAmount,
        tdsReason: p.tdsReason,
        retentionWithheld: p.retentionWithheld,
        netPaid: p.netPaid,
        provisional: p.provisional,
      })),
      nextCursor: paged.nextCursor,
      prevCursor: paged.prevCursor,
      count: paged.count,
    });
  });

  /**
   * Submit a running-account bill.
   *
   * The claim is stored exactly as sent. **Nothing derives from it** — no TDS,
   * no netting, no approved amount — because those are CA-01..CA-08 and the
   * rules behind them are unverified. The wire string is passed straight to
   * procurement, which parses it: this file has no `@cog/money` dependency and
   * therefore cannot handle a monetary value even to convert one.
   */
  vendor.post('/bills', async (c) => {
    const parsed = billInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: parsed.error.issues[0]?.message ?? 'That bill was not accepted.',
          requestId: requestId(c),
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }

    const vendorId = scopeOf(c).subjectIds[0];
    if (vendorId === undefined) return refuse(c, 'This account is not linked to a vendor.');

    const submitted = await submitBill(txOf(c), tenantOf(c), {
      vendorId,
      purchaseOrderId: parsed.data.purchaseOrderId,
      billNumber: parsed.data.billNumber,
      amountClaimedWire: parsed.data.amountClaimed,
      ...(parsed.data.periodFrom === undefined ? {} : { periodFrom: parsed.data.periodFrom }),
      ...(parsed.data.periodTo === undefined ? {} : { periodTo: parsed.data.periodTo }),
      ...(parsed.data.narrative === undefined ? {} : { narrative: parsed.data.narrative }),
    });
    return c.json(submitted, 201);
  });

  app.route('/vendor', vendor);

  // ------------------------------------------------------------- client ----

  const client = new Hono();
  client.use('*', requireKind('client'));

  /**
   * Progress 360: the client's own projects, with what is happening on site.
   *
   * Composition of three services and **no money beyond the contract value the
   * client itself signed**. There is no committed spend, no BOQ cost, no
   * margin, and no billing percentage — the legacy computes the last of those
   * as billed over contract and caps it at 100, so an over-billed project reads
   * as exactly complete.
   */
  /**
   * What the server resolved this caller to be.
   *
   * The internal tree has had one of these since M1 for the same reason: it
   * proves the middleware ran and says what it decided, which is what you want
   * when diagnosing a 403 in an environment nobody can attach a debugger to.
   *
   * It is also the only place COG-01 is observable. `principal-resolver.ts`
   * labels every principal `staff`; `requireKind` corrects that from the
   * database. Without an endpoint that echoes the resolved kind, the correction
   * can only be tested through something that happens to record it — and today
   * no portal route writes an audit row, so there is nothing to look at.
   */
  client.get('/whoami', (c) => {
    const ctx = tenantOf(c);
    return c.json({
      principalId: ctx.principal.id,
      principalKind: ctx.principal.kind,
      requestId: ctx.requestId,
    });
  });

  client.get('/projects', async (c) => {
    const tx = txOf(c);
    const items = [];
    for (const projectId of scopeOf(c).subjectIds) {
      const project = await clientProjectSummary(tx, projectId);
      if (project === null) continue; // a link to a project that is gone grants nothing
      const [drawings, site] = await Promise.all([
        clientDrawingCount(tx, projectId),
        clientSiteProgress(tx, projectId),
      ]);
      items.push({
        ...project,
        drawingsIssued: drawings,
        reportedDays: site.reportedDays,
        lastReportOn: site.lastReportOn,
        measurementsRecorded: site.measurementsRecorded,
      });
    }
    return c.json({ items });
  });

  client.get('/projects/:projectId/variations', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);
    if (!scopeOf(c).subjectIds.includes(projectId)) return notFound(c);
    return c.json({ items: await clientVariations(txOf(c), projectId) });
  });

  /**
   * Billing for the client's OWN project: its tax invoices, what was received
   * and what is still due. A project this login is not linked to is not found.
   * Each invoice says whether its rate is still provisional (ADR-0014,
   * addendum). Bounded at 200 invoices — a project's running bills.
   */
  client.get('/projects/:projectId/billing', async (c) => {
    const projectId = c.req.param('projectId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);
    if (!scopeOf(c).subjectIds.includes(projectId)) return notFound(c);
    const tx = txOf(c);
    const invoices = await listClientInvoices(tx, { limit: 200, cursor: null, before: false }, { projectIds: [projectId] });
    const summary = await receivablesSummary(tx, todayInIndia(new Date()), { projectIds: [projectId] });
    return c.json({
      invoices: invoices.items.map((i) => ({
        id: i.id,
        number: i.number,
        invoiceDate: i.invoiceDate,
        expectedOn: i.expectedOn,
        certifiedOn: i.certifiedOn,
        description: i.description,
        taxable: i.taxable,
        cgst: i.cgst,
        sgst: i.sgst,
        igst: i.igst,
        roundOff: i.roundOff,
        total: i.total,
        received: i.received,
        balance: i.balance,
        provisional: i.provisional,
        state: i.state,
      })),
      invoiced: summary.invoiced,
      received: summary.received,
      balance: summary.balance,
    });
  });

  /**
   * Sign off a variation.
   *
   * The decision goes to `decideChangeOrder` — projects' own rule — so the
   * client path and the staff path record a decision the same way, once, with
   * the same refusal on a second attempt (CO-04).
   */
  client.post('/projects/:projectId/variations/:changeOrderId/decide', async (c) => {
    const projectId = c.req.param('projectId');
    const changeOrderId = c.req.param('changeOrderId');
    if (!z.uuid().safeParse(projectId).success) return notFound(c);
    if (!z.uuid().safeParse(changeOrderId).success) return notFound(c);
    if (!scopeOf(c).subjectIds.includes(projectId)) return notFound(c);

    const parsed = clientDecisionInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: 'A decision, a signatory and the version you are deciding on.',
          requestId: requestId(c),
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }

    const decided = await decideChangeOrder(
      txOf(c),
      changeOrderId,
      parsed.data.decision,
      parsed.data.signedBy,
      parsed.data.expectedVersion,
    );
    return c.json(decided);
  });

  app.route('/client', client);

  app.onError((error, c) => {
    if (error instanceof VendorPortalRefused) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    if (error instanceof ChangeOrderNotFound) return notFound(c);
    if (error instanceof ChangeOrderConflict) {
      return c.json(
        { code: 'CONFLICT' as const, message: error.message, requestId: requestId(c) },
        HTTP_STATUS.CONFLICT as 409,
      );
    }
    throw error;
  });

  return app;
}
