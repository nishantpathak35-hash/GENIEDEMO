import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { AbsentNotice, Empty, NotFoundState, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { NewMilestoneForm, ProgressForm } from './forms';
import { ProjectHead } from '../header';

export const metadata = { title: 'Milestones' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, 'ok' | 'warn' | 'bad' | 'active' | 'idle'> = {
  not_started: 'idle',
  in_progress: 'active',
  delayed: 'bad',
  complete: 'ok',
};

const LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  delayed: 'Delayed',
  complete: 'Complete',
};

/**
 * Site milestones, planned against actual.
 *
 * **A delayed milestone carries a reason.** Refused without one, by the route
 * and by the database. A red flag with nothing beside it tells nobody anything
 * three weeks later, which is exactly when somebody reads it.
 *
 * There is no predecessor field, no critical-path flag and no site-readiness
 * gate. The previous system stores all three and reads none of them &mdash; and
 * its readiness gate defaults to &ldquo;Passed&rdquo;.
 */
export default async function MilestonesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const milestones = await load(await apiAsCaller(), API_ROUTES.milestonesForProject, {
    params: { projectId },
  });

  if (milestones.kind === 'unreachable') return <UnreachableState />;
  if (milestones.kind === 'refused') {
    return milestones.error.code === 'NOT_FOUND' ? (
      <NotFoundState what="This page" backHref={`/projects/${projectId}`} backLabel="Back to the project" />
    ) : (
      <Refusal error={milestones.error} />
    );
  }

  const lookahead = milestones.data.items.filter((m) => m.inLookahead);
  const late = milestones.data.items.filter((m) => (m.daysLate ?? 0) > 0);

  return (
    <>
      <ProjectHead projectId={projectId} section="Build" title="Milestones" />
      {lookahead.length === 0 ? null : (
        <Section bare title={`Next fortnight — ${String(lookahead.length)}`}>
          <div className="card-b">
            <p className="muted">
              Starting within fourteen days and not finished. This is the list somebody reads on a
              Monday.
            </p>
            {/* Milestone · Trade · Planned · State — priority: identity never
                drops, state is the decision column, the planned window is
                money/status and drops into the detail line, trade is
                reference and drops first. */}
            <div className="tbl-wrap">
              <table className="tbl" data-priority>
                <thead>
                  <tr>
                    <th data-p="1">Milestone</th>
                    <th data-p="4">Trade</th>
                    <th data-p="3">Planned</th>
                    <th data-p="2">State</th>
                  </tr>
                </thead>
                <tbody>
                  {lookahead.map((m) => (
                    <tr key={m.id}>
                      <td data-p="1">{m.name}</td>
                      <td data-p="4">{m.trade === '' ? '—' : m.trade}</td>
                      <td data-p="3" data-label="Planned">
                        {m.plannedStart} to {m.plannedFinish}
                      </td>
                      <td data-p="2">
                        <Pill tone={TONE[m.status] ?? 'idle'}>{LABEL[m.status] ?? m.status}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager shown={{ from: 1, to: lookahead.length }} of={lookahead.length} unit="milestones" />
          </div>
        </Section>
      )}

      <Section bare
        title={`All milestones — ${String(milestones.data.items.length)}${
          late.length > 0 ? `, ${String(late.length)} late` : ''
        }`}
      >
        <div className="card-b">
          {milestones.data.items.length === 0 ? (
            <Empty illustration="projects" title="No milestones yet">
              A milestone is a date the site is working towards, and without one there is nothing
              to be late against.
            </Empty>
          ) : (
            <>
              {/* Milestone · Planned · Actual · Late by · State — priority:
                  identity never drops, state is the decision column, planned
                  and actual are money/status and drop into the detail line,
                  "late by" and the action column are reference and drop
                  first. */}
              <div className="tbl-wrap">
                <table className="tbl" data-priority>
                  <thead>
                    <tr>
                      <th data-p="1">Milestone</th>
                      <th data-p="3">Planned</th>
                      <th data-p="3">Actual</th>
                      <th data-p="4">Late by</th>
                      <th data-p="2">State</th>
                      <th data-p="4" />
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.data.items.map((m) => (
                      <tr key={m.id}>
                        <td data-p="1">
                          {m.name}
                          {m.delayReason === '' ? null : (
                            <>
                              <br />
                              <span className="muted">{m.delayReason}</span>
                            </>
                          )}
                          {m.recoveryPlan === '' ? null : (
                            <>
                              <br />
                              <span className="muted">Recovery: {m.recoveryPlan}</span>
                            </>
                          )}
                        </td>
                        <td data-p="3" data-label="Planned">
                          {m.plannedStart} to {m.plannedFinish}
                        </td>
                        <td data-p="3" data-label="Actual">
                          {m.actualStart ?? '—'} to {m.actualFinish ?? '—'}
                        </td>
                        <td data-p="4">
                          {m.daysLate === null || m.daysLate === 0 ? (
                            '—'
                          ) : (
                            <Pill tone="bad">{m.daysLate} days</Pill>
                          )}
                        </td>
                        <td data-p="2">
                          <Pill tone={TONE[m.status] ?? 'idle'}>{LABEL[m.status] ?? m.status}</Pill>
                        </td>
                        <td data-p="4">
                          {m.status === 'complete' ? null : (
                            <ProgressForm milestoneId={m.id} projectId={projectId} status={m.status} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                shown={{ from: 1, to: milestones.data.items.length }}
                of={milestones.data.items.length}
                unit="milestones"
              />
            </>
          )}
        </div>
      </Section>

      <Section bare title="Add a milestone">
        <div className="card-b">
          <NewMilestoneForm projectId={projectId} />
        </div>
      </Section>

      <AbsentNotice title="No predecessor, no critical path, no readiness gate">
        The previous system has all three columns and reads none of them: nothing checks that a
        predecessor finished, nothing queries the critical-path flag, and the readiness gate
        defaults to <code>Passed</code>. A field that looks like a dependency and enforces nothing
        is worse than its absence, because people fill it in and then believe it.
      </AbsentNotice>
    </>
  );
}
