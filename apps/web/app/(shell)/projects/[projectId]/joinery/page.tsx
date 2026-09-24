import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { AbsentNotice, Empty, NotFoundState, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { AdvanceStageForm, NewPackageForm } from './forms';
import { ProjectHead } from '../header';

export const metadata = { title: 'Joinery' };
export const dynamic = 'force-dynamic';

/**
 * Bespoke joinery, from measurement to acceptance.
 *
 * **A stage cannot be signed off while an earlier one is outstanding**, and the
 * refusal names what is missing. You do not reach factory fabrication before the
 * shop drawing is approved, because the thing being fabricated is the drawing.
 *
 * The nine stages come from the previous system unchanged. Two separate
 * inspections, and dispatch kept apart from receipt, are what a shorter list
 * loses — and they are the two points where a package goes missing.
 */
export default async function JoineryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const packages = await load(await apiAsCaller(), API_ROUTES.joineryForProject, {
    params: { projectId },
  });

  if (packages.kind === 'unreachable') return <UnreachableState />;
  if (packages.kind === 'refused') {
    return packages.error.code === 'NOT_FOUND' ? (
      <NotFoundState what="This page" backHref={`/projects/${projectId}`} backLabel="Back to the project" />
    ) : (
      <Refusal error={packages.error} />
    );
  }

  return (
    <>
      <ProjectHead projectId={projectId} section="Design" title="Joinery" />
      {packages.data.items.length === 0 ? (
        <Section bare title="No packages yet">
          <div className="card-b">
            <Empty illustration="projects" title="Nothing in the workshop">
              A joinery package is one thing being made to order — a reception desk, a run of
              storage — and it gets its own nine stages the moment it is created.
            </Empty>
          </div>
        </Section>
      ) : (
        packages.data.items.map((pkg) => {
          const done = pkg.stages.filter((s) => s.status === 'completed').length;
          return (
            <Section bare key={pkg.id} title={`${pkg.name} — ${pkg.currentStage}`}>
              <div className="card-b">
                <dl className="kv">
                  <dt>Where</dt>
                  <dd>
                    {pkg.roomLabel === '' ? <span className="muted">Not said</span> : pkg.roomLabel}
                  </dd>
                  <dt>Workshop</dt>
                  <dd>
                    {pkg.workshop === '' ? <span className="muted">Not said</span> : pkg.workshop}
                  </dd>
                  <dt>Install by</dt>
                  <dd>{pkg.targetInstallDate ?? '—'}</dd>
                  <dt>Progress</dt>
                  <dd>
                    {done} of {pkg.stages.length} signed off
                  </dd>
                </dl>

                <div className="tbl-wrap">
                  {/* # · Stage · State · Signed off · (actions) — priority:
                      identity (stage name) never drops, state is the
                      decision column, signed-off date is a status figure
                      that drops into the detail line, the position number
                      and the action button are reference and drop first. */}
                  <table className="tbl" data-priority>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Stage</th>
                        <th>State</th>
                        <th>Signed off</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {pkg.stages.map((stage) => (
                        <tr key={stage.id}>
                          <td data-p="4">{stage.position + 1}</td>
                          <td data-p="1">
                            {stage.name}
                            {stage.notes === '' ? null : (
                              <>
                                <br />
                                <span className="muted">{stage.notes}</span>
                              </>
                            )}
                          </td>
                          <td data-p="2">
                            <Pill tone={stage.status === 'completed' ? 'ok' : 'idle'}>
                              {stage.status === 'completed' ? 'Signed off' : 'Outstanding'}
                            </Pill>
                          </td>
                          <td data-p="3" data-label="Signed off">
                            {stage.completedAt ?? '—'}
                          </td>
                          <td data-p="4">
                            {stage.status === 'completed' ? null : (
                              <AdvanceStageForm
                                stageId={stage.id}
                                stageName={stage.name}
                                projectId={projectId}
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  shown={{ from: 1, to: pkg.stages.length }}
                  of={pkg.stages.length}
                  unit="stages"
                />
              </div>
            </Section>
          );
        })
      )}

      <Section bare title="Start a package">
        <div className="card-b">
          <NewPackageForm projectId={projectId} />
        </div>
      </Section>

      <AbsentNotice title="The stages cannot be skipped or reordered">
        Signing one off while an earlier one is outstanding is refused, and the refusal says which
        ones. That is the whole reason a joinery package is tracked apart from a purchase order: an
        order is placed once, and a package passes through nine hands.
      </AbsentNotice>
    </>
  );
}
