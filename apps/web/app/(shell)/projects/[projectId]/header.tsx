import type { ReactNode } from 'react';
import { API_ROUTES, type Project } from '@cog/contracts';
import { Icon, Money, Notice, PageHeader, Pill, load } from '@cog/design-system';
import { apiAsCaller } from '../../../../lib/api';
import { projectStateLabel, projectStateTone } from '../vocabulary';

/**
 * The header every page inside a project carries (`docs/design/06-projects.html`,
 * `projHead`): the project's code as the first crumb, then the section the
 * sidebar files the page under, then the page's own title; under it the
 * project's name, its state and its contract value. The switcher in the bar
 * names the same project, so the crumb and the switcher agree.
 */
/** Handed over, closed or lost: read-only, and the server refuses every write on it (06-projects). */
export function isReadOnly(project: Pick<Project, 'state'>): boolean {
  return project.state === 'handed_over' || project.state === 'closed' || project.state === 'lost';
}

/** The read-only banner under the header: what is still worked from the project, and what is not. */
export function ReadOnlyBanner({ project }: { project: Project }): ReactNode {
  if (!isReadOnly(project)) return null;
  const title =
    project.state === 'handed_over' ? `Read-only · handed over${project.handedOverOn === null ? '' : ` on ${project.handedOverOn}`}` : project.state === 'closed' ? 'Closed · final' : 'Lost · final';
  return (
    <Notice tone="info" title={title} icon={<Icon name="info" />}>
      {project.state === 'handed_over'
        ? `Snags, final bills and retention are still worked from here, from Money. Nothing else on ${project.code} can be raised or changed; everything stays readable and exportable.`
        : `Nothing on ${project.code} can be raised or changed; everything stays readable and exportable.`}
    </Notice>
  );
}

export function ProjectPageHeader({
  project,
  section,
  title,
  help,
  status,
  actions,
  more,
  primary,
  tabs,
  sub,
}: {
  project: Project;
  /** The sidebar section — Overview, Design, Build, Commercial, People, Close. */
  section: string;
  title: ReactNode;
  help?: string;
  status?: ReactNode;
  actions?: ReactNode;
  more?: ReactNode;
  primary?: ReactNode;
  tabs?: ReactNode;
  /** In place of the project's own line, when the page has a better one. */
  sub?: ReactNode;
}): ReactNode {
  // a project no longer worked offers no primary: the server would refuse it
  const readOnly = isReadOnly(project);
  return (
    <>
      <PageHeader
        crumbs={[
          { href: `/projects/${project.id}`, label: project.code },
          { href: `/projects/${project.id}`, label: section },
        ]}
        title={title}
        {...(help === undefined ? {} : { help })}
        {...(status === undefined ? {} : { status })}
        {...(actions === undefined ? {} : { actions })}
        {...(more === undefined ? {} : { more })}
        {...(primary === undefined || readOnly ? {} : { primary })}
        {...(tabs === undefined ? {} : { tabs })}
        sub={
          sub ?? (
            <>
              {project.name} · <Pill tone={projectStateTone(project.state)}>{projectStateLabel(project.state)}</Pill> ·{' '}
              <span className="nowrap">
                contract <Money wire={project.originalValue} />
              </span>
            </>
          )
        }
      />
      <ReadOnlyBanner project={project} />
    </>
  );
}

/**
 * The same header, reading the project itself — for a page that holds
 * nothing else about the project. The read is the one the layout made a
 * moment earlier; Next dedupes it within the render.
 */
export async function ProjectHead(props: { projectId: string } & Omit<Parameters<typeof ProjectPageHeader>[0], 'project'>): Promise<ReactNode> {
  const { projectId, ...rest } = props;
  const project = await load(await apiAsCaller(), API_ROUTES.getProject, { params: { projectId } });
  if (project.kind !== 'ok') return null;
  return <ProjectPageHeader project={project.data} {...rest} />;
}
