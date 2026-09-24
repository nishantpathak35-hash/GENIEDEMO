import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { formatIndianRupeesOrDash, formatRupeesOrEmpty } from '@cog/money';
import { apiAsCaller } from '../../../../../lib/api';
import { AbsentNotice, Empty, NotFoundState, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { AcknowledgeBriefForm, BriefForm, BriefRoomForm, BriefStatementForm } from './forms';
import { ProjectHead } from '../header';

export const metadata = { title: 'Brief' };
export const dynamic = 'force-dynamic';

const STATEMENT_LABELS: Record<string, string> = {
  decision_maker: 'Who decides',
  client_supplied: 'The client supplies',
  assumption: 'Assumed',
  exclusion: 'Excluded',
};

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'active' | 'idle'> = {
  draft: 'idle',
  issued: 'active',
  acknowledged: 'ok',
  superseded: 'idle',
};

/**
 * What the client asked for.
 *
 * **An acknowledged brief is frozen.** Saving a change to one creates the next
 * version and marks this one superseded; it is never edited in place. Every
 * version stays readable, because what the client agreed to before the scope
 * changed is the thing somebody needs when the argument starts.
 *
 * This module is **off until a tenant switches it on**, in Settings → Modules,
 * and every one of its endpoints answers as though it does not exist until they
 * do. The panel below says so rather than showing a refusal that reads like a
 * fault.
 */
export default async function BriefPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const briefs = await load(await apiAsCaller(), API_ROUTES.briefsForProject, {
    params: { projectId },
  });

  if (briefs.kind === 'unreachable') return <UnreachableState />;

  // A 404 from every route of a module is what `moduleGate` answers when the
  // module is off. Distinguishing it here is the difference between "your
  // organisation does not use this" and "something is broken".
  if (briefs.kind === 'refused') {
    return briefs.error.code === 'NOT_FOUND' ? (
      <NotFoundState what="This page" backHref={`/projects/${projectId}`} backLabel="Back to the project" />
    ) : (
      <Refusal error={briefs.error} />
    );
  }

  const current = briefs.data.items[0];
  const superseded = briefs.data.items.slice(1);

  return (
    <>
      <ProjectHead projectId={projectId} section="Design" title="Brief" />
      {current === undefined ? (
        <Section bare title="No brief yet">
          <div className="card-b">
            <Empty illustration="projects" title="Nothing has been written down">
              A brief is what the client asked for, in their words, before design starts — write
              the first version here.
            </Empty>
            <BriefForm projectId={projectId} />
          </div>
        </Section>
      ) : (
        <>
          <Section bare title={`Version ${String(current.version)}`}>
            <div className="card-b">
              <dl className="kv">
                <dt>State</dt>
                <dd>
                  <Pill tone={STATUS_TONE[current.status] ?? 'idle'}>{current.status}</Pill>
                  {current.acknowledgedAt === null ? null : (
                    <span className="muted"> Acknowledged {current.acknowledgedAt}</span>
                  )}
                </dd>
                <dt>Engagement</dt>
                <dd>{current.engagementType === '' ? <span className="muted">Not said</span> : current.engagementType}</dd>
                <dt>Budget</dt>
                <dd>
                  {current.budgetMinPaise === null && current.budgetMaxPaise === null ? (
                    <span className="muted">Not discussed</span>
                  ) : (
                    <>
                      {formatIndianRupeesOrDash(current.budgetMinPaise)} to{' '}
                      {formatIndianRupeesOrDash(current.budgetMaxPaise)}
                    </>
                  )}
                </dd>
                <dt>Target</dt>
                <dd>
                  {current.targetStartDate ?? '—'} to {current.targetCompletionDate ?? '—'}
                </dd>
                <dt>Who signs off</dt>
                <dd>
                  {current.approvalAuthority === '' ? (
                    <span className="muted">Not said</span>
                  ) : (
                    current.approvalAuthority
                  )}
                </dd>
              </dl>
              {current.scopeSummary === '' ? null : <p>{current.scopeSummary}</p>}

              {current.status === 'acknowledged' ? (
                <div className="notice">
                  <p>
                    <strong>The client has acknowledged this version, so it is frozen.</strong>{' '}
                    Saving a change below creates version {String(current.version + 1)} as a copy of
                    this one, and this version keeps its rooms, its statements and the record of who
                    acknowledged it.
                  </p>
                </div>
              ) : (
                <AcknowledgeBriefForm briefId={current.id} projectId={projectId} status={current.status} />
              )}
            </div>
          </Section>

          <Section bare title="Rooms">
            <div className="card-b">
              {current.rooms.length === 0 ? (
                <Empty illustration="projects" title="No rooms yet">
                  A brief without rooms is a paragraph — the rooms are what gets designed, costed
                  and handed over.
                </Empty>
              ) : (
                <>
                  <div className="tbl-wrap">
                    {/* Room · Area · People · What it is for — priority: identity (room)
                        never drops, purpose is the decision column since it is why the
                        room exists in the brief, area and headcount are reference
                        metrics and drop first. */}
                    <table className="tbl" data-priority>
                      <thead>
                        <tr>
                          <th data-p="1">Room</th>
                          <th data-p="4">Area</th>
                          <th data-p="4">People</th>
                          <th data-p="2">What it is for</th>
                        </tr>
                      </thead>
                      <tbody>
                        {current.rooms.map((room) => (
                          <tr key={room.id}>
                            <td data-p="1">{room.roomName}</td>
                            <td data-p="4">
                              {room.areaSqft === null ? '—' : `${String(room.areaSqft)} sq ft`}
                            </td>
                            <td data-p="4">{room.headcount === null ? '—' : String(room.headcount)}</td>
                            <td data-p="2">
                              {room.purpose}
                              {room.requirements === '' ? null : (
                                <>
                                  <br />
                                  <span className="muted">{room.requirements}</span>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pager
                    shown={{ from: 1, to: current.rooms.length }}
                    of={current.rooms.length}
                    unit="rooms"
                  />
                </>
              )}
              {current.status === 'acknowledged' ? null : (
                <BriefRoomForm briefId={current.id} projectId={projectId} />
              )}
            </div>
          </Section>

          <Section bare title="What was agreed around the edges">
            <div className="card-b">
              {current.statements.length === 0 ? (
                <Empty illustration="projects" title="Nothing recorded">
                  Who decides, what the client supplies, what is assumed and what is excluded —
                  these four are where a scope argument usually starts.
                </Empty>
              ) : (
                <dl className="kv">
                  {Object.entries(STATEMENT_LABELS).map(([kind, label]) => {
                    const some = current.statements.filter((s) => s.kind === kind);
                    if (some.length === 0) return null;
                    return (
                      <div key={kind}>
                        <dt>{label}</dt>
                        <dd>
                          <ul>
                            {some.map((s) => (
                              <li key={s.id}>{s.body}</li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
              {current.status === 'acknowledged' ? null : (
                <BriefStatementForm briefId={current.id} projectId={projectId} />
              )}
            </div>
          </Section>

          <Section bare title="Change the brief">
            <div className="card-b">
              <BriefForm
                projectId={projectId}
                engagementType={current.engagementType}
                scopeSummary={current.scopeSummary}
                budgetMin={formatRupeesOrEmpty(current.budgetMinPaise)}
                budgetMax={formatRupeesOrEmpty(current.budgetMaxPaise)}
                targetStartDate={current.targetStartDate}
                targetCompletionDate={current.targetCompletionDate}
                approvalAuthority={current.approvalAuthority}
                frozen={current.status === 'acknowledged'}
              />
            </div>
          </Section>

          {superseded.length === 0 ? null : (
            <Section bare title={`Earlier versions — ${String(superseded.length)}`}>
              <div className="card-b">
                <div className="tbl-wrap">
                  {/* Version · State · Acknowledged · Rooms — priority: identity
                      (version) never drops, state is the decision column,
                      acknowledged date is a status figure that drops into the
                      detail line, room count is reference and drops first. */}
                  <table className="tbl" data-priority>
                    <thead>
                      <tr>
                        <th data-p="1">Version</th>
                        <th data-p="2">State</th>
                        <th data-p="3">Acknowledged</th>
                        <th data-p="4">Rooms</th>
                      </tr>
                    </thead>
                    <tbody>
                      {superseded.map((old) => (
                        <tr key={old.id}>
                          <td data-p="1">{old.version}</td>
                          <td data-p="2">
                            <Pill tone={STATUS_TONE[old.status] ?? 'idle'}>{old.status}</Pill>
                          </td>
                          <td data-p="3" data-label="Acknowledged">
                            {old.acknowledgedAt ?? '—'}
                          </td>
                          <td data-p="4">{old.rooms.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  shown={{ from: 1, to: superseded.length }}
                  of={superseded.length}
                  unit="versions"
                />
                <p className="hint u-mb0">
                  Kept, not deleted. What the client agreed to before the scope changed is the thing
                  somebody needs when there is a disagreement about what was in it.
                </p>
              </div>
            </Section>
          )}
        </>
      )}
    </>
  );
}
