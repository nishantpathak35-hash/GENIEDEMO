import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { AbsentNotice, Empty, NotFoundState, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { DecideCaseForm, NewCaseForm } from './forms';
import { ProjectHead } from '../header';

export const metadata = { title: 'Warranty' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, 'ok' | 'warn' | 'bad' | 'active' | 'idle'> = {
  reported: 'active',
  in_progress: 'warn',
  resolved: 'ok',
  rejected: 'idle',
};

/** `claim.status` has no label map, only a tone map — sentence-case its words rather than render the raw enum. */
function sentenceCase(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Claims after handover.
 *
 * **Nothing here is invented.** The previous system fills in a response
 * deadline of seven days from now, a category of &ldquo;Carpentry&rdquo;, a
 * contractor called &ldquo;General Works&rdquo; and a client called
 * &ldquo;Client&rdquo; &mdash; and then reads none of them. Every one of those
 * fields is empty here until somebody fills it in.
 *
 * The one that IS read is the promised date: a claim past it and still open is
 * shown as overdue. A date nothing looks at is decoration.
 */
export default async function WarrantyPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const cases = await load(await apiAsCaller(), API_ROUTES.warrantyForProject, {
    params: { projectId },
  });

  if (cases.kind === 'unreachable') return <UnreachableState />;
  if (cases.kind === 'refused') {
    return cases.error.code === 'NOT_FOUND' ? (
      <NotFoundState what="This page" backHref={`/projects/${projectId}`} backLabel="Back to the project" />
    ) : (
      <Refusal error={cases.error} />
    );
  }

  const overdue = cases.data.items.filter((c) => c.overdue);
  const open = cases.data.items.filter(
    (c) => c.status === 'reported' || c.status === 'in_progress',
  );

  return (
    <>
      <ProjectHead projectId={projectId} section="Close" title="Warranty" />
      {overdue.length === 0 ? null : (
        <div className="notice refused">
          <p>
            <strong>
              {overdue.length} claim{overdue.length === 1 ? '' : 's'} past the date somebody promised.
            </strong>{' '}
            That date was set by a person on this screen, not by the software.
          </p>
        </div>
      )}

      <Section bare title={`Claims — ${cases.data.items.length}, ${open.length} open`}>
        <div className="card-b">
          {cases.data.items.length === 0 ? (
            <Empty illustration="projects" title="No claims">
              What the client has reported since handover, and what was done about it.
            </Empty>
          ) : (
            <>
              {/* Claim · Trade · Reported · Promised by · State — priority:
                  claim (the title and its notes) is identity and never
                  drops, state is the decision column, "promised by" carries
                  the overdue flag so it is money/status and drops into the
                  detail line, trade, reported and the action column are
                  reference and drop first. */}
              <div className="tbl-wrap">
                <table className="tbl" data-priority>
                  <thead>
                    <tr>
                      <th data-p="1">Claim</th>
                      <th data-p="4">Trade</th>
                      <th data-p="4">Reported</th>
                      <th data-p="3">Promised by</th>
                      <th data-p="2">State</th>
                      <th data-p="4" />
                    </tr>
                  </thead>
                  <tbody>
                    {cases.data.items.map((claim) => (
                      <tr key={claim.id}>
                        <td data-p="1">
                          {claim.title}
                          {claim.description === '' ? null : (
                            <>
                              <br />
                              <span className="muted">{claim.description}</span>
                            </>
                          )}
                          {claim.resolutionNotes === '' ? null : (
                            <>
                              <br />
                              <span className="muted">Resolution: {claim.resolutionNotes}</span>
                            </>
                          )}
                        </td>
                        <td data-p="4">
                          {claim.category === '' ? (
                            <span className="muted">Not said</span>
                          ) : (
                            claim.category
                          )}
                        </td>
                        <td data-p="4">{claim.reportedOn}</td>
                        <td data-p="3" data-label="Promised by">
                          {claim.respondBy === null ? (
                            <span className="muted">Nothing promised</span>
                          ) : (
                            <>
                              {claim.respondBy} {claim.overdue ? <Pill tone="bad">Overdue</Pill> : null}
                            </>
                          )}
                        </td>
                        <td data-p="2">
                          <Pill tone={TONE[claim.status] ?? 'idle'}>
                            {sentenceCase(claim.status.replace('_', ' '))}
                          </Pill>
                        </td>
                        <td data-p="4">
                          {claim.status === 'resolved' || claim.status === 'rejected' ? null : (
                            <DecideCaseForm caseId={claim.id} projectId={projectId} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                shown={{ from: 1, to: cases.data.items.length }}
                of={cases.data.items.length}
                unit="claims"
              />
            </>
          )}
        </div>
      </Section>

      <Section bare title="Raise a claim">
        <div className="card-b">
          <NewCaseForm projectId={projectId} />
        </div>
      </Section>

      <AbsentNotice title="No response deadline is set for you">
        The previous system writes one seven days out whenever the field is empty, which is a
        service-level commitment made by software rather than by anybody. Leave it empty here and
        nothing is promised; set one and it is read &mdash; the claim shows as overdue when the date
        passes.
      </AbsentNotice>
    </>
  );
}
