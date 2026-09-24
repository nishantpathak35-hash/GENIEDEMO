import { DEFAULT_CHAINS } from '@cog/contracts';
import { validateChain, type ApprovalStage } from '../domain/approval.js';

/**
 * Configuring an approval chain.
 *
 * **This is what turns PO-13's blocked screens on.** The engine has been
 * complete since M1 — `approve()` evaluates stages, quorum, entitlement and
 * self-approval — and it refused everything for one reason:
 * `assertChainConfigured` finds no stages, because nothing could write any.
 * There was no route that created a chain and no default seeded at
 * provisioning. An unconfigured control fails closed, which was correct and
 * useless.
 *
 * Two ways a chain comes to exist, and both land in the same tables:
 *
 *   - seeded provisionally when a tenant is provisioned, from `DEFAULT_CHAINS`;
 *   - replaced wholesale by an administrator through `configureChain`.
 */

export interface TxLike {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<R[]>;
}

export interface ConfigureChainInput {
  readonly entityType: string;
  readonly name: string;
  readonly stages: readonly ApprovalStage[];
}

/**
 * Replace the active chain for one entity type.
 *
 * **Validated before anything is written.** `validateChain` refuses a
 * configuration that cannot be honoured — a duplicate sequence, a quorum with
 * no role, a stage with no name — rather than accepting it and quietly doing
 * something else, which is APPR-03's real shape.
 *
 * The old chain is deactivated rather than deleted. `workflow.approval_history`
 * rows name a stage, and a deleted chain would leave those rows describing an
 * approval at a stage that no longer exists anywhere.
 */
export async function configureChain(tx: TxLike, input: ConfigureChainInput): Promise<string> {
  validateChain(input.stages);

  // Deactivate first: the partial unique index permits exactly one active chain
  // per entity type, so inserting before deactivating would violate it.
  await tx.query(
    `UPDATE workflow.approval_chains SET is_active = false
      WHERE entity_type = $1 AND is_active`,
    [input.entityType],
  );

  const created = await tx.query<{ id: string }>(
    `INSERT INTO workflow.approval_chains (tenant_id, id, entity_type, name, is_active)
     VALUES (tenancy.current_tenant_id(), gen_random_uuid(), $1, $2, true)
     RETURNING id`,
    [input.entityType, input.name],
  );
  const chainId = created[0]?.id;
  if (chainId === undefined) throw new Error('the chain was not created');

  for (const stage of input.stages) {
    await tx.query(
      `INSERT INTO workflow.approval_stages
         (tenant_id, chain_id, id, name, sequence, approver_role, min_approvals,
          approval_ceiling_paise)
       VALUES (tenancy.current_tenant_id(), $1, gen_random_uuid(), $2, $3, $4, $5, $6)`,
      [
        chainId,
        stage.name,
        stage.sequence,
        stage.approverRole,
        stage.minApprovals,
        // Written as a string; `bigint` does not survive JSON or the pg driver
        // as a number. `null` passes straight through and means no limit.
        stage.approvalCeilingPaise === null ? null : `${stage.approvalCeilingPaise}`,
      ],
    );
  }

  return chainId;
}

/**
 * Give a new tenant the provisional chains.
 *
 * Called once, inside the provisioning transaction. Idempotent by checking for
 * an existing active chain rather than by `ON CONFLICT`: re-seeding must not
 * quietly replace a chain an administrator has already configured, which a
 * blind `configureChain` would do.
 */
export async function seedDefaultChains(tx: TxLike): Promise<void> {
  for (const chain of DEFAULT_CHAINS) {
    const existing = await tx.query<{ id: string }>(
      `SELECT id FROM workflow.approval_chains WHERE entity_type = $1 AND is_active`,
      [chain.entityType],
    );
    if (existing.length > 0) continue;

    await configureChain(tx, {
      entityType: chain.entityType,
      name: chain.name,
      stages: chain.stages.map((s) => ({
        name: s.name,
        sequence: s.sequence,
        approverRole: s.approverRole,
        minApprovals: s.minApprovals,
        // NO CEILING IS EVER SEEDED. PO-13d: the numbers are the client's, and
        // a plausible default would be indistinguishable from an agreed figure
        // within a month. Unconfigured means no limit, which is exactly how the
        // system behaved before the column existed.
        approvalCeilingPaise: null,
      })),
    });
  }
}
