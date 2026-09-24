import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { formatIndianRupees, formatIndianRupeesOrDash } from '@cog/money';
import { apiAsCaller } from '../../../../../lib/api';
import { AbsentNotice, Empty, NotFoundState, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { DecideSelectionForm, NewSelectionForm, SubstitutionForm, DecideSubstitutionForm } from './forms';
import { ProjectHead } from '../header';

export const metadata = { title: 'Selections' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, 'ok' | 'warn' | 'bad' | 'active' | 'idle'> = {
  proposed: 'active',
  approved: 'ok',
  rejected: 'bad',
  alternative_requested: 'warn',
};

const LABEL: Record<string, string> = {
  proposed: 'Waiting on the client',
  approved: 'Approved and frozen',
  rejected: 'Rejected',
  alternative_requested: 'Alternative asked for',
};

/**
 * What goes in each room, and what happens when it cannot be got.
 *
 * **An approved selection is frozen**, because procurement orders against it.
 * Changing it after that is a substitution — a separate record carrying what
 * the change costs and how much later it arrives — and it needs approving
 * before it takes effect.
 *
 * **Approving an alternative applies its price change exactly once.** The
 * previous system learned that the hard way and left a comment saying so.
 */
export default async function SelectionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const selections = await load(await apiAsCaller(), API_ROUTES.selectionsForProject, {
    params: { projectId },
  });

  if (selections.kind === 'unreachable') return <UnreachableState />;
  if (selections.kind === 'refused') {
    return selections.error.code === 'NOT_FOUND' ? (
      <NotFoundState what="This page" backHref={`/projects/${projectId}`} backLabel="Back to the project" />
    ) : (
      <Refusal error={selections.error} />
    );
  }

  const pending = selections.data.items.flatMap((s) =>
    s.substitutions.filter((sub) => sub.status === 'pending').map((sub) => ({ selection: s, sub })),
  );

  return (
    <>
      <ProjectHead projectId={projectId} section="Design" title="Selections" />
      {pending.length === 0 ? null : (
        <div className="notice">
          <p>
            <strong>
              {pending.length} alternative{pending.length === 1 ? '' : 's'} waiting for a decision.
            </strong>{' '}
            Each one carries its own price and lead-time impact. Approving applies the price change
            once, however many times the button is pressed.
          </p>
        </div>
      )}

      <Section bare title={`Selections — ${selections.data.items.length}`}>
        <div className="card-b">
          {selections.data.items.length === 0 ? (
            <Empty illustration="projects" title="Nothing selected yet">
              A selection is one item in one room — the tile, the tap, the chair — and it is what
              the client approves and procurement then orders.
            </Empty>
          ) : (
            <>
              <div className="tbl-wrap">
                {/* Room · Item · Unit price · Lead time · State · (actions) —
                    priority: identity (item) never drops, state is the
                    decision column, unit price and lead time are the
                    money/status figures that drop into the detail line, room
                    and the action button are reference and drop first. */}
                <table className="tbl" data-priority>
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Item</th>
                      <th>Unit price</th>
                      <th>Lead time</th>
                      <th>State</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {selections.data.items.map((selection) => (
                      <tr key={selection.id}>
                        <td data-p="4">{selection.roomLabel === '' ? '—' : selection.roomLabel}</td>
                        <td data-p="1">
                          {selection.itemName}
                          {selection.modelSku === '' ? null : (
                            <>
                              <br />
                              <span className="muted">{selection.modelSku}</span>
                            </>
                          )}
                          {selection.substitutions.length === 0 ? null : (
                            <>
                              <br />
                              <span className="muted">
                                {selection.substitutions.length} alternative
                                {selection.substitutions.length === 1 ? '' : 's'} proposed
                              </span>
                            </>
                          )}
                        </td>
                        <td data-p="3" data-label="Unit price">
                          {formatIndianRupeesOrDash(selection.unitPricePaise)}
                        </td>
                        <td data-p="3" data-label="Lead time">
                          {selection.leadTimeWeeks === null
                            ? '—'
                            : `${String(selection.leadTimeWeeks)} weeks`}
                        </td>
                        <td data-p="2">
                          <Pill tone={TONE[selection.status] ?? 'idle'}>
                            {LABEL[selection.status] ?? selection.status}
                          </Pill>
                        </td>
                        <td data-p="4">
                          {selection.status === 'approved' ? (
                            <SubstitutionForm selectionId={selection.id} projectId={projectId} />
                          ) : (
                            <DecideSelectionForm selectionId={selection.id} projectId={projectId} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                shown={{ from: 1, to: selections.data.items.length }}
                of={selections.data.items.length}
                unit="selections"
              />
            </>
          )}
        </div>
      </Section>

      {pending.length === 0 ? null : (
        <Section bare title="Alternatives waiting for a decision">
          <div className="card-b">
            <div className="tbl-wrap">
              {/* Item · Instead of · Proposed · Price change · Arrives ·
                  (actions) — priority: identity (item) never drops, price
                  change is the decision column since it is the cost impact
                  of accepting, arrives (the lead-time delta) is a status
                  figure that drops into the detail line, instead-of,
                  proposed and the action button are reference and drop
                  first. */}
              <table className="tbl" data-priority>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Instead of</th>
                    <th>Proposed</th>
                    <th>Price change</th>
                    <th>Arrives</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pending.map(({ selection, sub }) => (
                    <tr key={sub.id}>
                      <td data-p="1">{selection.itemName}</td>
                      <td data-p="4">{sub.originalSpec}</td>
                      <td data-p="4">
                        {sub.proposedSpec}
                        {sub.reason === '' ? null : (
                          <>
                            <br />
                            <span className="muted">{sub.reason}</span>
                          </>
                        )}
                      </td>
                      <td data-p="2">
                        {sub.priceDeltaPaise.startsWith('-')
                          ? `− ${formatIndianRupees(sub.priceDeltaPaise.slice(1))}`
                          : `+ ${formatIndianRupees(sub.priceDeltaPaise)}`}
                      </td>
                      <td data-p="3" data-label="Arrives">
                        {sub.leadTimeDeltaDays === 0
                          ? 'Same'
                          : sub.leadTimeDeltaDays > 0
                            ? `${String(sub.leadTimeDeltaDays)} days later`
                            : `${String(-sub.leadTimeDeltaDays)} days sooner`}
                      </td>
                      <td data-p="4">
                        <DecideSubstitutionForm substitutionId={sub.id} projectId={projectId} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager shown={{ from: 1, to: pending.length }} of={pending.length} unit="alternatives" />
          </div>
        </Section>
      )}

      <Section bare title="Propose an item">
        <div className="card-b">
          <NewSelectionForm projectId={projectId} />
        </div>
      </Section>

      <AbsentNotice title="A frozen selection is edited by proposing an alternative, not by typing over it">
        Once the client has approved an item, procurement is ordering against that exact spec. An
        edit at that point changes what was agreed with nothing recording that it changed &mdash;
        so the only way through is an alternative, carrying what it costs and how much later it
        arrives, and somebody has to approve it.
      </AbsentNotice>
    </>
  );
}
