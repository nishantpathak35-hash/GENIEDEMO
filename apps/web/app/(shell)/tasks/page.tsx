import type { ReactNode } from 'react';
import { API_ROUTES, type Task } from '@cog/contracts';
import { apiAsCaller } from '../../../lib/api';
import { PageHeader, load } from '@cog/design-system';
import { Empty, FilterChips, Icon, Pager, Section, Refusal, Stat, StatRow, UnreachableState, type FilterChip } from '@cog/design-system';
import { DeleteTaskButton, EditTaskForm } from './forms';
import { NewTaskDrawer } from './new-task-drawer';
import { TaskFilters } from './task-filters';
import { pageLinks, pageState } from '../../../lib/paging';

export const metadata = { title: 'Tasks · Construct-O-Genie' };
export const dynamic = 'force-dynamic';

/**
 * Tasks.
 *
 * The legacy splits these into an inbox and a delegated list by comparing
 * `assigned_to` to the signed-in address in the browser
 * (`TasksView.js:109-112`), which is a filter, not a control — every task in
 * the tenant is already in the array being filtered. Here the endpoint returns
 * what the caller may see and the server orders it open-first, by due date —
 * the screen groups nothing itself.
 *
 * Nothing on this screen is money, so nothing on it is a total.
 *
 * **Filters, sort and the stat row are the SERVER's.** `listTasks` takes
 * `person` (`assignedTo`) and `about` (`entityType`) as query parameters and
 * applies both to the same window it counts; the "Due today" / "Open" /
 * "Overdue" figures and the assignee counts come from `summary`, computed by
 * SQL over the WHOLE tenant under no filter and no cursor — never by scanning
 * `items`, which is one page of whichever filter is active.
 *
 * **"About" has no closed set.** `createTaskInput.entityType` is
 * `z.string().max(60).optional()` — free text, not an enum — and the seed
 * only ever writes `'project'`. The design's five named options (An approval,
 * A lead, Buying, A project, A variation) are not a vocabulary this model
 * has, so the filter is built from `summary.entityTypes` — the distinct
 * values the tenant's own tasks actually carry, over the whole tenant, not
 * just this page — HUMAN(DATA) noted in the report rather than faked as a
 * fixed list.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const personFilter = params['person'] !== undefined && params['person'] !== '' ? params['person'] : undefined;
  const aboutFilter = params['about'] !== undefined && params['about'] !== '' ? params['about'] : undefined;
  const anyFilterApplied = personFilter !== undefined || aboutFilter !== undefined;

  const paging = pageState(params);
  const listQuery = {
    ...paging.query,
    ...(personFilter === undefined ? {} : { assignedTo: personFilter }),
    ...(aboutFilter === undefined ? {} : { entityType: aboutFilter }),
  };

  const client = await apiAsCaller();
  const [tasks, everyTask, people, projects] = await Promise.all([
    load(client, API_ROUTES.listTasks, { query: listQuery }),
    // the unfiltered total for the subtitle, one row's worth of it
    anyFilterApplied ? load(client, API_ROUTES.listTasks, { query: { limit: '1' } }) : null,
    // a lookup: the widest window the endpoint allows
    load(client, API_ROUTES.listPrincipals, { query: { limit: '200' } }),
    // a lookup: the widest window the endpoint allows
    load(client, API_ROUTES.listProjects, { query: { limit: '200' } }),
  ]);

  if (tasks.kind === 'unreachable') return <UnreachableState />;
  if (tasks.kind === 'refused') return <Refusal error={tasks.error} />;

  const totalCount = everyTask !== null && everyTask.kind === 'ok' ? everyTask.data.count : tasks.data.count;

  const peopleOptions =
    people.kind === 'ok'
      ? people.data.items.filter((p) => !p.disabled).map((p) => [p.id, p.email] as const)
      : [];
  const projectOptions =
    projects.kind === 'ok'
      ? projects.data.items.map((p) => [p.id, `${p.code} — ${p.name}`] as const)
      : [];
  const emailOf = new Map(peopleOptions);

  const { summary } = tasks.data;
  const aboutOptions = summary.entityTypes.map((value) => [value, aboutLabel(value)] as const);
  const dueTodayNames = summary.dueTodayAssignees.map((id) => localPart(emailOf.get(id) ?? id));

  const chips: FilterChip[] = [];
  if (personFilter !== undefined) {
    chips.push({
      key: 'person',
      label: 'Person',
      value: emailOf.get(personFilter) ?? personFilter,
      removeHref: taskHref({ person: undefined, about: aboutFilter }),
    });
  }
  if (aboutFilter !== undefined) {
    chips.push({
      key: 'about',
      label: 'About',
      value: aboutLabel(aboutFilter),
      removeHref: taskHref({ person: personFilter, about: undefined }),
    });
  }

  // A change of filter drops the window — a cursor is a position in one
  // filtered order, so `hrefFor` starts every non-paging change from page one.
  const hrefFor = (overrides: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const pagingChange = 'cursor' in overrides;
    const merged: Record<string, string | undefined> = {
      person: personFilter,
      about: aboutFilter,
      ...(pagingChange
        ? { cursor: params['cursor'], dir: params['dir'], from: params['from'] }
        : {}),
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== '') next.set(key, value);
    }
    const qs = next.toString();
    return qs === '' ? '/tasks' : `/tasks?${qs}`;
  };
  const links = pageLinks(paging, tasks.data, hrefFor);

  return (
    <>
      <PageHeader
        title="Tasks"
        help="See what is due today and who is holding it, before the day is gone."
        sub={
          <>
            {summary.open} open · {summary.dueToday} due today · across {summary.peopleWithOpenTasks} {summary.peopleWithOpenTasks === 1 ? 'person' : 'people'}
          </>
        }
        {...(peopleOptions.length === 0 ? {} : { primary: <NewTaskDrawer people={peopleOptions} projects={projectOptions} /> })}
        tabs={
          <nav className="subtabs" aria-label="Views">
            <a href="/approvals">Approvals</a>
            <a href="/tasks" aria-current="page">
              Tasks
            </a>
          </nav>
        }
      />

      <StatRow n={3}>
        <Stat
          label="Due today"
          value={summary.dueToday}
          {...(dueTodayNames.length === 0 ? {} : { note: dueTodayNames.join(' · ') })}
        />
        {/* No delta: no endpoint reports last week's open-task count, so the
            design's "↓ 3 this week" trend is not shown. HUMAN(DATA) in the report. */}
        <Stat label="Open, all people" value={summary.open} />
        <Stat
          label="Overdue"
          value={summary.overdue}
          {...(summary.overdue === 0
            ? {}
            : {
                note: `${summary.overdueAssignees.length} ${summary.overdueAssignees.length === 1 ? 'person' : 'people'}`,
              })}
        />
      </StatRow>

      <Section bare title="All tasks" sub={`${totalCount} ${totalCount === 1 ? 'task' : 'tasks'}`}>
        <TaskFilters
          people={peopleOptions}
          about={aboutOptions}
          {...(personFilter === undefined ? {} : { person: personFilter })}
          {...(aboutFilter === undefined ? {} : { aboutValue: aboutFilter })}
        />
        <FilterChips
          applied={chips}
          clearAllHref="/tasks"
          {...(chips.length === 0 ? {} : { count: { shown: tasks.data.count, of: totalCount } })}
        />
        {tasks.data.count === 0 ? (
          chips.length > 0 ? (
            <Empty variant="filtered" illustration="search" title="No tasks match">
              {chips.map((c) => `${c.label} “${c.value}”`).join(' and ')} matched nothing. Clear a
              filter to see more.
            </Empty>
          ) : (
            <Empty
              illustration="tasks"
              title="Nothing here yet"
              {...(peopleOptions.length === 0
                ? {}
                : { action: <NewTaskDrawer people={peopleOptions} projects={projectOptions} /> })}
            >
              Raise one to get started.
            </Empty>
          )
        ) : (
          <>
            <TaskList tasks={tasks.data.items} todayKey={kolkataDateKey(new Date())} emailOf={emailOf} people={peopleOptions} />
            <Pager
              shown={links.shown}
              of={tasks.data.count}
              unit={tasks.data.count === 1 ? 'task' : 'tasks'}
              next={links.next}
              prev={links.prev}
              {...(chips.length === 0 ? {} : { filteredFrom: totalCount })}
            />
          </>
        )}
      </Section>
    </>
  );
}

/** The list itself: a tick, the title (opens the edit form), an avatar, a due badge. */
function TaskList({
  tasks,
  todayKey,
  emailOf,
  people,
}: {
  tasks: readonly Task[];
  todayKey: string;
  emailOf: ReadonlyMap<string, string>;
  people: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  return (
    <ul className="list tasks">
      {tasks.map((t) => {
        const closed = t.status === 'completed' || t.status === 'cancelled';
        const email = emailOf.get(t.assignedTo) ?? t.assignedTo.slice(0, 8);
        return (
          <li key={t.id} {...(closed ? { className: 'muted' } : {})}>
            <span className="tick" aria-hidden="true">
              {t.status === 'completed' ? <Icon name="check" size="sm" /> : null}
            </span>
            <div>
              <details>
                <summary>{t.title}</summary>
                <div className="u-py-5">
                  <EditTaskForm
                    people={people}
                    task={{
                      id: t.id,
                      title: t.title,
                      description: t.description,
                      assignedTo: t.assignedTo,
                      dueDate: t.dueDate ?? '',
                      priority: t.priority,
                      status: t.status,
                      notes: t.notes,
                      version: String(t.version),
                    }}
                  />
                  <DeleteTaskButton taskId={t.id} />
                </div>
              </details>
              <small>{email}</small>
            </div>
            <span className="avatar" aria-hidden="true">
              {email.slice(0, 1).toUpperCase()}
            </span>
            <span className={dueClassName(t, todayKey)}>{dueLabel(t, todayKey)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function dueClassName(t: Task, todayKey: string): string {
  if (t.status === 'completed' || t.status === 'cancelled') return 'due';
  return t.dueDate === todayKey ? 'due today' : 'due';
}

function dueLabel(t: Task, todayKey: string): string {
  if (t.status === 'completed') return `Done${t.completedAt === null ? '' : ` · ${shortDate(t.completedAt)}`}`;
  if (t.status === 'cancelled') return 'Cancelled';
  if (t.dueDate === null) return 'No date';
  if (t.dueDate === todayKey) return 'Today';
  if (t.dueDate === tomorrowOf(todayKey)) return 'Tomorrow';
  if (t.dueDate < todayKey) return `Overdue · ${shortDate(t.dueDate)}`;
  return shortDate(t.dueDate);
}

/** `YYYY-MM-DD` for an instant, in the tenant's zone. Duplicated from the
 * Today page's own local helper rather than imported — that file is not
 * ours to change. */
function kolkataDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function tomorrowOf(todayKey: string): string {
  return kolkataDateKey(new Date(Date.parse(`${todayKey}T00:00:00Z`) + DAY_MS));
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' }).format(
    new Date(`${iso}T00:00:00+05:30`),
  );
}

function aboutLabel(entityType: string): string {
  const spaced = entityType.replace(/_/g, ' ');
  const first = spaced.charAt(0);
  return first === '' ? spaced : first.toUpperCase() + spaced.slice(1);
}

function localPart(email: string): string {
  return email.split('@')[0] ?? email;
}

function taskHref(next: { readonly person: string | undefined; readonly about: string | undefined }): string {
  const qs = new URLSearchParams();
  if (next.person !== undefined) qs.set('person', next.person);
  if (next.about !== undefined) qs.set('about', next.about);
  const s = qs.toString();
  return s.length === 0 ? '/tasks' : `/tasks?${s}`;
}
