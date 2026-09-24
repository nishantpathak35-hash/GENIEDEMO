import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { AbsentNotice, Empty, NotFoundState, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { IssueHandoverForm, NewItemForm, RectifyForm } from './forms';
import { ProjectHead } from '../header';

export const metadata = { title: 'Handover' };
export const dynamic = 'force-dynamic';

const SEVERITY_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'idle'> = {
  minor: 'idle',
  major: 'warn',
  critical: 'bad',
};

/**
 * Handing the finished job to the client.
 *
 * **The handover is refused while any critical item is still open**, with the
 * count in the refusal. A handover that can be issued over open critical
 * defects is one nobody would trust, and this is the rule the previous system
 * got right.
 *
 * **Rectifying an item needs a photograph.** The whole value of a punch list is
 * that items cannot be ticked off to clear it.
 */
export default async function HandoverPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const state = await load(await apiAsCaller(), API_ROUTES.handoverForProject, {
    params: { projectId },
  });

  if (state.kind === 'unreachable') return <UnreachableState />;
  if (state.kind === 'refused') {
    return state.error.code === 'NOT_FOUND' ? (
      <NotFoundState what="This page" backHref={`/projects/${projectId}`} backLabel="Back to the project" />
    ) : (
      <Refusal error={state.error} />
    );
  }

  const open = state.data.items.filter((i) => i.status === 'open');

  return (
    <>
      <ProjectHead projectId={projectId} section="Close" title="Handover" />
      {state.data.record !== null ? (
        <Section bare title="Handed over">
          <div className="card-b">
            <dl className="kv">
              <dt>When</dt>
              <dd>{state.data.record.issuedAt}</dd>
              <dt>Items at the time</dt>
              <dd>
                {state.data.record.rectifiedItems} of {state.data.record.totalItems} rectified,{' '}
                {state.data.record.openMinor} left open
              </dd>
            </dl>
            {state.data.record.notes === '' ? null : <p>{state.data.record.notes}</p>}
            <p className="hint u-mb0">
              Those counts are what was true on the day. Items closed since have not changed them
              &mdash; a handover that rewrites itself afterwards is not a record of anything.
            </p>
          </div>
        </Section>
      ) : state.data.blocking > 0 ? (
        <div className="notice refused">
          <p>
            <strong>
              {state.data.blocking} critical item{state.data.blocking === 1 ? '' : 's'} still open.
            </strong>{' '}
            The handover is refused until they are rectified. Minor and major items can be left
            open, and are recorded as open.
          </p>
        </div>
      ) : null}

      <Section bare title={`Punch list — ${state.data.items.length}, ${open.length} open`}>
        <div className="card-b">
          {state.data.items.length === 0 ? (
            <Empty illustration="projects" title="Nothing raised">
              A snag, a defect, or something not finished, raised with a photograph and a
              severity — the critical ones stop the handover.
            </Empty>
          ) : (
            <>
              {/* Where · What · Severity · With · State — priority: what
                  (the item raised) is identity and never drops, state is
                  the decision column, severity is money/status and drops
                  into the detail line, where, with and the rectify action
                  are reference and drop first. */}
              <div className="tbl-wrap">
                <table className="tbl" data-priority>
                  <thead>
                    <tr>
                      <th data-p="4">Where</th>
                      <th data-p="1">What</th>
                      <th data-p="3">Severity</th>
                      <th data-p="4">With</th>
                      <th data-p="2">State</th>
                      <th data-p="4" />
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.items.map((item) => (
                      <tr key={item.id}>
                        <td data-p="4">{item.roomLabel === '' ? '—' : item.roomLabel}</td>
                        <td data-p="1">
                          {item.description}
                          {item.notes === '' ? null : (
                            <>
                              <br />
                              <span className="muted">{item.notes}</span>
                            </>
                          )}
                        </td>
                        <td data-p="3" data-label="Severity">
                          <Pill tone={SEVERITY_TONE[item.severity] ?? 'idle'}>{item.severity}</Pill>
                        </td>
                        <td data-p="4">{item.assignedTo === '' ? '—' : item.assignedTo}</td>
                        <td data-p="2">
                          <Pill tone={item.status === 'open' ? 'warn' : 'ok'}>{item.status}</Pill>
                          {item.rectifiedAt === null ? null : (
                            <>
                              <br />
                              <span className="muted">{item.rectifiedAt}</span>
                            </>
                          )}
                        </td>
                        <td data-p="4">
                          {item.status === 'open' ? (
                            <RectifyForm itemId={item.id} projectId={projectId} />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                shown={{ from: 1, to: state.data.items.length }}
                of={state.data.items.length}
                unit="items"
              />
            </>
          )}
        </div>
      </Section>

      <Section bare title="Raise an item">
        <div className="card-b">
          <NewItemForm projectId={projectId} />
        </div>
      </Section>

      {state.data.record === null ? (
        <Section bare title="Hand it over">
          <div className="card-b">
            <IssueHandoverForm projectId={projectId} blocking={state.data.blocking} />
          </div>
        </Section>
      ) : null}

      <AbsentNotice title="There is no handover pack to download">
        The previous system returns a link to <code>/api/handover-packs/…-closeout.pdf</code>, an
        endpoint that does not exist, next to a field holding the same counts as a JSON string. A
        link to a document nobody generates is worse than no link, because somebody sends it to a
        client. What is recorded here is that the handover happened and what was true when it did.
      </AbsentNotice>
    </>
  );
}
