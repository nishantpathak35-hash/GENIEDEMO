import {
  ACTION_KEYS,
  DEFAULT_ROLES,
  MODULE_KEYS,
  type ActionKey,
  type ModuleKey,
} from '@cog/contracts';

/**
 * Reading and writing the role model.
 *
 * **This service answers "what may this principal do". It never asks.** The
 * server computes every permission and the client displays it — so an app
 * receives a list of what it may do and renders that, rather than deriving a
 * role from an email address the way `POsView.js:136-154` does.
 *
 * Everything here runs inside the caller's transaction, under RLS. A principal
 * whose roles are not visible holds no grants, which is the same answer as
 * another tenant's principal: entitled to nothing. The failure direction is
 * closed in both cases.
 */

export interface TxLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

export class RoleError extends Error {
  override readonly name = 'RoleError';
}

export interface RoleRow {
  readonly key: string;
  readonly label: string;
  readonly status: 'provisional' | 'confirmed';
  readonly retired: boolean;
  readonly modules: readonly string[];
  readonly actions: readonly string[];
}

/**
 * What one principal may reach, resolved from the roles it holds.
 *
 * The union across roles, because roles are additive: someone who is both
 * `proc` and `finance` reaches what either reaches. A retired role contributes
 * nothing — retiring is how a permission is withdrawn without deleting the
 * history that names it.
 */
export interface PrincipalEntitlements {
  readonly roles: readonly string[];
  readonly modules: readonly string[];
  readonly actions: readonly string[];
}

export async function loadEntitlements(
  tx: TxLike,
  roles: readonly string[],
): Promise<PrincipalEntitlements> {
  if (roles.length === 0) return { roles: [], modules: [], actions: [] };

  const rows = await tx.query<{ grant_kind: string; grant_key: string }>(
    `SELECT DISTINCT g.grant_kind, g.grant_key
       FROM identity.role_grants g
       JOIN identity.role_catalog c
         ON c.tenant_id = g.tenant_id AND c.role_key = g.role_key
      WHERE g.role_key = ANY($1::text[]) AND c.retired_at IS NULL`,
    [[...roles]],
  );

  return {
    roles: [...roles],
    modules: rows.filter((r) => r.grant_kind === 'module').map((r) => r.grant_key).sort(),
    actions: rows.filter((r) => r.grant_kind === 'action').map((r) => r.grant_key).sort(),
  };
}

/** Whether a set of roles carries one named power. */
export function permits(entitlements: PrincipalEntitlements, action: ActionKey): boolean {
  return entitlements.actions.includes(action);
}

/** Whether a set of roles reaches one screen. */
export function reaches(entitlements: PrincipalEntitlements, module: ModuleKey): boolean {
  return entitlements.modules.includes(module);
}

/** The whole catalog, for the settings screen. */
export async function listRoles(tx: TxLike): Promise<readonly RoleRow[]> {
  const roles = await tx.query<{
    role_key: string;
    label: string;
    status: 'provisional' | 'confirmed';
    retired_at: string | null;
  }>(
    `SELECT role_key, label, status, retired_at::text AS retired_at
       FROM identity.role_catalog ORDER BY role_key`,
  );
  const grants = await tx.query<{ role_key: string; grant_kind: string; grant_key: string }>(
    `SELECT role_key, grant_kind, grant_key FROM identity.role_grants
      ORDER BY role_key, grant_kind, grant_key`,
  );

  return roles.map((role) => {
    const mine = grants.filter((g) => g.role_key === role.role_key);
    return {
      key: role.role_key,
      label: role.label,
      status: role.status,
      retired: role.retired_at !== null,
      modules: mine.filter((g) => g.grant_kind === 'module').map((g) => g.grant_key),
      actions: mine.filter((g) => g.grant_kind === 'action').map((g) => g.grant_key),
    };
  });
}

export interface SetGrantsInput {
  readonly roleKey: string;
  readonly modules: readonly string[];
  readonly actions: readonly string[];
  /** Set when a human is confirming the answer rather than editing a provisional one. */
  readonly confirmedBy?: string;
}

/**
 * Replace one role's grants.
 *
 * **Validated against the vocabulary before anything is written.** An unknown
 * module key would otherwise be stored as a grant that matches nothing — a
 * permission that looks granted on the settings screen and is refused at every
 * endpoint, which is the worst of both answers.
 *
 * Replacing rather than merging: a permission screen shows the whole set, so
 * what it sends back IS the whole set. A merge would make removing a grant
 * impossible through the only interface that edits them.
 */
export async function setRoleGrants(tx: TxLike, input: SetGrantsInput): Promise<void> {
  const known = await tx.query<{ role_key: string }>(
    `SELECT role_key FROM identity.role_catalog WHERE role_key = $1 AND retired_at IS NULL`,
    [input.roleKey],
  );
  if (known.length === 0) throw new RoleError(`no such role: ${input.roleKey}`);

  const unknownModule = input.modules.find((m) => !MODULE_KEYS.includes(m));
  if (unknownModule !== undefined) throw new RoleError(`no such module: ${unknownModule}`);
  const unknownAction = input.actions.find((a) => !ACTION_KEYS.includes(a));
  if (unknownAction !== undefined) throw new RoleError(`no such action: ${unknownAction}`);

  await tx.query(`DELETE FROM identity.role_grants WHERE role_key = $1`, [input.roleKey]);

  const status = input.confirmedBy === undefined ? 'provisional' : 'confirmed';
  const setBy = input.confirmedBy ?? null;

  for (const [kind, keys] of [
    ['module', input.modules],
    ['action', input.actions],
  ] as const) {
    for (const key of keys) {
      await tx.query(
        `INSERT INTO identity.role_grants
           (tenant_id, id, role_key, grant_kind, grant_key, status, set_by, set_on)
         VALUES (tenancy.current_tenant_id(), gen_random_uuid(), $1, $2, $3, $4, $5,
                 CASE WHEN $5::text IS NULL THEN NULL ELSE CURRENT_DATE END)`,
        [input.roleKey, kind, key, status, setBy],
      );
    }
  }
}

/**
 * Add a role a tenant needs and the ten defaults do not carry.
 *
 * The repaired legacy tree supports this too — `settings-admin.js:10-14` merges
 * a `custom_roles` setting into the built-in list — which is why the catalog is
 * a table rather than an enum.
 */
export async function addRole(tx: TxLike, key: string, label: string): Promise<void> {
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(key)) {
    throw new RoleError(
      'A role key is lowercase letters, digits and underscores, starting with a letter.',
    );
  }
  if (label.trim() === '') throw new RoleError('A role needs a label.');

  await tx.query(
    `INSERT INTO identity.role_catalog (tenant_id, id, role_key, label, note)
     VALUES (tenancy.current_tenant_id(), gen_random_uuid(), $1, $2, 'Added by an administrator.')
     ON CONFLICT (tenant_id, role_key) DO NOTHING`,
    [key, label.trim()],
  );
}

/**
 * Withdraw a role without deleting it.
 *
 * A deleted role would orphan every approval-history row naming it, and that
 * history is the only thing a dispute can be settled from. Retiring stops it
 * granting anything — `loadEntitlements` joins on `retired_at IS NULL` — while
 * leaving the record intact.
 */
export async function retireRole(tx: TxLike, key: string): Promise<void> {
  await tx.query(
    `UPDATE identity.role_catalog SET retired_at = now(), updated_at = now()
      WHERE role_key = $1 AND retired_at IS NULL`,
    [key],
  );
}

/**
 * Give a new tenant the provisional role model.
 *
 * Called once, inside the provisioning transaction, so an organisation exists
 * WITH a role model or not at all. A tenant provisioned without one would have
 * an administrator who is entitled to nothing and no screen from which to grant
 * themselves anything.
 *
 * Idempotent: `ON CONFLICT DO NOTHING` throughout, so re-running against an
 * existing tenant is a no-op rather than a duplicate-key failure. That matters
 * because the demo seed is required to be re-runnable.
 */
export async function seedDefaultRoles(tx: TxLike): Promise<void> {
  for (const role of DEFAULT_ROLES) {
    await tx.query(
      `INSERT INTO identity.role_catalog (tenant_id, id, role_key, label, note)
       VALUES (tenancy.current_tenant_id(), gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (tenant_id, role_key) DO NOTHING`,
      [
        role.key,
        role.label,
        'Provisional. Read out of the repaired legacy tree at settings-catalog.js:1 ' +
          'and adopted without anybody signing it off — see OPEN-DECISIONS PO-13a.',
      ],
    );

    for (const [kind, keys] of [
      ['module', role.modules],
      ['action', role.actions],
    ] as const) {
      for (const key of keys) {
        await tx.query(
          `INSERT INTO identity.role_grants
             (tenant_id, id, role_key, grant_kind, grant_key)
           VALUES (tenancy.current_tenant_id(), gen_random_uuid(), $1, $2, $3)
           ON CONFLICT (tenant_id, role_key, grant_kind, grant_key) DO NOTHING`,
          [role.key, kind, key],
        );
      }
    }
  }
}

/**
 * Give one principal a set of roles.
 *
 * Used once per tenant, at provisioning, on the first administrator. Without it
 * a newly provisioned organisation has an administrator entitled to nothing and
 * no screen from which to grant themselves anything — `provision_tenant` inserts
 * the principal with the column default, which is an empty role array.
 *
 * Every role is checked against the catalog first. Writing a role string that
 * no catalog row matches would store an entitlement to nothing, and the symptom
 * is a person who appears to hold a role and is refused everywhere.
 */
export async function assignRoles(
  tx: TxLike,
  principalId: string,
  roles: readonly string[],
): Promise<void> {
  const wanted = [...new Set(roles)];
  const known = await tx.query<{ role_key: string }>(
    `SELECT DISTINCT role_key FROM identity.role_catalog
      WHERE role_key = ANY($1::text[]) AND retired_at IS NULL`,
    [wanted],
  );

  // Set membership, not a count comparison.
  //
  // Counting was wrong in two directions and the second one hurt. Too FEW rows
  // is the real case and it reported correctly; too MANY — the same role_key
  // visible more than once — also failed the equality, computed an empty
  // `missing`, and raised the literally meaningless `no such role: `.
  //
  // That is reachable whenever the catalogue is not scoped to one tenant, which
  // is exactly what happens if this ever runs on a connection that bypasses
  // row-level security. RLS is one of three controls here and not one this
  // function should depend on for a coherent error message; a superuser
  // connection is a misconfiguration that ought to say so plainly rather than
  // report a role it can see as missing. Duplicates in `roles` broke it too.
  const found = new Set(known.map((k) => k.role_key));
  const missing = wanted.filter((r) => !found.has(r));
  if (missing.length > 0) {
    throw new RoleError(`no such role: ${missing.join(', ')}`);
  }

  await tx.query(`UPDATE identity.principals SET roles = $2::text[] WHERE id = $1`, [
    principalId,
    wanted,
  ]);
}

/**
 * Everybody in this tenant holding a given role.
 *
 * Used to work out who an approval request lands on. Deliberately returns ids
 * and nothing else — a caller working out who to notify has no business
 * receiving a directory of names and email addresses as a side effect.
 *
 * Tenant-scoped by RLS on `identity.principals`; no explicit tenant predicate
 * is needed and adding one would suggest the policy were optional.
 */
export async function principalsHoldingRole(
  tx: TxLike,
  roleKey: string,
): Promise<readonly string[]> {
  if (roleKey === '') return [];
  const rows = await tx.query<{ id: string }>(
    `SELECT id FROM identity.principals
      WHERE kind = 'staff' AND $1 = ANY(roles)`,
    [roleKey],
  );
  return rows.map((r) => r.id);
}

/**
 * Names for a set of principal ids — what a feed shows beside an event.
 * The display name, or the address when none was given; an id this tenant
 * does not hold is simply absent from the answer.
 */
export async function principalNames(
  tx: TxLike,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.query<{ id: string; name: string }>(
    `SELECT id, COALESCE(display_name, email) AS name
       FROM identity.principals
      WHERE id = ANY($1::uuid[])`,
    [[...new Set(ids)]],
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * The same people, named — for a screen that says who a decision waits on.
 *
 * Only those who can still act: a disabled principal holds the role on paper
 * and can clear nothing, and "waiting on Rahul" about somebody who left is
 * the wrong answer. The name is `display_name` (0083), or the address when
 * nobody gave one; a caller shows that, never a name guessed from an address.
 * Alphabetical, so the first name shown is the same on every read.
 */
export async function namedHoldersOfRole(
  tx: TxLike,
  roleKey: string,
): Promise<readonly { readonly id: string; readonly name: string }[]> {
  if (roleKey === '') return [];
  const rows = await tx.query<{ id: string; name: string }>(
    `SELECT id, COALESCE(display_name, email) AS name
       FROM identity.principals
      WHERE kind = 'staff' AND disabled_at IS NULL AND $1 = ANY(roles)
      ORDER BY COALESCE(display_name, email), id`,
    [roleKey],
  );
  return rows;
}
