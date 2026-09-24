import type { ReactNode } from 'react';
import { API_ROUTES, DEFAULT_CHAINS } from '@cog/contracts';
import { apiAsCaller } from '../../../../lib/api';
import { AbsentNotice, Empty, Notice, PageHeader, Refusal, Section, Stepper, UnreachableState, load } from '@cog/design-system';
import { ChainForm } from '../forms';

/** The design's vocabulary for the entity types a chain can gate — never the raw enum. */
const ENTITY_TYPE_LABELS: Record<string, string> = {
  purchase_order: 'Purchase orders',
  payment_request: 'Payment requests',
  change_order: 'Change orders',
  boq_schedule: 'BOQ schedules',
  site_imprest: 'Site imprest',
};

function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType.replace(/_/g, ' ');
}

export const metadata = { title: 'Approval chains · Settings' };
export const dynamic = 'force-dynamic';

/** Settings › Approval steps — the hub's card, opened. */
const HEADER = <PageHeader crumbs={[{ href: '/settings', label: 'Settings' }]} title="Approval steps" sub="One chain of steps for the firm’s orders." />;

/**
 * The approval chains — the other half of what PO-13 was blocking.
 *
 * The engine has been complete since M1 and refused every decision for one
 * reason: nothing could write a chain, so `assertChainConfigured` found no
 * stages and failed closed. It was correct and useless. This screen is where a
 * chain comes from, and a provisional one is seeded when an organisation is
 * created so the refusal is not the first thing anybody meets.
 *
 * **One stage advances per approval, and no role is exempt.** The legacy loops
 * forward while the caller holds the next role and exempts `admin` and
 * `director` from the break, so one call from an administrator carries a
 * request through every stage of its chain (APPR-01). A three-stage approval
 * one person can satisfy alone is not a control.
 */
export default async function ApprovalsPage(): Promise<ReactNode> {
  const client = await apiAsCaller();
  const [chains, roles] = await Promise.all([
    load(client, API_ROUTES.approvalChains, {}),
    load(client, API_ROUTES.listRoles, {}),
  ]);

  if (chains.kind === 'unreachable') return <UnreachableState />;
  if (chains.kind === 'refused') {
    return (
      <>
        {HEADER}
        <Section title="Approval steps">
          <Refusal error={chains.error} />
        </Section>
      </>
    );
  }

  const roleOptions =
    roles.kind === 'ok'
      ? roles.data.items
          .filter((role) => !role.retired)
          .map((role) => [role.key, role.label] as const)
      : [];
  const roleLabel = (key: string): string =>
    roleOptions.find(([value]) => value === key)?.[1] ?? (key === '' ? 'Anyone signed in' : key);

  // Every entity type that HAS a chain, plus every one that could. A missing
  // chain is the interesting case — it refuses every approval — so it is shown
  // as an empty form rather than omitted.
  const configured = new Map(chains.data.items.map((chain) => [chain.entityType, chain]));
  const entityTypes = [
    ...new Set([...DEFAULT_CHAINS.map((c) => c.entityType), ...configured.keys()]),
  ];

  return (
    <>
      {HEADER}
      {entityTypes.length === 0 ? (
        <Empty illustration="approvals" title="No chains">
          Nothing can be approved until one exists.
        </Empty>
      ) : (
        entityTypes.map((entityType) => {
          const chain = configured.get(entityType);
          const fallback = DEFAULT_CHAINS.find((c) => c.entityType === entityType);
          const stages = chain?.stages ?? fallback?.stages ?? [];
          return (
            <Section bare key={entityType} title={entityTypeLabel(entityType)}>
              <div className="card-b">
                {chain === undefined ? (
                  <Notice tone="bad" title="Nothing here can be approved">
                    No chain is configured for this, so every decision is refused — which is the
                    right direction for an unconfigured control, and not a state to leave it in.
                  </Notice>
                ) : null}
                {stages.length === 0 ? null : (
                  <>
                    {/* A preview of the chain's shape, not a live approval —
                        no request is at any of these stages, so every step
                        renders 'later' rather than guessing which is "now". */}
                    <Stepper
                      steps={stages.map((stage) => ({
                        label: stage.name,
                        note: `${roleLabel(stage.approverRole)} · ${stage.minApprovals} approver${stage.minApprovals === 1 ? '' : 's'}`,
                        state: 'later',
                      }))}
                    />
                    <p className="hint u-m0">Preview of the chain as configured below.</p>
                  </>
                )}
                <ChainForm
                  entityType={entityType}
                  name={chain?.name ?? fallback?.name ?? ''}
                  stages={stages}
                  roles={roleOptions}
                />
              </div>
            </Section>
          );
        })
      )}

      <AbsentNotice title="Nobody approves their own request, and no role is exempt">
        The server compares the approver against whoever raised the request, and refuses. That is
        not a setting — it is the fix for a defect where the only creator check was in the browser
        and gated loading a summary panel rather than the decision itself. An administrator who
        must push something through does it by approving at each stage, leaving one audit row per
        stage with their name on it.
      </AbsentNotice>
    </>
  );
}
