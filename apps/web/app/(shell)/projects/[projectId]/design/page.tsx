import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { AbsentNotice, Empty, NotFoundState, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { NewDeliverableForm, ReviewForm, SubmitDeliverableButton } from './forms';
import { ProjectHead } from '../header';

export const metadata = { title: 'Design' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, 'ok' | 'warn' | 'bad' | 'active' | 'idle'> = {
  draft: 'idle',
  submitted: 'active',
  approved: 'ok',
  revision_requested: 'warn',
  rejected: 'bad',
};

const LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Out for review',
  approved: 'Approved',
  revision_requested: 'Revision asked for',
  rejected: 'Rejected',
};

/**
 * Drawings and views, and what people said about them.
 *
 * **Revisions are counted, and the one past an agreed limit is flagged.** It is
 * flagged, not priced: a variation is authorised on a change order, where it
 * goes through the approval chain. The previous system says exactly this in a
 * comment and then does the same thing, which is the reason this workflow was
 * judged solid rather than sketched.
 *
 * A deliverable with **no agreed limit never gets flagged**, and the column
 * says so rather than assuming two.
 */
export default async function DesignPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const deliverables = await load(await apiAsCaller(), API_ROUTES.deliverablesForProject, {
    params: { projectId },
  });

  if (deliverables.kind === 'unreachable') return <UnreachableState />;
  if (deliverables.kind === 'refused') {
    return deliverables.error.code === 'NOT_FOUND' ? (
      <NotFoundState what="This page" backHref={`/projects/${projectId}`} backLabel="Back to the project" />
    ) : (
      <Refusal error={deliverables.error} />
    );
  }

  const beyond = deliverables.data.items.filter((d) => d.beyondIncludedRevisions);

  return (
    <>
      <ProjectHead projectId={projectId} section="Design" title="Design" />
      {beyond.length === 0 ? null : (
        <div className="notice refused">
          <p>
            <strong>
              {beyond.length} deliverable{beyond.length === 1 ? '' : 's'} past the included revision
              count.
            </strong>{' '}
            Nothing has been charged for. Raise a change order if the extra work is to be billed
            &mdash; a fee written against a drawing is a charge nobody authorised.
          </p>
        </div>
      )}

      <Section bare title={`Deliverables — ${deliverables.data.items.length}`}>
        <div className="card-b">
          {deliverables.data.items.length === 0 ? (
            <Empty illustration="projects" title="Nothing issued yet">
              A deliverable is a drawing or a view that goes to the client with a revision number on
              it.
            </Empty>
          ) : (
            <>
              <div className="tbl-wrap">
                {/* Deliverable · Revision · Included · State · Due · (actions) —
                    priority: identity never drops, state is the decision column,
                    included-revisions carries the past-limit flag and drops into
                    the detail line, revision label, due date and the row action
                    are reference and drop first. */}
                <table className="tbl" data-priority>
                  <thead>
                    <tr>
                      <th data-p="1">Deliverable</th>
                      <th data-p="4">Revision</th>
                      <th data-p="3">Included</th>
                      <th data-p="2">State</th>
                      <th data-p="4">Due</th>
                      <th data-p="4" />
                    </tr>
                  </thead>
                  <tbody>
                    {deliverables.data.items.map((item) => (
                      <tr key={item.id}>
                        <td data-p="1">
                          {item.name}
                          {item.stage === '' ? null : <span className="muted"> · {item.stage}</span>}
                          {item.reviews.length === 0 ? null : (
                            <>
                              <br />
                              <span className="muted">
                                Last:{' '}
                                {item.reviews[0] === undefined
                                  ? ''
                                  : (LABEL[item.reviews[0].decision] ?? item.reviews[0].decision)}{' '}
                                by the {item.reviews[0]?.reviewerKind} reviewer
                              </span>
                            </>
                          )}
                        </td>
                        <td data-p="4">
                          {item.versionLabel}{' '}
                          <span className="muted">({item.revisionCount} issued)</span>
                        </td>
                        <td data-p="3" data-label="Included">
                          {item.includedRevisionsLimit === null ? (
                            <span className="muted">No limit agreed</span>
                          ) : (
                            <>
                              {item.revisionCount} of {item.includedRevisionsLimit}{' '}
                              {item.beyondIncludedRevisions ? <Pill tone="warn">Past it</Pill> : null}
                            </>
                          )}
                        </td>
                        <td data-p="2">
                          <Pill tone={TONE[item.status] ?? 'idle'}>
                            {LABEL[item.status] ?? item.status}
                          </Pill>
                        </td>
                        <td data-p="4">{item.dueDate ?? '—'}</td>
                        <td data-p="4">
                          {item.status === 'submitted' ? (
                            <ReviewForm deliverableId={item.id} projectId={projectId} />
                          ) : item.status === 'approved' ? (
                            <span className="muted">Frozen</span>
                          ) : (
                            <SubmitDeliverableButton deliverableId={item.id} projectId={projectId} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                shown={{ from: 1, to: deliverables.data.items.length }}
                of={deliverables.data.items.length}
                unit="deliverables"
              />
            </>
          )}
        </div>
      </Section>

      <Section bare title="Add a deliverable">
        <div className="card-b">
          <NewDeliverableForm projectId={projectId} />
        </div>
      </Section>

      <AbsentNotice title="There is no fee field on a revision">
        The previous system has a column for one and deliberately writes zero into it, with a
        comment saying variations must be authorised through change orders rather than arbitrary
        fees. That reasoning is right and it is why there is no field here at all: the flag says the
        work went past what was included, and the change order says what it costs.
      </AbsentNotice>
    </>
  );
}
