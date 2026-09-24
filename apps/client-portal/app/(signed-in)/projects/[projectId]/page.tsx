import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { API_ROUTES } from "@cog/contracts";
import { Absent, Money, Refusal, Section, Stat, StatRow, UnreachableState, load } from "@cog/design-system";
import { apiAsCaller } from "../../../../lib/api";

export const dynamic = "force-dynamic";

/**
 * Progress — the project's default tab, `10-portals.html`'s Progress screen.
 *
 * **The milestone list is not shown, because it does not exist.** The
 * design's sample draws a "Milestones reached 50%" hero and a four-row
 * `.mstones` list (On signing, GFC drawings issued, Substantial completion,
 * Snag closure), each with its own percentage of contract value and date.
 * `clientPortalProject` (`packages/contracts/src/api/projects.ts`) has none
 * of that — no milestone list, no per-milestone percentage, no "week N" or
 * planned-completion date. **HUMAN(DATA-client-portal-milestones):** a
 * milestones endpoint (or fields on this response) would be needed to build
 * the design's hero and list; per `STAGE4-COMMON` the figure renders
 * `Absent` rather than a fabricated 50%.
 *
 * What the response DOES carry — the four counts below — is real, and is
 * what "Progress" means on this screen until milestones exist.
 */
export default async function ClientProgressPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<ReactNode> {
  const { projectId } = await params;
  const projects = await load(
    await apiAsCaller(),
    API_ROUTES.clientPortalProjects,
    {},
  );

  if (projects.kind === "unreachable") return <UnreachableState />;
  if (projects.kind === "refused") return <Refusal error={projects.error} />;

  // The layout above already 404s when this id is not this client's — found
  // here again only because a page fetches its own data independently of its
  // layout.
  const project = projects.data.items.find((p) => p.id === projectId);
  if (project === undefined) notFound();

  return (
    <>
      <div className="pgh">
        <h1 className="pt">Progress</h1>
        <p className="ps">
            {project.lastReportOn === null
              ? "Nothing reported from site yet"
              : `Last reported ${project.lastReportOn}`}
          </p>
      </div>

      <StatRow n={4}>
        <Stat
          label="Contract value"
          value={<Money wire={project.contractValue} />}
          note="as signed"
        />
        <Stat
          label="Days reported"
          value={project.reportedDays}
          note={
            project.lastReportOn === null
              ? "nothing reported yet"
              : `last on ${project.lastReportOn}`
          }
        />
        <Stat
          label="Drawings issued"
          value={project.drawingsIssued}
          note="current revisions"
        />
        <Stat
          label="Measurements signed"
          value={project.measurementsRecorded}
          note="jointly recorded on site"
        />
      </StatRow>

      <Section bare title="Milestones">
        <div className="card-b">
          <Stat
            label="Milestones reached"
            value={
              <Absent why="Milestones are not shared with the portal yet." />
            }
          />
          <p className="muted">
            This project does not yet track named milestones (on signing,
            drawings issued, substantial completion, snag closure) as a
            percentage of contract value — only the counts above are recorded
            today.
          </p>
        </div>
      </Section>
    </>
  );
}
