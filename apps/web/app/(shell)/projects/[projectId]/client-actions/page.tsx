import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { AbsentNotice, Empty, NotFoundState, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { ExternalDecisionForm } from './forms';
import { ProjectHead } from '../header';

export const metadata = { title: 'Client decisions' };
export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  deliverable: 'Design',
  selection: 'Selection',
  change_order: 'Variation',
};

/** `record.decision` has no label map — sentence-case its words rather than render the raw enum. */
function sentenceCase(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What the client is holding up, and decisions that arrived somewhere else.
 *
 * **Clients decide on WhatsApp, in a meeting, on the phone.** The decision is
 * real, it has consequences, and the system never hears about it. Recording one
 * here applies it &mdash; through exactly the same code the in-app decision
 * uses &mdash; and keeps the channel it came through as a field, so it can be
 * filtered and counted rather than buried in a note.
 */
export default async function ClientActionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const actions = await load(await apiAsCaller(), API_ROUTES.clientActionsForProject, {
    params: { projectId },
  });

  if (actions.kind === 'unreachable') return <UnreachableState />;
  if (actions.kind === 'refused') {
    return actions.error.code === 'NOT_FOUND' ? (
      <NotFoundState what="This page" backHref={`/projects/${projectId}`} backLabel="Back to the project" />
    ) : (
      <Refusal error={actions.error} />
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const overdue = actions.data.items.filter((i) => i.dueOn !== null && i.dueOn < today);

  return (
    <>
      <ProjectHead projectId={projectId} section="Commercial" title="Client actions" />
      {overdue.length === 0 ? null : (
        <div className="notice refused">
          <p>
            <strong>
              {overdue.length} decision{overdue.length === 1 ? '' : 's'} past the date they were
              needed by.
            </strong>{' '}
            Every day one of these waits is a day the item behind it cannot be ordered.
          </p>
        </div>
      )}

      <Section bare title={`Waiting on the client — ${actions.data.items.length}`}>
        <div className="card-b">
          {actions.data.items.length === 0 ? (
            <Empty illustration="projects" title="Nothing is waiting on them">
              Design out for review, finishes awaiting a choice, and variations awaiting
              authorisation all appear here as soon as they are issued.
            </Empty>
          ) : (
            <>
              {/* Kind · What · Needs · By — priority: what (the item) is
                  identity and never drops, "by" is the decision column
                  since it carries the overdue flag, kind is a status pill
                  and drops into the detail line, needs is reference and
                  drops first. */}
              <div className="tbl-wrap">
                <table className="tbl" data-priority>
                  <thead>
                    <tr>
                      <th data-p="3">Kind</th>
                      <th data-p="1">What</th>
                      <th data-p="4">Needs</th>
                      <th data-p="2">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.data.items.map((item) => (
                      <tr key={item.id}>
                        <td data-p="3" data-label="Kind">
                          <Pill tone="idle">{KIND_LABEL[item.kind] ?? item.kind}</Pill>
                        </td>
                        <td data-p="1">{item.title}</td>
                        <td className="muted" data-p="4">
                          {item.detail}
                        </td>
                        <td data-p="2">
                          {item.dueOn === null ? (
                            <span className="muted">No date</span>
                          ) : item.dueOn < today ? (
                            <Pill tone="bad">{item.dueOn}</Pill>
                          ) : (
                            item.dueOn
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                shown={{ from: 1, to: actions.data.items.length }}
                of={actions.data.items.length}
                unit="decisions"
              />
            </>
          )}
        </div>
      </Section>

      <Section bare title="Record a decision that came in another way">
        <div className="card-b">
          <ExternalDecisionForm projectId={projectId} items={actions.data.items} />
        </div>
      </Section>

      {actions.data.recorded.length === 0 ? null : (
        <Section bare title={`Recorded from elsewhere — ${actions.data.recorded.length}`}>
          <div className="card-b">
            {/* When · Where it came from · Who said it · Decision · Note —
                priority: who said it is identity and never drops, decision
                is the decision column, when and the channel are money/status
                and drop into the detail line — "when" matters here because
                this table's whole point is what somebody questions later —
                and the note is reference and drops first. */}
            <div className="tbl-wrap">
              <table className="tbl" data-priority>
                <thead>
                  <tr>
                    <th data-p="3">When</th>
                    <th data-p="3">Where it came from</th>
                    <th data-p="1">Who said it</th>
                    <th data-p="2">Decision</th>
                    <th data-p="4">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.data.recorded.map((record) => (
                    <tr key={record.id}>
                      <td data-p="3" data-label="When">
                        {record.decidedOn}
                      </td>
                      <td data-p="3" data-label="Where it came from">
                        <Pill tone="idle">{record.channel}</Pill>
                      </td>
                      <td data-p="1">{record.saidBy === '' ? '—' : record.saidBy}</td>
                      <td data-p="2">{sentenceCase(record.decision.replace('_', ' '))}</td>
                      <td className="muted" data-p="4">
                        {record.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              shown={{ from: 1, to: actions.data.recorded.length }}
              of={actions.data.recorded.length}
              unit="decisions"
            />
            <p className="hint u-mb0">
              These rows cannot be edited. Where a decision came from is the part somebody questions
              later, and a record that can be rewritten answers nothing.
            </p>
          </div>
        </Section>
      )}

      <AbsentNotice title="A variation is recorded here and authorised on its own screen">
        A change order carries money and goes through the approval chain. Recording that the client
        said yes on the phone is worth doing; making that recording *the* authorisation would be a
        second path to approving a price change, and the whole point of the chain is that there is
        one.
      </AbsentNotice>
    </>
  );
}
