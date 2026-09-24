import type { Page } from '@cog/contracts';
import { finishPage, keyset, type PageQuery } from '@cog/service-kit';

/**
 * What a principal IS, and what it is entitled to — read inside the tenant
 * context, under RLS.
 *
 * The bootstrap resolver deliberately returns two ids and nothing else:
 * `identity.resolve_principal` runs with no tenant set, and widening it to
 * carry a kind, a role list or an entitlement would make the one unscoped query
 * in the system an enumeration surface. So the kind is read here, the same way
 * `loadPrincipalRoles` reads the roles — after `withTenant` has set the
 * context, so the policy applies to the read itself.
 *
 * **A principal with no link is scoped to nothing.** That is the correct
 * default for a portal login and it is why `subjectIds` starts empty rather
 * than being widened on absence: an entitlement that appears when none was
 * granted is the failure this module exists to prevent.
 */

/**
 * The narrow slice of a transaction this module needs.
 *
 * Declared structurally rather than imported, exactly as `roles.ts` does: the
 * transaction type belongs to `packages/service-kit`, and depending on the
 * concrete one here would tie a pure application function to a runtime it does
 * not otherwise need.
 */
export interface TxLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

export type PrincipalKind = 'staff' | 'vendor' | 'client' | 'connector' | 'system';

export interface PrincipalScope {
  readonly principalId: string;
  readonly kind: PrincipalKind;
  readonly disabled: boolean;
  /** Vendor ids for a `vendor`, project ids for a `client`. Empty otherwise. */
  readonly subjectIds: readonly string[];
}

const KINDS: readonly PrincipalKind[] = ['staff', 'vendor', 'client', 'connector', 'system'];

/** Thrown when the credential resolved to a principal row that is not there. */
export class PrincipalNotFound extends Error {
  override readonly name = 'PrincipalNotFound';
  constructor(principalId: string) {
    super(`no principal ${principalId} in this tenant`);
  }
}

export async function loadPrincipalScope(
  tx: TxLike,
  principalId: string,
): Promise<PrincipalScope> {
  // No `WHERE tenant_id` — RLS applies it, so a principal id from another
  // tenant simply does not match and the caller gets PrincipalNotFound rather
  // than another tenant's principal.
  const rows = await tx.query<{ kind: string; disabled: boolean }>(
    `SELECT kind, (disabled_at IS NOT NULL) AS disabled
       FROM identity.principals
      WHERE id = $1`,
    [principalId],
  );
  const row = rows[0];
  if (row === undefined) throw new PrincipalNotFound(principalId);

  // An unrecognised kind is treated as the least privileged thing it could be,
  // rather than trusted. The CHECK constraint makes this unreachable today;
  // it stays because a future kind added to the constraint and not to this
  // module must not silently acquire staff access.
  const kind: PrincipalKind = (KINDS as readonly string[]).includes(row.kind)
    ? (row.kind as PrincipalKind)
    : 'connector';

  if (kind !== 'vendor' && kind !== 'client') {
    return { principalId, kind, disabled: row.disabled, subjectIds: [] };
  }

  const links = await tx.query<{ subject_id: string }>(
    `SELECT subject_id FROM identity.principal_links
      WHERE principal_id = $1 AND subject_kind = $2
      ORDER BY subject_id`,
    [principalId, kind === 'vendor' ? 'vendor' : 'client'],
  );

  return {
    principalId,
    kind,
    disabled: row.disabled,
    subjectIds: links.map((l) => l.subject_id),
  };
}

/**
 * Grant an external principal access to one vendor or one project.
 *
 * The caller is responsible for having checked that the subject exists — that
 * check belongs to the service that owns the subject, and doing it here would
 * mean `identity` reading `procurement`'s tables.
 */
export async function linkPrincipal(
  tx: TxLike,
  tenantId: string,
  input: {
    readonly principalId: string;
    readonly subjectKind: 'vendor' | 'client';
    readonly subjectId: string;
    readonly createdBy: string;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO identity.principal_links
       (tenant_id, principal_id, subject_kind, subject_id, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, principal_id, subject_kind, subject_id) DO NOTHING`,
    [tenantId, input.principalId, input.subjectKind, input.subjectId, input.createdBy],
  );
}

export async function unlinkPrincipal(
  tx: TxLike,
  principalId: string,
  subjectKind: 'vendor' | 'client',
  subjectId: string,
): Promise<void> {
  await tx.query(
    `DELETE FROM identity.principal_links
      WHERE principal_id = $1 AND subject_kind = $2 AND subject_id = $3`,
    [principalId, subjectKind, subjectId],
  );
}

/**
 * The single question every portal route asks: may this principal see this
 * subject?
 *
 * Written as one function rather than an inline comparison at each call site,
 * because "did you remember to check" is the question a reviewer should not
 * have to ask nineteen times.
 */
export function entitledTo(scope: PrincipalScope, subjectId: string): boolean {
  return scope.subjectIds.includes(subjectId);
}

export interface PrincipalRecord {
  readonly id: string;
  readonly email: string;
  /** What a colleague calls them; `null` when nobody gave a name (0083). */
  readonly displayName: string | null;
  readonly roles: readonly string[];
  readonly disabled: boolean;
}

const PRINCIPAL_COLUMNS = `id, email, display_name, roles, disabled_at::text AS disabled_at`;

type PrincipalRow = {
  id: string;
  email: string;
  display_name: string | null;
  roles: string[];
  disabled_at: string | null;
};

function toPrincipalRecord(r: PrincipalRow): PrincipalRecord {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    roles: r.roles,
    // A boolean, not the timestamp: when somebody was disabled is an audit
    // question and the audit log is where it is answered.
    disabled: r.disabled_at !== null,
  };
}

/**
 * Everybody of one kind, unpaged.
 *
 * **For server-side composition only — never for a screen.** It is bounded by
 * the tenant's own staff count, which is the population a settings table
 * already renders in full elsewhere, so reading it whole here (to compose
 * with `services/projects` membership, or to answer "how many staff") does
 * not carry the risk a tenant-wide, no-limit list usually would. A screen
 * wants `pagePrincipalsOfKind` instead.
 *
 * No `WHERE tenant_id` — RLS applies it.
 */
export async function listPrincipalsOfKind(
  tx: TxLike,
  kind: PrincipalKind,
): Promise<readonly PrincipalRecord[]> {
  const rows = await tx.query<PrincipalRow>(
    `SELECT ${PRINCIPAL_COLUMNS}
       FROM identity.principals
      WHERE kind = $1
      ORDER BY email`,
    [kind],
  );
  return rows.map(toPrincipalRecord);
}

/** How many principals of one kind exist — for a caller that needs the count and not the rows. */
export async function countPrincipalsOfKind(tx: TxLike, kind: PrincipalKind): Promise<number> {
  const rows = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM identity.principals WHERE kind = $1`,
    [kind],
  );
  return rows[0]?.n ?? 0;
}

/** How many principals of one kind are NOT disabled — the settings screen's "active" stat. */
export async function countActivePrincipalsOfKind(
  tx: TxLike,
  kind: PrincipalKind,
): Promise<number> {
  const rows = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM identity.principals WHERE kind = $1 AND disabled_at IS NULL`,
    [kind],
  );
  return rows[0]?.n ?? 0;
}

/** One principal of one kind, by id — for a caller that needs to check one exists rather than list every one. */
export async function findPrincipalOfKind(
  tx: TxLike,
  kind: PrincipalKind,
  id: string,
): Promise<PrincipalRecord | null> {
  const rows = await tx.query<PrincipalRow>(
    `SELECT ${PRINCIPAL_COLUMNS} FROM identity.principals WHERE kind = $1 AND id = $2`,
    [kind, id],
  );
  const row = rows[0];
  return row === undefined ? null : toPrincipalRecord(row);
}

/**
 * A settings screen's page of one kind, alphabetical by email — a directory,
 * not a feed, so ascending rather than newest-first.
 */
export async function pagePrincipalsOfKind(
  tx: TxLike,
  kind: PrincipalKind,
  page: PageQuery,
): Promise<Page<PrincipalRecord>> {
  const k = keyset(page, 'email', 'id', 'text', false, 2);
  const rows = await tx.query<PrincipalRow>(
    `SELECT ${PRINCIPAL_COLUMNS}
       FROM identity.principals
      WHERE kind = $1
        AND ${k.where}
      ORDER BY ${k.orderBy}
      LIMIT $${2 + k.params.length}`,
    [kind, ...k.params, page.limit + 1],
  );
  const [counted] = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM identity.principals WHERE kind = $1`,
    [kind],
  );
  const paged = finishPage(rows, page, (r) => ({ key: r.email, id: r.id }));
  return {
    items: paged.items.map(toPrincipalRecord),
    nextCursor: paged.nextCursor,
    prevCursor: paged.prevCursor,
    count: counted?.n ?? 0,
  };
}

/** The subjects one external principal is linked to. */
export async function linkedSubjects(
  tx: TxLike,
  principalId: string,
  subjectKind: 'vendor' | 'client',
): Promise<readonly string[]> {
  const rows = await tx.query<{ subject_id: string }>(
    `SELECT subject_id FROM identity.principal_links
      WHERE principal_id = $1 AND subject_kind = $2
      ORDER BY subject_id`,
    [principalId, subjectKind],
  );
  return rows.map((r) => r.subject_id);
}
