import { Hono, type Context } from 'hono';
import {
  CONNECTOR_HEADERS,
  CONNECTOR_UPGRADE_REQUIRED_STATUS,
  HTTP_STATUS,
  type TenantId,
  type Voucher,
  voucherResultRequest,
} from '@cog/contracts';

/**
 * `/connector/v1` — the cloud side of the Tally connector contract.
 *
 * Implemented against the contract **as frozen**. Four recommended changes are
 * open as `HUMAN(CONNECTOR-01..04)` in `packages/contracts/src/connector.ts`
 * and `docs/connector/OPEN-QUESTIONS.md`; none is applied here, because another
 * session is coding against the frozen shape.
 *
 * Dependencies arrive as ports. `services/finance` may not import
 * `services/tenancy`, so resolving a bearer key to a tenant is a port the API
 * host wires up — the same pattern `services/identity` uses for
 * `TenantConfigReader`.
 */

/** Resolves a connector key to the tenant it belongs to. Tenancy owns the keys. */
export interface ConnectorAuthenticator {
  /** Returns null for an unknown, revoked or expired key. Never throws for those. */
  authenticate(
    presentedKey: string,
  ): Promise<{ tenantId: TenantId; keyId: string } | null>;
}

export interface VoucherResult {
  readonly status: 'posted' | 'failed';
  // `| undefined` rather than a bare optional: under exactOptionalPropertyTypes
  // "the key may be absent" and "the key may be present and undefined" are
  // different types, and a Zod-parsed body is the second. Widening here rather
  // than casting at the call site keeps the difference visible.
  readonly tallyVoucherId?: string | undefined;
  readonly error?: { code: string; message: string } | undefined;
}

export interface VoucherQueue {
  /**
   * Lease and return pending vouchers, oldest first.
   *
   * `instanceId` is null when the connector omits `X-Connector-Instance`, which
   * the frozen contract permits and which yields the old unleased behaviour.
   * See CONNECTOR-04 — that carve-out re-opens the double-post hole and exists
   * for a population of zero deployed connectors.
   */
  claim(
    tenantId: TenantId,
    limit: number,
    instanceId: string | null,
    leaseSeconds: number,
  ): Promise<readonly Voucher[]>;

  /** Idempotent: the same id may be reported more than once. */
  report(tenantId: TenantId, voucherId: string, result: VoucherResult): Promise<void>;

  /** Records that an instance was seen, for the support question "is it running?". */
  touchInstance(
    tenantId: TenantId,
    instanceId: string | null,
    version: string | null,
  ): Promise<void>;
}

export interface ConnectorDeps {
  readonly auth: ConnectorAuthenticator;
  readonly queue: VoucherQueue;
  readonly minConnectorVersion: string;
  readonly leaseSeconds: number;
  readonly now?: () => Date;
}

/** Compare dotted numeric versions. Returns <0, 0 or >0. */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string): number[] =>
    (/^(\d+)\.(\d+)\.(\d+)/.exec(v)?.slice(1, 4) ?? []).map(Number);
  const [pa, pb] = [parse(a), parse(b)];
  if (pa.length !== 3 || pb.length !== 3) return Number.NaN;
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] as number) - (pb[i] as number);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function connectorRoutes(deps: ConnectorDeps): Hono {
  const app = new Hono();
  const now = deps.now ?? (() => new Date());

  const bearer = (header: string | undefined): string | null => {
    if (header === undefined) return null;
    const m = /^Bearer (.+)$/.exec(header);
    return m === null ? null : (m[1] as string);
  };

  /**
   * Health.
   *
   * Deliberately NOT version-gated. This is how a connector that is too old
   * discovers what to upgrade to — gating it would strand the very builds it
   * exists to rescue, on machines we do not control (ADR-0004).
   */
  app.get('/health', async (c) => {
    const key = bearer(c.req.header('authorization'));
    if (key === null) return unauthorized(c);
    const principal = await deps.auth.authenticate(key);
    if (principal === null) return unauthorized(c);

    await deps.queue.touchInstance(
      principal.tenantId,
      c.req.header(CONNECTOR_HEADERS.instance) ?? null,
      c.req.header(CONNECTOR_HEADERS.version) ?? null,
    );

    return c.json({ ok: true as const, minConnectorVersion: deps.minConnectorVersion });
  });

  app.get('/vouchers', async (c) => {
    const key = bearer(c.req.header('authorization'));
    if (key === null) return unauthorized(c);
    const principal = await deps.auth.authenticate(key);
    if (principal === null) return unauthorized(c);

    const version = c.req.header(CONNECTOR_HEADERS.version);
    const gate = versionGate(version, deps.minConnectorVersion);
    if (gate !== null) return c.json(gate, CONNECTOR_UPGRADE_REQUIRED_STATUS as 426);

    const instanceId = c.req.header(CONNECTOR_HEADERS.instance) ?? null;
    await deps.queue.touchInstance(principal.tenantId, instanceId, version ?? null);

    // Clamp rather than trust. An unbounded limit is a denial-of-service
    // parameter the caller controls, and every row costs a policy evaluation.
    const requested = Number(c.req.query('limit') ?? 50);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 50) : 50;

    const vouchers = await deps.queue.claim(
      principal.tenantId,
      limit,
      instanceId,
      deps.leaseSeconds,
    );

    return c.json({
      vouchers,
      serverTime: now().toISOString(),
      leaseSeconds: deps.leaseSeconds,
    });
  });

  app.post('/vouchers/:id/result', async (c) => {
    const key = bearer(c.req.header('authorization'));
    if (key === null) return unauthorized(c);
    const principal = await deps.auth.authenticate(key);
    if (principal === null) return unauthorized(c);

    // NOT version-gated, deliberately.
    //
    // A result is a fact about what happened in Tally, not a request for
    // service. Refusing it because the connector is old would strand a voucher
    // that is already posted and cause the cloud to re-offer it — turning an
    // upgrade prompt into a duplicate in a book of account.
    const parsed = voucherResultRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: 'The result payload is not valid.',
          requestId: c.req.header('x-request-id') ?? 'unknown',
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }

    await deps.queue.report(principal.tenantId, c.req.param('id'), parsed.data);
    return c.json({ ok: true as const });
  });

  return app;
}

function unauthorized(c: Context): Response {
  return c.json(
    {
      code: 'AUTH_INVALID' as const,
      message: 'That connector key is not valid.',
      requestId: c.req.header('x-request-id') ?? 'unknown',
    },
    HTTP_STATUS.AUTH_INVALID as 401,
  );
}

interface UpgradeBody {
  readonly code: 'CONNECTOR_UPGRADE_REQUIRED';
  readonly message: string;
  readonly minConnectorVersion: string;
  readonly currentVersion: string | null;
}

/** Null when the connector may proceed. */
function versionGate(presented: string | undefined, minimum: string): UpgradeBody | null {
  const comparison = presented === undefined ? Number.NaN : compareSemver(presented, minimum);
  if (Number.isNaN(comparison) || comparison < 0) {
    return {
      code: 'CONNECTOR_UPGRADE_REQUIRED',
      message: `This connector is older than the minimum supported version (${minimum}). Please upgrade.`,
      minConnectorVersion: minimum,
      currentVersion: presented ?? null,
    };
  }
  return null;
}
