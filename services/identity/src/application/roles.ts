/**
 * Reading a principal's roles.
 *
 * **Deliberately not returned by `identity.resolve_principal`.** That function
 * is the one query in the system that runs with no tenant context — it is how a
 * context comes to exist — and it is SECURITY DEFINER over a table
 * `app_runtime` has no grant on. Widening it to return roles would make the
 * single unscoped query in the system an enumeration surface.
 *
 * So roles are read here instead: inside the caller's transaction, under RLS,
 * by the handler that needs them. `createPrincipalResolver` builds a principal
 * with `roles: []` and says so; this is the other half of that sentence, which
 * did not exist until an approval refused for the wrong reason — the engine
 * was entitled to nothing because nobody had ever loaded a role.
 */

export interface TxLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

/**
 * The roles of one principal in the current tenant.
 *
 * Returns `[]` for a principal that is not visible — which under RLS is also
 * what another tenant's principal looks like. That is the correct answer in
 * both cases: no roles means entitled to nothing, so the failure direction is
 * closed.
 *
 * A disabled principal holds no roles either. Disabling somebody must take
 * effect on the next request, not on their next login.
 */
export async function loadPrincipalRoles(tx: TxLike, principalId: string): Promise<string[]> {
  const rows = await tx.query<{ roles: string[] }>(
    `SELECT roles FROM identity.principals
      WHERE id = $1 AND disabled_at IS NULL`,
    [principalId],
  );
  return rows[0]?.roles ?? [];
}
