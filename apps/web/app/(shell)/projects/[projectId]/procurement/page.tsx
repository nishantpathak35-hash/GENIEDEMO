import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { AbsentNotice, Empty, NotFoundState, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { ProjectHead } from '../header';
import { OrdersTabs } from '../../../purchase-orders/tabs';

export const metadata = { title: 'Procurement plan' };
export const dynamic = 'force-dynamic';

/**
 * What has to be ordered, and what is already too late.
 *
 * **Read-only, and there is nothing behind it to write.** The plan is the
 * selections and the brief's target date, looked at together — there is no
 * table for it because there is nothing a person would type here that is not
 * already recorded somewhere it belongs.
 *
 * The one rule is the conflict: an item whose lead time is longer than the days
 * remaining cannot arrive in time, and that is worth knowing on the day it is
 * chosen rather than on the day it does not turn up.
 */
export default async function ProcurementPlanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const plan = await load(await apiAsCaller(), API_ROUTES.procurementPlan, {
    params: { projectId },
  });

  if (plan.kind === 'unreachable') return <UnreachableState />;
  if (plan.kind === 'refused') {
    return plan.error.code === 'NOT_FOUND' ? (
      <NotFoundState what="This page" backHref={`/projects/${projectId}`} backLabel="Back to the project" />
    ) : (
      <Refusal error={plan.error} />
    );
  }

  return (
    <>
      <ProjectHead projectId={projectId} section="Build" title="Procurement plan" tabs={<OrdersTabs projectId={projectId} current="plan" />} />
      {plan.data.targetCompletionDate === null ? (
        <AbsentNotice title="There is no target completion date, so nothing can be late">
          Lead times are measured against the date on the current client brief, and this project has
          none. That is <strong>not</strong> the same as nothing being late &mdash; there is nothing
          to be late against. The previous system falls back to the last milestone&rsquo;s own
          planned finish, which means a project measures itself against itself and can never miss.
        </AbsentNotice>
      ) : plan.data.conflicts.length === 0 ? (
        <div className="notice">
          <p>
            Everything with a lead time can still arrive before{' '}
            <strong>{plan.data.targetCompletionDate}</strong>.
          </p>
        </div>
      ) : (
        <Section bare title={`Cannot arrive in time — ${plan.data.conflicts.length}`}>
          <div className="card-b">
            <p className="muted">
              Measured against <strong>{plan.data.targetCompletionDate}</strong>, the target
              completion on the current brief.
            </p>
            <div className="tbl-wrap">
              {/* Room · Item · Lead time · Days left · Short by · State —
                  priority: identity (item) never drops, state is the
                  decision column since it decides whether the fix is an
                  alternative or a simple change, short-by is the status
                  figure that drops into the detail line, room, lead time and
                  days left are reference and drop first. */}
              <table className="tbl" data-priority>
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Item</th>
                    <th>Lead time</th>
                    <th>Days left</th>
                    <th>Short by</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.data.conflicts.map((conflict) => (
                    <tr key={conflict.selectionId}>
                      <td data-p="4">{conflict.roomLabel === '' ? '—' : conflict.roomLabel}</td>
                      <td data-p="1">{conflict.itemName}</td>
                      <td data-p="4">{conflict.leadTimeWeeks} weeks</td>
                      <td data-p="4">{conflict.daysAvailable}</td>
                      <td data-p="3" data-label="Short by">
                        <Pill tone="bad">{conflict.daysShort} days</Pill>
                      </td>
                      <td data-p="2">
                        {conflict.isFrozen ? (
                          <Pill tone="warn">Approved — needs an alternative</Pill>
                        ) : (
                          <Pill tone="waiting">Not approved yet</Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              shown={{ from: 1, to: plan.data.conflicts.length }}
              of={plan.data.conflicts.length}
              unit="conflicts"
            />
            <p className="hint u-mb0">
              An approved item can only be changed by proposing an alternative, on the Selections
              tab, which carries how much sooner it arrives. One not yet approved can simply be
              changed.
            </p>
          </div>
        </Section>
      )}

      <Section bare title={`Long-lead items — ${plan.data.longLead.length}`}>
        <div className="card-b">
          {plan.data.longLead.length === 0 ? (
            <Empty illustration="projects" title="Nothing with a lead time recorded">
              A selection carries how many weeks it takes to arrive, and without that this list
              cannot be worked out — an empty list here is not the same as no risk.
            </Empty>
          ) : (
            <>
              <div className="tbl-wrap">
                {/* Room · Item · Lead time · State — priority: identity
                    (item) never drops, state is the decision column, lead
                    time is the status figure that drops into the detail
                    line, room is reference and drops first. */}
                <table className="tbl" data-priority>
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Item</th>
                      <th>Lead time</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.data.longLead.map((item) => (
                      <tr key={item.selectionId}>
                        <td data-p="4">{item.roomLabel === '' ? '—' : item.roomLabel}</td>
                        <td data-p="1">{item.itemName}</td>
                        <td data-p="3" data-label="Lead time">
                          {item.leadTimeWeeks} weeks
                        </td>
                        <td data-p="2">{sentenceCase(item.status.replace('_', ' '))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                shown={{ from: 1, to: plan.data.longLead.length }}
                of={plan.data.longLead.length}
                unit="items"
              />
            </>
          )}
        </div>
      </Section>

      <AbsentNotice title="There is nothing to fill in on this screen">
        Everything here is read from the selections and the brief. A procurement plan that is typed
        separately is a fourth copy of dates that already exist in three places, and it is the copy
        nobody updates.
      </AbsentNotice>
    </>
  );
}

/** Sentence case for a raw enum value with no label map on this screen. */
function sentenceCase(s: string): string {
  return s.length === 0 ? s : `${s[0]!.toUpperCase()}${s.slice(1)}`;
}
