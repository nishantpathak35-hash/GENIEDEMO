import { Hono } from 'hono';
import type pg from 'pg';
import {
  createLogger,
  databaseCheck,
  liveness,
  readiness,
  tenantMiddleware,
  toErrorResponse,
  type Logger,
  type PrincipalResolver,
} from '@cog/service-kit';
import {
  projectRoutes,
  briefRoutes,
  deliverableRoutes,
  selectionRoutes,
  substitutionRoutes,
  agreementRoutes,
  procurementPlanRoutes,
  joineryRoutes,
  milestoneRoutes,
  handoverRoutes,
  warrantyRoutes,
  timesheetRoutes,
  clientActionRoutes,
  listTradePackages,
} from '@cog/projects';
import { identityRoutes } from '@cog/identity';
import { siteopsRoutes } from '@cog/siteops';
import { tenancyRoutes } from '@cog/tenancy';
import { workflowRoutes } from '@cog/workflow';
import { purchaseOrderRoutes } from '@cog/procurement';
import { connectorRoutes, type ConnectorAuthenticator, type VoucherQueue } from '@cog/finance';
import { approvalRoutes } from './api/approvals.js';
import { todayRoutes } from './api/today.js';
import { chainRoutes } from './api/chains.js';
import { teamRoutes } from './api/team.js';
import { commentRoutes } from './api/comments.js';
import { moduleRoutes, moduleGate, externalDecisionGate } from './api/modules.js';
import { numberSeriesRoutes } from './api/number-series.js';
import { tradePackageRoutes } from './api/trade-packages.js';
import { companyRoutes } from './api/company.js';
import { peopleRoutes } from './api/people.js';
import { financeRoutes } from '@cog/finance';
import { moneyRoutes } from './api/money.js';
import { shellRoutes } from './api/shell.js';
import { vendorDeclarationRoutes } from './api/vendor-declarations.js';
import { portalRoutes, requireStaff } from './api/portal.js';
import { inviteRoutes } from './api/invite.js';
import { platformRoutes } from './api/platform.js';

/**
 * The composition root.
 *
 * The one place permitted to import every service — `apps` may not, and no
 * service may import another. `services/host` is deliberately absent from the
 * `SERVICES` array in `eslint.config.mjs`, and that absence is the mechanism.
 *
 * Building the app is separated from starting the server so a test can drive
 * the real router — with the real middleware — rather than a hand-assembled
 * imitation of it. That distinction matters: a test-only `setTenant` helper
 * proves the wrapper works and proves nothing about the wiring, and the wiring
 * is what somebody gets wrong by mounting a route one line above the middleware.
 */

/**
 * Prefixes that sit behind the tenant middleware.
 *
 * Exported so the route audit can check against it rather than re-deriving it
 * from the same wiring it exists to verify.
 */
export const TENANT_SCOPED_PREFIXES = ['/api/v1'] as const;

export interface AppOptions {
  readonly pool: pg.Pool;
  readonly resolver: PrincipalResolver;
  readonly logger?: Logger;
  /**
   * Whether statutory outputs computed from provisional rows are produced as
   * drafts (ADR-0014, addendums). Only `'draft'` produces them; absent refuses
   * them with `PROVISIONAL_OUTPUT_REFUSED`. Read from `STATUTORY_OUTPUTS` once,
   * in `index.ts`, and passed here — so a process nobody configured refuses,
   * and a test states which world it is in rather than inheriting one.
   */
  readonly statutoryOutputs?: 'draft';
  /**
   * The back office. Absent means `/platform/v1` is not mounted at all, which
   * is the correct state for a deployment that does not serve it — an
   * unmounted route cannot be misconfigured.
   */
  readonly platform?: {
    readonly verify: (request: Request) => Promise<{ externalId: string } | null>;
    /** Provisioning attempts per minute, per process. Default 10, floor 1. */
    readonly provisionAttemptLimit?: number | undefined;
  };
  /**
   * Invitation redemption. Absent means `/invite/v1` is not mounted, the same
   * shape as `platform` — a deployment that does not redeem invitations should
   * not carry the one route that runs before a principal exists.
   */
  readonly invite?: {
    readonly verify: (request: Request) => Promise<{ externalId: string } | null>;
  };
  readonly connector?: {
    readonly auth: ConnectorAuthenticator;
    readonly queue: VoucherQueue;
    readonly minConnectorVersion: string;
    readonly leaseSeconds: number;
  };
}

export function createApp(options: AppOptions): Hono {
  const logger = options.logger ?? createLogger();
  const app = new Hono();

  // --- tenantless, and each for a stated reason ------------------------

  // Liveness. Touches no dependency: a probe that checks Postgres restarts
  // every container when Postgres blips, turning a recoverable hiccup into an
  // outage.
  // **Nothing this server answers may be cached, anywhere, by anything.**
  //
  // Every route below `/healthz` returns one tenant's data, resolved from the
  // caller's credential — so two people hitting the same URL must get different
  // bodies, and a cache that does not know that will hand one of them the
  // other's. Absent a header a shared cache is entitled to store an
  // authenticated response heuristically, which is why "we send no
  // `Cache-Control`" is not the same as "nothing is cached".
  //
  // The repaired legacy reached the same conclusion from the other end and
  // fixed one case — its handover records that "private attachment responses
  // are no longer publicly cacheable". A per-route header is a rule somebody
  // has to remember on the nineteenth route, so this is set once, for every
  // response, and a route that genuinely wants to be cached will have to
  // override it and say why.
  app.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('Vary', 'Authorization');
  });

  app.get('/healthz', (c) => c.json(liveness()));

  // Readiness. Checks dependencies AND that the runtime role is neither a
  // superuser nor BYPASSRLS — the condition under which every policy is inert.
  app.get('/readyz', async (c) => {
    const report = await readiness([databaseCheck(options.pool)]);
    return c.json(report, report.status === 'ok' ? 200 : 503);
  });

  // The connector resolves its tenant from a per-tenant bearer key inside its
  // own handlers, not from a user principal. A third case, named rather than
  // exempted.
  if (options.connector !== undefined) {
    app.route('/connector/v1', connectorRoutes(options.connector));
  }

  // Redeeming an invitation, before the redeemer has a principal to resolve.
  //
  // Deliberately NOT under `/api/v1`: that prefix is `TENANT_SCOPED_PREFIXES`,
  // so a route mounted there counts as protected by the audit whether or not it
  // sits behind the middleware. A tenantless route on a tenantless prefix has
  // to be allowlisted by name, which is the check working rather than being
  // satisfied.
  if (options.invite !== undefined) {
    app.route('/invite/v1', inviteRoutes({ pool: options.pool, verify: options.invite.verify }));
  }

  // The back office, outside every tenant. A platform principal belongs to no
  // tenant, so no context is set — and because none is set, every tenant-scoped
  // policy denies this connection by construction.
  if (options.platform !== undefined) {
    app.route(
      '/platform/v1',
      platformRoutes({
        pool: options.pool,
        verify: options.platform.verify,
        ...(options.platform.provisionAttemptLimit === undefined
          ? {}
          : { provisionAttemptLimit: options.platform.provisionAttemptLimit }),
      }),
    );
  }

  // --- everything else is tenant-scoped --------------------------------

  const api = new Hono();
  api.use('*', tenantMiddleware({ pool: options.pool, resolver: options.resolver, logger }));

  // THE PORTALS ARE MOUNTED FIRST, AND ON THEIR OWN SUB-APP.
  //
  // `/api/v1/portal/...` is the only surface a non-staff principal may reach.
  // It carries its own guard — `requireKind` — which loads the principal's
  // entitlement inside the transaction and narrows every read to the vendor or
  // project it names.
  api.route('/portal', portalRoutes());

  // EVERYTHING ELSE IS STAFF ONLY, and the guard is on the sub-app rather than
  // on `api`, so it cannot also apply to the portal above — and so a service
  // route added later is behind it by construction rather than by remembering.
  //
  // A vendor credential presented here is REFUSED, not filtered to nothing:
  // "you are not staff" and "you have no data" are different situations, and
  // only one of them is a misconfiguration worth telling somebody about.
  const internal = new Hono();
  internal.use('*', requireStaff());
  // **The composition root answering a question procurement cannot.**
  //
  // `trade_code` on a rate-contract item or a purchase-order line is a soft
  // reference to `projects.trade_packages.code` — no foreign key, because the
  // two schemas belong to two services whose migrations must stay independent.
  // Nothing checked it until this line existed, so a typo produced no contract
  // match and the deviation list reported it as "measured against nothing"
  // rather than as a mistake.
  //
  // procurement declares the port; only here can it be satisfied, because this
  // is the one module permitted to import both services. The boundary is
  // intact in both directions: procurement still imports no other service, and
  // `resolveContractedRate` still reads only procurement's own tables.
  internal.route(
    '/purchase-orders',
    purchaseOrderRoutes({
      knownCodes: async (tx) =>
        new Set((await listTradePackages(tx)).map((pkg) => pkg.code.toUpperCase())),
    }),
  );
  internal.route('/projects', projectRoutes());
  internal.route('/workflow', workflowRoutes());
  internal.route('/siteops', siteopsRoutes());
  internal.route('/identity', identityRoutes());
  internal.route('/tenancy', tenancyRoutes());
  internal.route('/finance', financeRoutes());
  // Composition: the approval engine is workflow's, the aggregate is
  // procurement's, and only the host may import both (M1/D5).
  internal.route('/', approvalRoutes());
  // Today's hero and stats: four services, one screen. Composition again.
  internal.route('/', todayRoutes());
  internal.route('/', shellRoutes());
  internal.route('/', chainRoutes());
  internal.route('/', teamRoutes());
  internal.route('/', commentRoutes());
  internal.route('/', moduleRoutes());
  internal.route('/', numberSeriesRoutes());
  internal.route('/', tradePackageRoutes());
  internal.route('/', companyRoutes());
  internal.route('/', peopleRoutes());
  // Paying vendors: procurement's bill, tenancy's answers, finance's rules.
  internal.route('/', moneyRoutes({ draftStatutoryOutputs: options.statutoryOutputs === 'draft' }));
  // A transporter's declaration: procurement's record, workflow's evidence.
  internal.route('/', vendorDeclarationRoutes());
  // ── the eleven design-build workflows —
  //
  // **Each one is behind its own gate, and every gate defaults to OFF.**
  // A tenant that has not switched a module on gets 404 from all of its
  // routes — not 403, because a module nobody enabled has no permission
  // question to answer and a 403 would confirm the feature exists.
  //
  // The gate is applied HERE rather than inside each handler, for the same
  // reason `requireStaff` is on the sub-app: a route added later is behind
  // it by construction instead of by somebody remembering. It is also the
  // only place it CAN be applied — whether a module is on lives in
  // `services/tenancy`, and `services/projects` may not read it (M1/D5).
  const designBuild = new Hono();
  designBuild.use('/brief/*', moduleGate('design_brief'));
  designBuild.route('/brief', briefRoutes());
  designBuild.use('/deliverables/*', moduleGate('design_deliverables'));
  designBuild.route('/deliverables', deliverableRoutes());
  designBuild.use('/selections/*', moduleGate('room_selections'));
  designBuild.route('/selections', selectionRoutes());
  // Deciding a substitution is part of the selections module: it changes a
  // selection's price. Gated on the same key, mounted apart so a
  // substitution id cannot be paired with the wrong selection id.
  designBuild.use('/substitutions/*', moduleGate('room_selections'));
  designBuild.route('/substitutions', substitutionRoutes());
  designBuild.use('/agreement/*', moduleGate('commercial_agreement'));
  designBuild.route('/agreement', agreementRoutes());
  designBuild.use('/procurement-plan/*', moduleGate('procurement_plan'));
  designBuild.route('/procurement-plan', procurementPlanRoutes());
  designBuild.use('/joinery/*', moduleGate('joinery_packages'));
  designBuild.route('/joinery', joineryRoutes());
  designBuild.use('/milestones/*', moduleGate('delivery_milestones'));
  designBuild.route('/milestones', milestoneRoutes());
  designBuild.use('/handover/*', moduleGate('handover'));
  designBuild.route('/handover', handoverRoutes());
  designBuild.use('/warranty/*', moduleGate('warranty'));
  designBuild.route('/warranty', warrantyRoutes());
  designBuild.use('/timesheets/*', moduleGate('design_timesheets'));
  designBuild.route('/timesheets', timesheetRoutes());
  designBuild.use('/client-actions/*', moduleGate('client_actions'));
  // Recording a decision here APPLIES it in whichever module owns the
  // subject, so that module has to be on too. Gating the prefix is not
  // enough when the write lands somewhere the prefix does not name.
  designBuild.use('/client-actions/*', externalDecisionGate());
  designBuild.route('/client-actions', clientActionRoutes());
  internal.route('/design-build', designBuild);

  api.route('/', internal);

  app.route('/api/v1', api);

  app.onError((error, c) => {
    const requestId = c.req.header('x-request-id') ?? 'unknown';
    const { status, body } = toErrorResponse(error, requestId, logger);
    return c.json(body, status as 500);
  });

  return app;
}
