import { randomUUID } from 'node:crypto';
import type { PrincipalKind, TxLike } from './scope.js';

/**
 * Redeeming an invitation into a principal.
 *
 * **The kind comes from the stored invitation row and from nowhere else.** That
 * is the whole security property of this file. The person redeeming supplies a
 * token and a verified provider identity; they do not get to say what they are
 * becoming. A `kind` read off the request body would mean a client invitation
 * could be redeemed as staff — a privilege escalation reachable by anyone who
 * was ever sent a portal invite, and worse than the cross-tenant read the rest
 * of this service is built to prevent, because it needs nobody else's data to
 * be useful.
 *
 * The same goes for `roles` and `email`: both are read from the row. Migration
 * 0080 additionally makes a non-staff invitation with any role at all
 * unstorable, so the copy below cannot produce an external principal holding an
 * internal grant even if a future caller tries to mint one.
 *
 * Runs inside `withTenant` on a system context. The tenant was resolved from
 * the token hash by `identity.tenant_for_invite`, the bootstrap read — the
 * redeemer has no principal yet, so there is no credential to resolve one from.
 */

/** Why a redemption was refused. Mapped to ONE response by the caller. */
export type AcceptRejection =
  /** Unknown, expired, or already redeemed. Deliberately not distinguished. */
  | 'invalid'
  /** That provider identity already signs in here as somebody. */
  | 'identity-in-use'
  /** Somebody in this tenant already holds the invited address. */
  | 'email-in-use';

/**
 * Thrown for a refusal discovered AFTER the invitation was claimed.
 *
 * It has to throw rather than return, and that is not a style choice. The claim
 * is an `UPDATE ... SET accepted_at`, so returning would COMMIT it: the
 * invitation would be marked used, no principal would exist, and the link would
 * be dead for the person it was sent to. Throwing rolls the claim back with
 * everything else, which leaves the invitation exactly as it was.
 *
 * The caller catches this outside `withTenant`, after the rollback.
 */
export class AcceptConflict extends Error {
  override readonly name = 'AcceptConflict';
  constructor(readonly reason: Exclude<AcceptRejection, 'invalid'>) {
    super(`invitation could not be redeemed: ${reason}`);
  }
}

export interface AcceptedPrincipal {
  readonly principalId: string;
  readonly kind: PrincipalKind;
  readonly email: string;
}

export type AcceptResult =
  | { readonly ok: true; readonly principal: AcceptedPrincipal }
  | { readonly ok: false; readonly reason: 'invalid' };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
  );
}

export interface AcceptInviteInput {
  readonly tenantId: string;
  readonly inviteId: string;
  /** The provider's id for the person redeeming, already verified. */
  readonly externalId: string;
  readonly now: Date;
}

export async function acceptInvite(tx: TxLike, input: AcceptInviteInput): Promise<AcceptResult> {
  // CLAIM THE INVITATION FIRST, AND CLAIM IT WITH THE WRITE.
  //
  // `UPDATE ... WHERE accepted_at IS NULL RETURNING` is the atomic step: two
  // clicks on the same link race on this row and exactly one of them gets a row
  // back. A read-then-write would let both through, and the second would fail
  // later on the principal's unique constraint — a constraint violation where a
  // clean refusal belongs, and only by luck.
  //
  // Expiry is checked in the same predicate rather than afterwards, so an
  // expired token consumes nothing and reads identically to an unknown one.
  const claimed = await tx.query<{
    kind: string;
    roles: string[];
    email: string;
    display_name: string | null;
  }>(
    `UPDATE identity.invites
        SET accepted_at = $2
      WHERE id = $1
        AND accepted_at IS NULL
        AND expires_at > $2
    RETURNING kind, roles, email, display_name`,
    [input.inviteId, input.now],
  );

  // Nothing was written, so returning is safe here and only here.
  const invite = claimed[0];
  if (invite === undefined) return { ok: false, reason: 'invalid' };

  const principalId = randomUUID();

  try {
    await tx.query(
      `INSERT INTO identity.principals (tenant_id, id, kind, external_id, email, roles, display_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.tenantId,
        principalId,
        // From the row. Not from the request, not defaulted, not inferred.
        invite.kind,
        input.externalId,
        invite.email,
        invite.roles,
        invite.display_name,
      ],
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new AcceptConflict('email-in-use');
    throw error;
  }

  // The bootstrap mapping, without which the principal exists and cannot sign
  // in. `register_principal` is `ON CONFLICT DO NOTHING`, so an external id that
  // already maps somewhere leaves this a no-op rather than repointing somebody
  // else's login — the safe direction, and the reason the check below reads the
  // mapping back instead of trusting the call.
  await tx.query('SELECT identity.register_principal($1, $2)', [input.externalId, principalId]);

  const mapped = await tx.query<{ principal_id: string }>(
    'SELECT principal_id FROM identity.resolve_principal($1)',
    [input.externalId],
  );
  if (mapped[0]?.principal_id !== principalId) {
    // Somebody already signs in with this identity. Throwing undoes the claim
    // and the principal row together, so the link stays usable by the person it
    // was actually sent to.
    throw new AcceptConflict('identity-in-use');
  }

  return {
    ok: true,
    principal: { principalId, kind: invite.kind as PrincipalKind, email: invite.email },
  };
}
