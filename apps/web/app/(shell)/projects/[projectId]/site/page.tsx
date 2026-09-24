import type { ReactNode } from "react";
import Link from "next/link";
import { API_ROUTES } from "@cog/contracts";
import { apiAsCaller } from "../../../../../lib/api";
import { Absent, labelOf, load, type Options } from "@cog/design-system";
import { AbsentNotice, Empty, Pager, Section, Pill, Refusal, Stat, StatRow, UnreachableState } from "@cog/design-system";
import { pageLinks, pageState } from "../../../../../lib/paging";
import type { PillTone } from "@cog/design-system";
import { NewProjectDailyReportForm, RaiseSiteIssueForm, ResolveSiteIssueForm } from "./forms";
import { ProjectHead } from '../header';

export const dynamic = "force-dynamic";

const FILED_LABEL: Options = [
  ["true", "Filed"],
  ["false", "Draft"],
];

function filedTone(submitted: boolean): PillTone {
  return submitted ? "ok" : "idle";
}

/**
 * Site · Daily log, for one project.
 *
 * This is the design's "day card" (`.daysum`/`.photos` in
 * `docs/design/08-site.html`) — re-scoped to what `dailyReport` and
 * `weeklyAggregate` actually return.
 *
 * `weeklyAggregate` genuinely does carry a manpower figure — `personDays` and
 * `personDaysByTrade`, server-computed — so "This week" below is real, not
 * absent. It is a **week's** total, though, not the single day's headcount
 * the design draws (14 electricians · 9 carpenters · … for one date); nothing
 * returns that. The most recent report itself carries only
 * `reportDate`, `submitted` and `notes` — no manpower, no issues, no photos —
 * so the "day card" proper shows exactly those three and says what is missing
 * rather than drawing four mostly-dashed boxes.
 */
export default async function ProjectSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const sp = await searchParams;
  // This project's reports, latest first, one window at a time — the
  // endpoint filters by project and orders by day; nothing is sorted here.
  const paging = pageState(sp);
  const issuePaging = pageState(sp, "s");
  const client = await apiAsCaller();
  const [reports, weekly, issues] = await Promise.all([
    load(client, API_ROUTES.listDailyReports, {
      query: { ...paging.query, projectId },
    }),
    load(client, API_ROUTES.weeklyAggregate, { params: { projectId } }),
    load(client, API_ROUTES.listSiteIssues, {
      query: { ...issuePaging.query, projectId, status: "open" },
    }),
  ]);

  if (reports.kind === "unreachable") return <UnreachableState />;
  if (reports.kind === "refused") return <Refusal error={reports.error} />;

  const ownReports = reports.data.items;
  const latest = paging.from === 1 ? ownReports[0] : undefined;
  const hrefFor = (overrides: Record<string, string | undefined>): string => {
    const qp = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...sp, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== "") qp.set(key, value);
    }
    const qs = qp.toString();
    return qs === ""
      ? `/projects/${projectId}/site`
      : `/projects/${projectId}/site?${qs}`;
  };
  const links = pageLinks(paging, reports.data, hrefFor);
  const issueLinks =
    issues.kind === "ok" ? pageLinks(issuePaging, issues.data, hrefFor) : null;

  return (
    <>
      <ProjectHead projectId={projectId} section="Build" title="Site" />
      {weekly.kind === "ok" ? (
        <Section bare
          title="This week"
          sub={`${weekly.data.weekStart} – ${weekly.data.weekEnd}`}
        >
          <StatRow n={3}>
            <Stat
              label="Reported days"
              value={`${weekly.data.reportedDays} of 7`}
              note={
                weekly.data.missingDates.length === 0
                  ? "Every day this week is reported."
                  : `Still to file: ${weekly.data.missingDates.join(", ")}`
              }
            />
            <Stat
              label="Person-days this week"
              value={weekly.data.personDays}
              note={
                Object.entries(weekly.data.personDaysByTrade).length === 0
                  ? undefined
                  : Object.entries(weekly.data.personDaysByTrade)
                      .map(([trade, days]) => `${days} ${trade}`)
                      .join(" · ")
              }
            />
            <Stat
              label="Issuable"
              value={weekly.data.issuable ? "Yes" : "Not yet"}
              text
              note={
                weekly.data.issuable
                  ? undefined
                  : "Blocked until every day in the week is filed."
              }
            />
          </StatRow>
        </Section>
      ) : null}

      <Section bare
        title={
          latest === undefined
            ? "Daily log"
            : `Latest report — ${latest.reportDate}`
        }
      >
        {latest === undefined ? (
          <Empty
            illustration="daily"
            title="No daily reports for this project yet"
          >
            Record the first one below.
          </Empty>
        ) : (
          <div className="card-b">
            <p>
              <Pill tone={filedTone(latest.submitted)}>
                {labelOf(FILED_LABEL, String(latest.submitted))}
              </Pill>
            </p>
            <p>
              {latest.headCount === null
                ? "No head count recorded."
                : `${latest.headCount} on site.`}
            </p>
            <p>
              {latest.notes === "" ? (
                <span className="muted">No notes filed.</span>
              ) : (
                latest.notes
              )}
            </p>
          </div>
        )}
        <AbsentNotice title="No photographs on a report">
          Photographs are not part of this port; a report carries its day, its
          head count, its notes, and the issues raised against the project below.
        </AbsentNotice>
      </Section>

      <Section bare
        title="Open site issues"
        {...(issues.kind === "ok" ? { sub: `${issues.data.count} open` } : {})}
      >
        {issues.kind !== "ok" ? (
          <div className="card-b">
            <Absent why="The issues for this project could not be read." />
          </div>
        ) : issues.data.count === 0 ? (
          <Empty illustration="daily" title="Nothing is open on this site">
            Raise one below when something stops or slows the work.
          </Empty>
        ) : (
          <div className="tbl-wrap">
            {/* Issue(1) · Severity(2, decision) · Raised(3) · action */}
            <table className="tbl" data-priority="">
              <thead>
                <tr>
                  <th data-p="1">Issue</th>
                  <th data-p="2">Severity</th>
                  <th data-p="3">Raised</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {issues.data.items.map((issue) => (
                  <tr key={issue.id}>
                    <td data-p="1">{issue.title}</td>
                    <td data-p="2" data-label="Severity">
                      <Pill tone={issue.severity === "blocking" ? "bad" : issue.severity === "major" ? "warn" : "idle"}>
                        {issue.severity === "blocking" ? "Stops work" : issue.severity === "major" ? "Major" : "Minor"}
                      </Pill>
                    </td>
                    <td data-p="3" data-label="Raised">
                      {issue.raisedOn}
                    </td>
                    <td>
                      <ResolveSiteIssueForm issueId={issue.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {issueLinks === null ? null : (
              <Pager
                shown={issueLinks.shown}
                of={issues.data.count}
                unit="issues"
                next={issueLinks.next}
                prev={issueLinks.prev}
              />
            )}
          </div>
        )}
        <div className="card-b">
          <RaiseSiteIssueForm projectId={projectId} />
        </div>
      </Section>

      {ownReports.length > 0 ? (
        <Section bare title="All reports for this project">
          <div className="tbl-wrap">
            {/* Day(1) · Status(2, decision) · Notes(3) */}
            <table className="tbl" data-priority="">
              <thead>
                <tr>
                  <th data-p="1">Day</th>
                  <th data-p="2">Status</th>
                  <th className="num" data-p="3">On site</th>
                  <th data-p="3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {ownReports.map((r) => (
                  <tr key={r.id}>
                    <td data-p="1">{r.reportDate}</td>
                    <td data-p="2" data-label="Status">
                      <Pill tone={filedTone(r.submitted)}>
                        {labelOf(FILED_LABEL, String(r.submitted))}
                      </Pill>
                    </td>
                    <td className="num" data-p="3" data-label="On site">
                      {r.headCount === null ? <span className="muted">—</span> : r.headCount}
                    </td>
                    <td data-p="3" data-label="Notes">
                      {r.notes === "" ? (
                        <span className="muted">—</span>
                      ) : (
                        r.notes
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager
              shown={links.shown}
              of={reports.data.count}
              unit="reports"
              next={links.next}
              prev={links.prev}
            />
          </div>
        </Section>
      ) : null}

      <Section bare title="Record a daily report">
        <div className="card-b">
          <NewProjectDailyReportForm projectId={projectId} />
        </div>
      </Section>

      <p className="showing">
        <Link href="/site-reports">Every site&rsquo;s daily reports</Link>
      </p>
    </>
  );
}
