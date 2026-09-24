import type { Page } from '@cog/contracts';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';

/**
 * Tenant provisioning, as an operation rather than a script.
 *
 * `seed.mjs` does five things by hand and each is a requirement in disguise:
 * a tenant row inside a tenant context, a first principal, the lookup that
 * makes them resolvable, a slug and an app origin, and the runtime role's
 * login. The first four are here; the fifth is infrastructure, not a product
 * operation, and belongs to Terraform.
 *
 * **Every query goes through a SECURITY DEFINER function**, and this module
 * does not touch a table directly. That is the mechanism rather than a style:
 * `app_runtime` has no grant on `tenancy.platform_principals` at all, so the
 * runtime cannot read who the platform accounts are even if a bug asked it to.
 */

export interface TxLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

export class ProvisioningRefused extends Error {
  override readonly name = 'ProvisioningRefused';
}

/** Resolves a credential to a platform principal, or to nobody. */
export async function resolvePlatformPrincipal(
  tx: TxLike,
  externalId: string,
): Promise<string | null> {
  const rows = await tx.query<{ principal_id: string }>(
    'SELECT principal_id FROM tenancy.resolve_platform_principal($1)',
    [externalId],
  );
  return rows[0]?.principal_id ?? null;
}

export interface TenantRecord {
  readonly id: string;
  readonly slug: string;
  readonly legalName: string;
  readonly appOrigin: string | null;
  readonly createdAt: string;
  readonly plan: string | null;
  readonly connectorLastSeenAt: string | null;
  readonly lastPostedAt: string | null;
  readonly lastActiveAt: string | null;
}

/**
 * Every organisation on this deployment, newest first.
 *
 * The SECURITY DEFINER function `tenancy.list_tenants` does the privilege
 * check; this wraps its result set in an ordinary outer `WHERE`/`ORDER BY`/
 * `LIMIT` for the keyset window, which Postgres allows over any set-returning
 * function the same as over a table.
 */
export async function listTenants(
  tx: TxLike,
  requestedBy: string,
  page: PageQuery,
): Promise<Page<TenantRecord>> {
  const k = keyset(page, 'created_at', 'id', 'timestamptz', true, 2);
  const rows = await tx.query<{
    id: string;
    slug: string;
    legal_name: string;
    app_origin: string | null;
    created_at: string;
    plan: string | null;
    connector_last_seen_at: string | null;
    last_posted_at: string | null;
    last_active_at: string | null;
  }>(
    `SELECT id, slug, legal_name, app_origin, created_at::text AS created_at, plan,
            connector_last_seen_at::text AS connector_last_seen_at,
            last_posted_at::text AS last_posted_at,
            last_active_at::text AS last_active_at
       FROM tenancy.list_tenants($1)
      WHERE ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${1 + k.params.length + 1}`,
    [requestedBy, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM tenancy.list_tenants($1)`,
    [requestedBy],
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.created_at, id: r.id }));
  return {
    items: paged.items.map((r) => ({
      id: r.id,
      slug: r.slug,
      legalName: r.legal_name,
      appOrigin: r.app_origin,
      createdAt: r.created_at,
      plan: r.plan,
      connectorLastSeenAt: r.connector_last_seen_at,
      lastPostedAt: r.last_posted_at,
      lastActiveAt: r.last_active_at,
    })),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

/**
 * Set an organisation's plan label. The platform principal is checked inside
 * the definer function, like `list_tenants`; returns whether it exists.
 */
export async function setTenantPlan(
  tx: TxLike,
  requestedBy: string,
  tenantId: string,
  plan: string | null,
): Promise<boolean> {
  const rows = await tx.query<{ found: boolean }>(
    'SELECT tenancy.set_tenant_plan($1, $2, $3) AS found',
    [requestedBy, tenantId, plan],
  );
  return rows[0]?.found === true;
}

/**
 * Report a moment about the CALLING tenant to the operator directory. The
 * tenant is the session's context, never an argument, so this can only ever
 * speak for the tenant already set — and it writes an instant, nothing else.
 */
export async function noteTenantActivity(
  tx: TxLike,
  kind: 'active' | 'connector_seen' | 'posted',
): Promise<void> {
  await tx.query('SELECT tenancy.note_tenant_activity($1)', [kind]);
}

export interface ProvisionInput {
  readonly slug: string;
  readonly legalName: string;
  readonly appOrigin: string;
  readonly adminEmail: string;
  /** The provider's id for the first administrator. */
  readonly adminExternalId: string;
}

/**
 * Create a tenant and its first administrator.
 *
 * One call, one transaction, two ids back. A duplicate slug and a re-used
 * external id both come back as refusals a person can act on rather than as a
 * 500 — M6: "Not done when: onboarding works for the happy path only."
 */
export async function provisionTenant(
  tx: TxLike,
  requestedBy: string,
  input: ProvisionInput,
): Promise<{ tenantId: string; principalId: string }> {
  let rows: Array<{
    outcome: string;
    tenant_id: string | null;
    principal_id: string | null;
    detail: string;
  }>;
  try {
    rows = await tx.query(
      `SELECT outcome, tenant_id, principal_id, detail
         FROM tenancy.provision_tenant($1, $2, $3, $4, $5, $6)`,
      [
        requestedBy,
        input.slug,
        input.legalName,
        input.appOrigin,
        input.adminEmail,
        input.adminExternalId,
      ],
    );
  } catch (error) {
    if (codeOf(error) === '42501') {
      throw new ProvisioningRefused('Provisioning requires a platform account.');
    }
    throw error;
  }

  const row = rows[0];
  if (row === undefined) {
    // Unreachable: the function returns a row on every path that does not
    // raise. Treated as a refusal rather than defaulted, because a caller that
    // got no ids has no tenant to talk about.
    throw new ProvisioningRefused('The organisation was not created.');
  }

  // A refusal comes back as a ROW, not as an exception, so that the audit
  // record of it survives — raising inside the function rolled the event row
  // back along with the failure it described.
  if (row.outcome !== 'created' || row.tenant_id === null || row.principal_id === null) {
    throw new ProvisioningRefused(
      row.detail.length > 0
        ? `That organisation could not be created: ${row.detail}.`
        : 'That organisation could not be created.',
    );
  }

  return { tenantId: row.tenant_id, principalId: row.principal_id };
}

export interface ProvisioningEvent {
  readonly id: string;
  readonly slug: string;
  readonly outcome: string;
  readonly tenantId: string | null;
  readonly detail: string;
  readonly occurredAt: string;
}

/** Every provisioning attempt, refused ones included, newest first. */
export async function listProvisioningEvents(
  tx: TxLike,
  requestedBy: string,
  page: PageQuery,
): Promise<Page<ProvisioningEvent>> {
  const k = keyset(page, 'occurred_at', 'id', 'timestamptz', true, 2);
  const rows = await tx.query<{
    id: string;
    slug: string;
    outcome: string;
    tenant_id: string | null;
    detail: string;
    occurred_at: string;
  }>(
    `SELECT id, slug, outcome, tenant_id, detail, occurred_at::text AS occurred_at
       FROM tenancy.list_provisioning_events($1)
      WHERE ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${1 + k.params.length + 1}`,
    [requestedBy, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM tenancy.list_provisioning_events($1)`,
    [requestedBy],
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.occurred_at, id: r.id }));
  return {
    items: paged.items.map((r) => ({
      id: r.id,
      slug: r.slug,
      outcome: r.outcome,
      tenantId: r.tenant_id,
      detail: r.detail,
      occurredAt: r.occurred_at,
    })),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

function codeOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
