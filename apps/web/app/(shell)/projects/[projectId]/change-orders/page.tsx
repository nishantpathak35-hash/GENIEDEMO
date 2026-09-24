import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { terms } from '../../../../../lib/terms';
import { load } from '@cog/design-system';
import Link from 'next/link';
import { Empty, Icon, Money, Section, Pill, Refusal, Stat, StatRow, UnreachableState } from '@cog/design-system';
import { DecideChangeOrderForm, NewChangeOrderForm, SubmitChangeOrderForm } from './forms';
import { variationLabel, variationTone } from '../../vocabulary';
import { ProjectHead } from '../header';

export const dynamic = 'force-dynamic';

/**
 * Variations — `docs/design/06-projects.html`, "Project › Commercial ·
 * Variations". Every card carries the customer's own words for the state
 * (`../../vocabulary.ts`), never the raw enum with its underscores replaced.
 *
 * **`original` is what was signed and is never overwritten.** That figure
 * does not exist in the legacy: `change-orders.js:82` adds each approved
 * variation straight into `client_boqs.contract_value`, so after the first
 * variation there is no record of what the contract was — and CO-04 means a
 * double-approval adds it twice into the same column. Here `original` and
 * `current` are both returned, and `current` is derived from the approved
 * variations on every read rather than accumulated.
 *
 * **The two other stats are counts, not sums.** The design's sample shows a
 * ₹ figure for "Waiting for the client" and a signed-off delta amount on the
 * contract stat; `contractValueResponse.contract` gives `approvedVariations`
 * and `pendingVariations` as counts only, and there is no endpoint that sums
 * an arbitrary set of `costImpact` values — summing them here would be the
 * same client-side money arithmetic `packages/money` exists to forbid.
 * `HUMAN(DATA-variations-sums)`: a per-stage sum of `costImpact` (signed-off,
 * pending, declined/withdrawn) would let these three stats carry the design's
 * money figures instead of counts.
 *
 * A credit's minus sign travels in the wire itself — `Money` renders it,
 * nothing here does arithmetic to detect one; `costImpact.startsWith('-')`
 * only chooses which caption to print underneath.
 */
export default async function ChangeOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const raising = (await searchParams)['new'] === '1';
  const t = await terms();
  const variations = await load(await apiAsCaller(), API_ROUTES.listChangeOrders, {
    params: { projectId },
  });

  if (variations.kind === 'unreachable') return <UnreachableState />;
  if (variations.kind === 'refused') return <Refusal error={variations.error} />;

  const { items, contract } = variations.data;
  const pending = items.filter((co) => co.state === 'pending_client');
  const declinedOrWithdrawn = items.filter(
    (co) => co.state === 'client_rejected' || co.state === 'withdrawn',
  );

  return (
    <>
      <ProjectHead
        projectId={projectId}
        section="Commercial"
        title={t.variations}
        help="Know what the client has signed off and what is still waiting on them, before the next bill goes out."
        actions={
          <a className="btn" href={`/export/variations?projectId=${projectId}`}>
            <Icon name="download" />
            Export
          </a>
        }
        primary={
          <Link className="btn primary" href={`/projects/${projectId}/change-orders?new=1#raise`}>
            <Icon name="plus" />
            New variation
          </Link>
        }
      />
      <StatRow n={3}>
        <Stat
          label="Contract, with signed-off variations"
          value={<Money wire={contract.current} />}
          delta={{ direction: 'flat', figure: `${contract.approvedVariations}`, period: 'signed off' }}
        />
        <Stat
          label="Waiting for the client"
          value={pending.length}
          {...(pending.length === 0
            ? {}
            : {
                delta: {
                  direction: 'flat' as const,
                  figure: `${pending.length} variation${pending.length === 1 ? '' : 's'}`,
                  period: pending.map((co) => co.number).join(', '),
                },
              })}
        />
        <Stat
          label="Declined or withdrawn"
          value={declinedOrWithdrawn.length}
          {...(declinedOrWithdrawn.length === 0
            ? {}
            : {
                delta: {
                  direction: 'flat' as const,
                  figure: declinedOrWithdrawn.map((co) => co.number).join(' · '),
                  period: '',
                },
              })}
        />
      </StatRow>

      <div data-hero>
      <Section title={t.variations} sub={`${String(items.length)} on this project`} bare>
        {items.length === 0 ? (
          <Empty
            illustration="money"
            title={`No ${t.variationsLower}`}
            action={
              <Link className="btn primary" href={`/projects/${projectId}/change-orders?new=1#raise`}>
                <Icon name="plus" />
                New variation
              </Link>
            }
          >
            Raise one when the scope changes; the client signs it off in their portal.
          </Empty>
        ) : (
          <>
            {items.map((co) => (
              <div key={co.id} className="variation">
                <div className="vh">
                  <b>
                    {co.number} · {co.title}
                  </b>
                  <Pill tone={variationTone(co.state)}>{variationLabel(co.state)}</Pill>
                </div>
                {co.description === '' ? null : <p>{co.description}</p>}
                {co.decidedBy === null ? null : (
                  <p className="muted">
                    {co.decidedBy}
                    {co.decidedAt === null ? '' : ` · ${co.decidedAt.slice(0, 10)}`}
                  </p>
                )}
                <div className="num">
                  <Money wire={co.costImpact} />
                  <small>
                    {co.costImpact.startsWith('-') ? 'a credit against the contract' : co.costImpact === '0' ? 'no change to the contract value' : 'added to the contract value'}
                  </small>
                </div>
                {co.state === 'draft' ? (
                  <SubmitChangeOrderForm projectId={projectId} changeOrderId={co.id} version={co.version} />
                ) : co.state === 'pending_client' ? (
                  <DecideChangeOrderForm projectId={projectId} changeOrderId={co.id} version={co.version} />
                ) : null}
              </div>
            ))}
          </>
        )}
      </Section>
      </div>

      {raising ? (
        <Section bare title="Raise a variation">
          <div className="card-b" id="raise">
            <NewChangeOrderForm projectId={projectId} />
          </div>
        </Section>
      ) : null}
    </>
  );
}
