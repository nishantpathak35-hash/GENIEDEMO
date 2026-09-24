import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { HTTP_STATUS, configureChainInput } from '@cog/contracts';
import { tenantOf, txOf } from '@cog/service-kit';
import { ApprovalError, configureChain } from '@cog/workflow';
import { loadEntitlements, loadPrincipalRoles } from '@cog/identity';

/**
 * Configuring an approval chain.
 *
 * **In the host because it is composition.** The chain lives in
 * `services/workflow`; whether the caller may change it is a question only
 * `services/identity` can answer. Neither may import the other, so the one
 * place permitted to hold both is here (M1/D5).
 *
 * **Host orchestrates, it does not compute.** Every rule about whether a chain
 * is valid lives in `validateChain` in workflow — duplicate sequences, a quorum
 * with no role, a stage with no name. This file decides nothing except who is
 * allowed to ask.
 *
 * **Why changing a chain is `manage_settings` and not `manage_users`.** A chain
 * decides which role signs off on money leaving the company. Somebody who can
 * rewrite it to a single stage naming their own role has removed the control
 * without ever approving anything, so it sits with the broadest administrative
 * permission rather than the one that edits people.
 */

// The CONTRACT's schema, not a local copy of it.
//
// This file previously restated `approvalStageInput` field for field. Two
// declarations of one shape is how a field gets added to the contract, accepted
// by the client, and silently dropped by the route that re-parses it — which is
// what happened the moment the value ceiling was added. `packages/contracts` is
// the shared vocabulary; a service that redeclares it has forked it.
const chainBody = configureChainInput;

export function chainRoutes(): Hono {
  const app = new Hono();

  app.put('/workflow/chains/:entityType', async (c) => {
    const ctx = tenantOf(c);
    const tx = txOf(c);

    const roles = await loadPrincipalRoles(tx, ctx.principal.id);
    const entitlements = await loadEntitlements(tx, roles);
    if (!entitlements.actions.includes('manage_settings')) {
      return c.json(
        {
          code: 'FORBIDDEN' as const,
          message: 'Changing an approval chain needs the "Change company settings" permission.',
          requestId: requestId(c),
        },
        HTTP_STATUS.FORBIDDEN as 403,
      );
    }

    const parsed = chainBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: parsed.error.issues[0]?.message ?? 'That chain was not saved.',
          requestId: requestId(c),
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }

    const chainId = await configureChain(tx, {
      entityType: c.req.param('entityType'),
      name: parsed.data.name,
      stages: parsed.data.stages.map((s) => ({
        name: s.name,
        sequence: s.sequence,
        approverRole: s.approverRole,
        minApprovals: s.minApprovals,
        // Absent and null are the same answer — unset, meaning no limit — so a
        // client that omits the field cannot accidentally clear or set one.
        approvalCeilingPaise:
          s.approvalCeilingPaise === undefined || s.approvalCeilingPaise === null
            ? null
            : BigInt(s.approvalCeilingPaise),
      })),
    });

    return c.json({ id: chainId, entityType: c.req.param('entityType') });
  });

  app.onError((error, c) => {
    // A chain that cannot be honoured is refused with the engine's own words.
    // Accepting it and quietly doing something else is APPR-03's real shape.
    if (error instanceof ApprovalError) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: error.message,
          requestId: requestId(c),
        },
        HTTP_STATUS.VALIDATION_FAILED as 400,
      );
    }
    throw error;
  });

  return app;
}

function requestId(c: Context): string {
  return c.req.header('x-request-id') ?? 'unknown';
}
