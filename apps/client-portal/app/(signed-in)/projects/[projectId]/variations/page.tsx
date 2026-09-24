import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { AbsentNotice, Empty, Money, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import type { PillTone } from '@cog/design-system';
import { apiAsCaller } from '../../../../../lib/api';
import { DecideVariationForm } from '../../../forms';

export const dynamic = 'force-dynamic';

/**
 * Variations awaiting the client's signature — `10-portals.html`'s
 * "Needs your sign-off" and "Decided" panels.
 *
 * **Drafts are not shown.** A draft variation is the contractor's working note,
 * and putting every internal revision in front of the client turns each one
 * into a negotiation. Only variations that have been sent appear.
 *
 * The cost impact shown is the variation's own — the number the client is being
 * asked to agree. Nothing on this page says what the work costs the contractor
 * to do. CO-04 in the design is the credit case: a negative `costImpact`
 * renders through the same `<Money>` the positive ones do — the sign is the
 * server's, not a client-side `-` prefix.
 *
 * The layout above already 404s a project this client is not linked to; the
 * design's own note ("a client asking about somebody else's project learns
 * nothing about whether it exists") is what that 404-not-403 is for.
 */
export default async function ClientVariationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const variations = await load(await apiAsCaller(), API_ROUTES.clientPortalVariations, {
    params: { projectId },
  });

  if (variations.kind === 'unreachable') return <UnreachableState />;
  if (variations.kind === 'refused') return <Refusal error={variations.error} />;

  const items = variations.data.items;
  const awaiting = items.filter((v) => v.state === 'pending_client');
  const decided = items.filter((v) => v.state !== 'pending_client');

  return (
    <>
      <div className="pgh">
        <h1 className="pt">Variations</h1>
        <p className="ps">
            {awaiting.length} awaiting your signature · {items.length} in total
          </p>
      </div>

      <Section bare title="Needs your sign-off" sub={`${awaiting.length} variation${awaiting.length === 1 ? '' : 's'}`}>
        {awaiting.length === 0 ? (
          <Empty illustration="approvals" title="Nothing needs your signature">
            Variations sent to you for approval appear here.
          </Empty>
        ) : (
          awaiting.map((variation) => (
            <div key={variation.id} className="variation">
              <div className="vh">
                <b>
                  {variation.number} — {variation.title}
                </b>
                <Pill tone="waiting">Waiting for you</Pill>
              </div>
              <p>{variation.description}</p>
              <div className="num">
                <Money wire={variation.costImpact} />
                <small>
                  {variation.costImpact.startsWith('-')
                    ? 'a credit — your contract value goes down by this'
                    : 'added to your contract value'}
                </small>
              </div>
              <DecideVariationForm
                projectId={projectId}
                changeOrderId={variation.id}
                changeOrderNumber={variation.number}
                version={variation.version}
              />
            </div>
          ))
        )}
      </Section>

      <Section bare title="Decided">
        {decided.length === 0 ? (
          <Empty illustration="approvals" title="Nothing decided yet" />
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Variation</th>
                    <th className="num">Amount</th>
                    <th>Decision</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {decided.map((variation) => (
                    <tr key={variation.id}>
                      <td>
                        {variation.number}
                        <span className="sub"> — {variation.title}</span>
                      </td>
                      <td className="num">
                        <Money wire={variation.costImpact} />
                      </td>
                      <td>
                        <Pill tone={decisionTone(variation.state)}>
                          {decisionLabel(variation.state, variation.decidedBy)}
                        </Pill>
                      </td>
                      <td>{variation.decidedAt?.slice(0, 10) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager shown={{ from: 1, to: decided.length }} of={decided.length} unit="decided" />
          </>
        )}
      </Section>

      <AbsentNotice title="A variation is decided once">
        Once you record a decision it cannot be changed here — a second approval would add the
        same variation to the contract value twice, which is what happens in the system this
        replaces.
      </AbsentNotice>
    </>
  );
}

/**
 * No red on this screen — `S4-portals.md`: "the client portal shows no
 * status red: a variation the client declined reads 'You declined' in
 * neutral (idle)". Only a client's own sign-off gets colour.
 */
function decisionTone(state: string): PillTone {
  return state === 'client_approved' ? 'ok' : 'idle';
}

function decisionLabel(state: string, decidedBy: string | null): string {
  if (state === 'client_approved') return 'You signed off';
  if (state === 'client_rejected') return 'You declined';
  if (state === 'withdrawn') return decidedBy === null ? 'Withdrawn' : `Withdrawn by ${decidedBy}`;
  return state.replace(/_/g, ' ');
}
