import type { ReactNode } from 'react';
import { API_ROUTES } from '@cog/contracts';
import { apiAsCaller } from '../../../../../lib/api';
import { AbsentNotice, Empty, NotFoundState, Pager, Pill, Refusal, Section, UnreachableState, load } from '@cog/design-system';
import { BookTimeForm } from './forms';
import { ProjectHead } from '../header';

export const metadata = { title: 'Time' };
export const dynamic = 'force-dynamic';

/**
 * Time booked against this job.
 *
 * **Whole minutes, never float hours.** The previous system stores hours as a
 * floating-point number, so a fortnight of half-hours totals something ending
 * in a tail of nines &mdash; and people stop trusting the number.
 *
 * **The hours-and-minutes string comes from the server.** `Math.*` is banned in
 * `apps/` outright — the rule exists because the legacy rounded TDS in a
 * browser — and there is no carve-out for "but this one is only minutes". The
 * server computes and the app displays, which is the right shape regardless.
 */

export default async function TimesheetsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const sheet = await load(await apiAsCaller(), API_ROUTES.timesheetsForProject, {
    params: { projectId },
  });

  if (sheet.kind === 'unreachable') return <UnreachableState />;
  if (sheet.kind === 'refused') {
    return sheet.error.code === 'NOT_FOUND' ? (
      <NotFoundState what="This page" backHref={`/projects/${projectId}`} backLabel="Back to the project" />
    ) : (
      <Refusal error={sheet.error} />
    );
  }

  return (
    <>
      <ProjectHead projectId={projectId} section="People" title="Timesheets" />
      <Section bare title={`Booked on this job — ${sheet.data.totalDuration}`}>
        <div className="card-b">
          {sheet.data.byPerson.length === 0 ? (
            <Empty illustration="projects" title="No time booked">
              Hours booked against this job, by whoever booked them.
            </Empty>
          ) : (
            <>
              {/* Who · Booked · Of which beyond the fee — priority: identity
                  never drops, booked time is the decision column, the
                  beyond-the-fee flag is money/status and drops into the
                  detail line. */}
              <div className="tbl-wrap">
                <table className="tbl" data-priority>
                  <thead>
                    <tr>
                      <th data-p="1">Who</th>
                      <th data-p="2">Booked</th>
                      <th data-p="3">Of which beyond the fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.data.byPerson.map((person) => (
                      <tr key={person.principalId}>
                        <td data-p="1">{person.principalEmail}</td>
                        <td data-p="2">{person.duration}</td>
                        <td data-p="3" data-label="Of which beyond the fee">
                          {person.additionalMinutes === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <Pill tone="warn">{person.additionalDuration}</Pill>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                shown={{ from: 1, to: sheet.data.byPerson.length }}
                of={sheet.data.byPerson.length}
                unit="people"
              />
            </>
          )}
        </div>
      </Section>

      <Section bare title="Book time">
        <div className="card-b">
          <BookTimeForm projectId={projectId} />
        </div>
      </Section>

      {sheet.data.entries.length === 0 ? null : (
        <Section bare title={`Entries — ${sheet.data.entries.length}`}>
          <div className="card-b">
            {/* Day · Who · Time · What — priority: what (the work performed)
                is identity and never drops, time is the decision column,
                day is money/status and drops into the detail line, who is
                reference and drops first. */}
            <div className="tbl-wrap">
              <table className="tbl" data-priority>
                <thead>
                  <tr>
                    <th data-p="3">Day</th>
                    <th data-p="4">Who</th>
                    <th data-p="2">Time</th>
                    <th data-p="1">What</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.data.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td data-p="3" data-label="Day">
                        {entry.workDate}
                      </td>
                      <td data-p="4">{entry.principalEmail}</td>
                      <td data-p="2">
                        {entry.duration}
                        {entry.additionalService ? <Pill tone="warn">Extra</Pill> : null}
                      </td>
                      <td data-p="1">
                        {entry.stage === '' ? null : <strong>{entry.stage}: </strong>}
                        {entry.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              shown={{ from: 1, to: sheet.data.entries.length }}
              of={sheet.data.entries.length}
              unit="entries"
            />
          </div>
        </Section>
      )}

      <AbsentNotice title="You can only book your own time">
        There is no field for whose hours these are. The previous system accepts an email address in
        the payload as a fallback, so anybody can book anybody&rsquo;s time by typing their address
        &mdash; and a timesheet somebody else filled in for you is not a timesheet.
      </AbsentNotice>

      <AbsentNotice title="Extra hours are flagged, not priced">
        Marking time as beyond the fee records that it happened. What it costs belongs on a change
        order, which goes through the approval chain &mdash; the same reasoning as the revision
        count on the design tab.
      </AbsentNotice>
    </>
  );
}
